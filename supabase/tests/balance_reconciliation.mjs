// Local-only executable integration test. Never accepts a database URL.
// node supabase/tests/balance_reconciliation.mjs <absolute path to installed @electric-sql/pglite/dist/index.js>
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const account = '81000000-0000-0000-0000-000000000001';
const liability = '81000000-0000-0000-0000-000000000002';
await db.exec(`
  create role authenticated; create role anon; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  create table accounts(id uuid primary key, account_class text not null, currency text not null, is_active boolean not null);
  create table balance_snapshots(id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts(id),
    snapshot_at timestamptz not null default now(), balance numeric(14,2) not null check(balance>=0),
    source text not null default 'manual' check(source in ('manual','import','system')), note text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(account_id,snapshot_at));
  create table journal_entries(id uuid primary key, occurred_at timestamptz not null, status text not null);
  create table journal_lines(id uuid primary key, entry_id uuid references journal_entries(id), account_id uuid references accounts(id), amount numeric not null);
  create table budget_impacts(id uuid primary key, amount numeric);
  insert into accounts values ('${account}','asset','CNY',true), ('${liability}','liability','CNY',true);
  insert into balance_snapshots(account_id,snapshot_at,balance) values ('${account}','2025-01-01T00:00:00Z',500),('${liability}','2025-01-01T00:00:00Z',100);
  insert into journal_entries values ('82000000-0000-0000-0000-000000000001','2025-01-02T00:00:00Z','confirmed'),
    ('82000000-0000-0000-0000-000000000002','2025-01-03T00:00:00Z','confirmed'),
    ('82000000-0000-0000-0000-000000000003','2025-01-02T00:00:00Z','draft');
  insert into journal_lines values (gen_random_uuid(),'82000000-0000-0000-0000-000000000001','${account}',-75.10),
    (gen_random_uuid(),'82000000-0000-0000-0000-000000000002','${account}',-10),
    (gen_random_uuid(),'82000000-0000-0000-0000-000000000003','${account}',-999),
    (gen_random_uuid(),'82000000-0000-0000-0000-000000000001','${liability}',25);
  grant select,insert,update,delete on all tables in schema public to authenticated;
  alter table balance_snapshots enable row level security;
  create policy authenticated_full_access_balance_snapshots on balance_snapshots for all to authenticated using(true) with check(true);
`);
// --red proves the assertion fails before the migration exists; fixture only.
if (!process.argv.includes('--red')) await db.exec(await readFile(new URL('../migrations/202609080002_balance_reconciliation.sql', import.meta.url),'utf8'));
const functions = await db.query("select proname from pg_proc where proname='reconcile_account_balance'");
assert.equal(functions.rows.length,1,'reconciliation RPC must exist');
await db.exec("set role authenticated; set request.jwt.claim.sub='80000000-0000-0000-0000-000000000001'");
const preview = async (id=account, time='2025-01-02T00:00:00Z') =>
  (await db.query('select * from public.preview_balance_reconciliation($1,$2)',[id,time])).rows[0];
const initial = await preview();
assert.equal(Number(initial.estimated_balance),424.90,'includes transaction at observation time');
const totalsBefore = (await db.query('select (select count(*) from journal_entries) entries,(select sum(amount) from journal_lines) ledger,(select count(*) from budget_impacts) impacts')).rows[0];
const request = '83000000-0000-0000-0000-000000000001';
const save = async (id=request, balance=423.5, basis=initial, accountId=account, time='2025-01-02T00:00:00Z') =>
  (await db.query('select * from public.reconcile_account_balance($1,$2,$3,$4,$5,$6,$7)',
    [id,accountId,time,balance,'checked',basis.estimated_balance,basis.latest_snapshot_id])).rows[0];
assert.equal((await save()).replayed,false);
assert.equal((await save()).replayed,true);
assert.equal(Number((await preview()).estimated_balance),423.5,'transaction at snapshot time not counted twice');
assert.equal(Number((await preview(account,'2025-01-03T00:00:00Z')).estimated_balance),413.5,'only subsequent changes are added');
await assert.rejects(save(request,422),/request_payload_conflict/);
await assert.rejects(save('83000000-0000-0000-0000-000000000002',420,initial),/stale_reconciliation_preview/);
for (const invalid of [-1,'NaN','Infinity',1.001,1e12]) {
  await assert.rejects(save('83000000-0000-0000-0000-000000000003',invalid),/invalid_snapshot_balance/);
}
await assert.rejects(preview(account,'2999-01-01'),/invalid_snapshot_time/);
const debt = await preview(liability);
assert.equal(Number(debt.estimated_balance),125);
await save('83000000-0000-0000-0000-000000000004',0,debt,liability);
assert.equal(Number((await preview(liability)).estimated_balance),0,'zero debt stored without flipping sign');
const older = await preview(account,'2025-01-01T12:00:00Z');
assert.equal(older.has_later_snapshot,true);
await save('83000000-0000-0000-0000-000000000005',490,older,account,'2025-01-01T12:00:00Z');
assert.equal(Number((await preview(account,'2025-01-03T00:00:00Z')).estimated_balance),413.5,'newer snapshot remains authoritative');
const current = await preview();
await assert.rejects(save('83000000-0000-0000-0000-000000000006',420,current),/snapshot_time_conflict/);
await db.exec(`update accounts set is_active=false where id='${account}'`);
await assert.rejects(preview(),/account_inactive/);
await db.exec(`update accounts set is_active=true where id='${account}'; set request.jwt.claim.sub=''`);
await assert.rejects(preview(),/authentication_required/);
await db.exec("set role anon");
await assert.rejects(preview(),/permission denied/);
await db.exec("reset role");
// Fail after INSERT, proving the function's statement rolls the row back.
await db.exec(`
  create function fail_test_snapshot() returns trigger language plpgsql as $$ begin raise exception 'injected_snapshot_failure'; end $$;
  create trigger fail_test_snapshot after insert on balance_snapshots for each row execute function fail_test_snapshot();
  set role authenticated; set request.jwt.claim.sub='80000000-0000-0000-0000-000000000001';
`);
const afterTime = '2025-01-04T00:00:00Z';
const afterBasis = await preview(account, afterTime);
await assert.rejects(save('83000000-0000-0000-0000-000000000007',400,afterBasis,account,afterTime),/injected_snapshot_failure/);
await db.exec('reset role; drop trigger fail_test_snapshot on balance_snapshots; drop function fail_test_snapshot()');
const totalsAfter = (await db.query('select (select count(*) from journal_entries) entries,(select sum(amount) from journal_lines) ledger,(select count(*) from budget_impacts) impacts')).rows[0];
assert.deepEqual(totalsAfter,totalsBefore,'no journal or budget mutations');
const count = await db.query('select count(*) n from balance_snapshots');
assert.equal(Number(count.rows[0].n),5,'failed calls and replay do not create extra rows');
console.log('PASS: isolated PostgreSQL reconciliation behavior, role permissions, boundaries, idempotency and no journal/budget writes');
await db.close();
