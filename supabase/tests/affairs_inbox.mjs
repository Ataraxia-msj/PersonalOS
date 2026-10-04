// Disposable in-memory PostgreSQL only. Argument is a local PGlite module, never a DB URL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
const file = p => readFile(new URL(p, import.meta.url), 'utf8');
const rows = async (q,p=[]) => (await db.query(q,p)).rows;
const one = async (q,p=[]) => (await rows(q,p))[0];
const ownerA='a0000000-0000-0000-0000-000000000001', ownerB='b0000000-0000-0000-0000-000000000002';
const login = async owner => db.exec(`reset role; set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${owner}';set role authenticated`);
try {
 await db.exec(await file('./fixtures/transfer_base.sql'));
 await db.exec(await file('./fixtures/affairs_base.sql'));
 await db.exec(await file('../migrations/202610030005_affairs_foundation.sql'));
 await db.exec(await file('../migrations/202610030006_affairs_rewards.sql'));
 const financeSnapshot = async () => ({
  grants:await rows("select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name not like 'affairs_%' and table_name not like 'vw_affairs_%' order by 1,2,3"),
  columns:await rows("select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name not like 'affairs_%' and table_name not like 'vw_affairs_%' order by 1,2"),
  views:await rows("select viewname,definition from pg_views where schemaname='public' and viewname not like 'vw_affairs_%' order by 1"),
  policies:await rows("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename not like 'affairs_%' order by 1,2"),
  counts:await one('select (select count(*) from accounts) accounts,(select count(*) from journal_entries) entries,(select count(*) from journal_lines) lines,(select count(*) from budget_impacts) impacts')
 });
 const before=await financeSnapshot();
 const oldRpcs=await rows("select oid::regprocedure::text signature,pg_get_function_result(oid) result from pg_proc where pronamespace='public'::regnamespace order by 1");
 if(!process.argv.includes('--red')) {
  let sql=await file('../migrations/202610040001_affairs_inbox.sql');
  if(process.argv.includes('--red-resolve')) sql=sql.split('-- AFFAIRS_INBOX_RESOLVE_START')[0]+'\ncommit;';
  await db.exec(sql);
 }
 assert.equal((await one("select to_regclass('public.affairs_inbox_entries')::text name")).name,'affairs_inbox_entries','missing affairs_inbox_entries');
 await db.exec(await file('./affairs_inbox.sql'));
 assert.equal(Number((await one('select count(*) n from affairs_inbox_entries')).n),0,'no seed');
 for(const r of oldRpcs) assert.deepEqual(await one('select oid::regprocedure::text signature,pg_get_function_result(oid) result from pg_proc where oid=to_regprocedure($1)',[r.signature]),r,'old RPC signature unchanged');
 await login(ownerA);
 const request=(await one('select gen_random_uuid() id')).id;
 const content='读论文 📖\n做实验';
 const created=await one('select * from create_affairs_inbox_entry($1,$2)',[request,'  '+content+'  ']);
 assert.equal(created.coin_delta,0);
 assert.equal(String(created.object_revision),'1');
 const replay=await one('select * from create_affairs_inbox_entry($1,$2)',[request,content]);
 assert.equal(replay.object_id,created.object_id); assert.equal(replay.replayed,true);
 await assert.rejects(db.query('select * from create_affairs_inbox_entry($1,$2)',[request,'different']),/request_payload_conflict/);
 assert.equal((await one('select content from affairs_inbox_entries where id=$1',[created.object_id])).content,content);
 for(const text of ['', '  ', 'a'.repeat(4001)]) await assert.rejects(db.query('select * from create_affairs_inbox_entry(gen_random_uuid(),$1)',[text]),/invalid_payload/);
 const boundary=await one('select * from create_affairs_inbox_entry(gen_random_uuid(),$1)',['😀'.repeat(4000)]);
 assert.equal(Number((await one('select char_length(content) n from affairs_inbox_entries where id=$1',[boundary.object_id])).n),4000);
 const updated=await one('select * from update_affairs_inbox_entry(gen_random_uuid(),$1,1,$2)',[created.object_id,'New\ncontent']);
 assert.equal(String(updated.object_revision),'2');
 await assert.rejects(db.query('select * from update_affairs_inbox_entry(gen_random_uuid(),$1,1,$2)',[created.object_id,'stale']),/stale_revision/);
 await one('select * from discard_affairs_inbox_entry(gen_random_uuid(),$1,2)',[created.object_id]);
 await assert.rejects(db.query('select * from update_affairs_inbox_entry(gen_random_uuid(),$1,3,$2)',[created.object_id,'discarded']),/invalid_state_transition/);
 await one('select * from restore_affairs_inbox_entry(gen_random_uuid(),$1,3)',[created.object_id]);
 const restored=await one('select * from affairs_inbox_entries where id=$1',[created.object_id]);
 assert.equal(restored.status,'pending'); assert.equal(restored.discarded_at,null); assert.equal(String(restored.revision),'4');
 await assert.rejects(db.query('select * from restore_affairs_inbox_entry(gen_random_uuid(),$1,4)',[created.object_id]),/invalid_state_transition/);
 for(const q of ["insert into affairs_inbox_entries(user_id,content) values(auth.uid(),'illegal')","update affairs_inbox_entries set content='illegal'","delete from affairs_inbox_entries"]) await assert.rejects(db.exec(q),/permission denied/);
 await login(ownerB);
 assert.equal((await rows('select * from affairs_inbox_entries')).length,0,'owner isolation');
 await assert.rejects(db.query('select * from discard_affairs_inbox_entry(gen_random_uuid(),$1,4)',[created.object_id]),/not_found/);
 const btask=await one("select * from create_affairs_task(gen_random_uuid(),'{\"title\":\"B task\"}')");
 await db.exec('reset role');
 await assert.rejects(db.query("insert into affairs_inbox_entries(user_id,content,status,resolved_task_id,resolved_at) values($1,'cross','resolved',$2,now())",[ownerA,btask.object_id]),/foreign key/);
 await assert.rejects(db.query("insert into affairs_inbox_entries(user_id,content,status) values($1,'invalid','resolved')",[ownerA]),/check constraint/);
 await db.exec("set role anon;set request.jwt.claim.role='anon'");
 await assert.rejects(db.exec('select * from affairs_inbox_entries'),/permission denied/);
 await assert.rejects(db.exec("select * from create_affairs_inbox_entry(gen_random_uuid(),'illegal')"),/permission denied/);
 await db.exec('reset role');
 if(!process.argv.includes('--capture-only')) {
  assert.equal((await one("select count(*)::int n from pg_proc where proname='resolve_affairs_inbox_entry'")).n,1,'missing resolve_affairs_inbox_entry');
  // Resolve-specific assertions run after Task 2 adds the companion SQL.
  await db.exec(await file('./affairs_inbox_resolve.sql'));
 }
 assert.deepEqual(await financeSnapshot(),before,'Finance untouched');
 console.log('PASS affairs inbox: owner RLS, capture lifecycle, Unicode, revisions, idempotency, auth-only, no DML, Finance/RPC contracts unchanged');
} finally { await db.close(); }
