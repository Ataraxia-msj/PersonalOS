// Disposable PostgreSQL. Accepts a local module filename, never a DB URL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
const rows = async (q, p=[]) => (await db.query(q,p)).rows;
const one = async (q,p=[]) => (await rows(q,p))[0];
const file = async p => readFile(new URL(p,import.meta.url),'utf8');
await db.exec(await file('./fixtures/transfer_base.sql'));
await db.exec(await file('./fixtures/affairs_base.sql'));
const financeSnapshot = async () => ({
  grants: await rows("select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name not like 'affairs_%' and table_name not like 'vw_affairs_%' order by 1,2,3"),
  views: await rows("select viewname,definition from pg_views where schemaname='public' and viewname not like 'vw_affairs_%' order by 1"),
  policies: await rows("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename not like 'affairs_%' order by 1,2"),
  counts: await one('select (select count(*) from accounts) accounts,(select count(*) from journal_entries) entries,(select count(*) from journal_lines) lines,(select count(*) from budget_impacts) impacts'),
  columns: await rows("select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name not like 'affairs_%' and table_name not like 'vw_affairs_%' order by 1,2")
});
const before = await financeSnapshot();
if (!process.argv.includes('--red')) {
  let migration = await file('../migrations/202610030005_affairs_foundation.sql');
  if (process.argv.includes('--red-rpcs') && migration.includes('-- AFFAIRS_PUBLIC_RPCS_START')) migration=migration.split('-- AFFAIRS_PUBLIC_RPCS_START')[0]+'\ncommit;';
  await db.exec(migration);
}
assert.equal((await one("select to_regclass('public.affairs_mainlines')::text name")).name,'affairs_mainlines','missing affairs_mainlines');
await db.exec(await file('./affairs_foundation.sql'));
assert.deepEqual(await financeSnapshot(),before,'Finance untouched');
for(const table of ['mainlines','projects','milestones','tasks','progress_entries','wallets','commands']) {
  assert.equal(Number((await one(`select count(*) n from affairs_${table}`)).n),0,'no seeds');
}
await db.exec("insert into affairs_mainlines(user_id,name) values ('a0000000-0000-0000-0000-000000000001','Owner A'),('b0000000-0000-0000-0000-000000000002','Owner B')");
await assert.rejects(db.exec("insert into affairs_mainlines(user_id,name) values ('c0000000-0000-0000-0000-000000000003','missing auth user')"),/foreign key/);
const ownerB = await one("select id from affairs_mainlines where name='Owner B'");
await assert.rejects(db.query("insert into affairs_projects(user_id,mainline_id,name,outcome) values ('a0000000-0000-0000-0000-000000000001',$1,'Cross owner','Impossible')",[ownerB.id]),/foreign key/);
assert.ok((await rows("select indexname from pg_indexes where tablename='affairs_progress_entries'")).some(i=>i.indexname==='affairs_progress_active_completion'));
await assert.rejects(db.exec("insert into affairs_tasks(user_id,title,is_core) values ('a0000000-0000-0000-0000-000000000001','Incomplete core',true)"),/check constraint/);
await db.exec("set role authenticated; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='a0000000-0000-0000-0000-000000000001'");
assert.deepEqual((await rows('select name from affairs_mainlines')).map(r=>r.name),['Owner A']);
for(const verb of ["insert into affairs_mainlines(user_id,name) values (auth.uid(),'illegal')","update affairs_mainlines set name='illegal'","delete from affairs_mainlines"]) await assert.rejects(db.exec(verb),/permission denied/);
await db.exec("reset role; set role anon; set request.jwt.claim.role='anon'");
await assert.rejects(db.exec('select * from affairs_mainlines'),/permission denied/);
await db.exec('reset role');
const hasRpcs=(await one("select count(*)::int n from pg_proc where proname='create_affairs_mainline'")).n;
assert.equal(hasRpcs,1,'missing create_affairs_mainline RPC');
await db.exec(await file('./affairs_foundation_rpcs.sql'));
console.log('PASS affairs foundation: empty schema, auth FK, owner RLS, no direct writes, private isolation, Finance unchanged');
await db.close();
