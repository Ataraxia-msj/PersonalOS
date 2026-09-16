// Disposable, in-memory PostgreSQL only. Never accepts a database URL.
// node supabase/tests/income_transactions.mjs <absolute @electric-sql/pglite/dist/index.js> [--red]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = async (query, args = []) => (await db.query(query, args)).rows;
const one = async (query, args = []) => (await sql(query, args))[0];

await db.exec(await readFile(new URL('./fixtures/transfer_base.sql', import.meta.url), 'utf8'));
const grantsBefore = await sql("select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' order by 1,2,3");
const viewsBefore = await sql("select viewname,definition from pg_views where schemaname='public' order by 1");
const policiesBefore = await sql("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by 1,2");
if (!process.argv.includes('--red')) {
  await db.exec(await readFile(new URL('../migrations/202609150001_income_transactions.sql', import.meta.url), 'utf8'));
}

assert.equal((await sql("select 1 from pg_proc where proname='create_income_transaction'")).length, 1, 'income RPC must exist');
assert.deepEqual(await sql("select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' order by 1,2,3"), grantsBefore);
assert.deepEqual(await sql("select viewname,definition from pg_views where schemaname='public' order by 1"), viewsBefore);
assert.deepEqual(await sql("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by 1,2"), policiesBefore);

const asset = randomUUID();
const liability = randomUUID();
const inactive = randomUUID();
const incomeCategory = randomUUID();
const expenseCategory = randomUUID();

await sql("insert into accounts(id,name,account_class,account_type,currency,is_active) values($1,'income asset','asset','bank','CNY',true),($2,'income debt','liability','loan','CNY',true),($3,'inactive asset','asset','bank','CNY',false)", [asset, liability, inactive]);
await sql("insert into balance_snapshots(account_id,snapshot_at,balance) values($1,'2025-01-01T00:00:00Z',1000),($2,'2025-01-01T00:00:00Z',300)", [asset, liability]);
await sql("insert into categories(id,name,category_type,is_active) values($1,'salary','income',true),($2,'food','expense',true)", [incomeCategory, expenseCategory]);
await sql("insert into budget_periods(start_date,end_date,planned_income,currency,status) values('2025-02-01','2025-02-28',5000,'CNY','active')");

const request = () => ({
  id: randomUUID(),
  time: '2025-02-15T09:00:00+08',
  description: 'salary',
  account: asset,
  amount: 8500,
  category: incomeCategory,
  raw: null,
  memo: null,
});
async function income(input = {}) {
  const p = { ...request(), ...input };
  return one('select * from public.create_income_transaction($1,$2,$3,$4,$5,$6,$7,$8)',
    [p.id, p.time, p.description, p.account, p.amount, p.category, p.raw, p.memo]);
}
const totals = () => one('select (select count(*)::int from journal_entries) entries,(select count(*)::int from journal_lines) lines,(select count(*)::int from budget_impacts) impacts');
async function rejects(promiseFactory, pattern) {
  await db.exec('savepoint expected_error');
  try { await assert.rejects(promiseFactory, pattern); }
  finally { await db.exec('rollback to savepoint expected_error; release savepoint expected_error'); }
}
let passed = 0;
async function test(name, fn) {
  await db.exec("begin; set local role authenticated; set local request.jwt.claim.sub='89000000-0000-0000-0000-000000000001'");
  try { await fn(); passed++; console.log('PASS:', name); }
  finally { await db.exec('rollback'); }
}

await test('income creates one positive asset line and updates true View metrics', async () => {
  const result = await income();
  assert.equal(result.replayed, false);
  const entry = await one('select * from journal_entries where id=$1', [result.entry_id]);
  assert.equal(entry.entry_type, 'income'); assert.equal(entry.source, 'manual'); assert.equal(entry.status, 'confirmed');
  const line = await one('select * from journal_lines where id=$1', [result.line_id]);
  assert.equal(line.account_id, asset); assert.equal(line.category_id, incomeCategory); assert.equal(Number(line.amount), 8500); assert.equal(line.sort_order, 0);
  assert.deepEqual(await totals(), { entries: 1, lines: 1, impacts: 0 });
  assert.equal(Number((await one("select estimated_balance from vw_account_balances where account_id=$1", [asset])).estimated_balance), 9500);
  const summary = await one("select * from vw_monthly_financial_summary where start_date='2025-02-01'");
  assert.equal(Number(summary.actual_income), 8500); assert.equal(Number(summary.actual_total_expense), 0);
  assert.equal(Number((await one("select net_worth from vw_net_worth where currency='CNY'")).net_worth), 9200);
});

await test('only active asset accounts and active income categories are accepted', async () => {
  await rejects(() => income({ account: liability }), /income_account_must_be_asset/);
  await rejects(() => income({ account: inactive }), /account_inactive/);
  await rejects(() => income({ account: randomUUID() }), /account_not_found/);
  await rejects(() => income({ category: expenseCategory }), /income_category_not_found_or_inactive/);
  await sql('update categories set is_active=false where id=$1', [incomeCategory]);
  await rejects(() => income(), /income_category_not_found_or_inactive/);
  assert.deepEqual(await totals(), { entries: 0, lines: 0, impacts: 0 });
});

await test('invalid values fail without partial facts', async () => {
  for (const amount of [0, -1, 'NaN', 'Infinity', 1.001, 1e12, null]) {
    await rejects(() => income({ amount }), /invalid_income_amount/);
  }
  for (const change of [{ id: null }, { time: '2999-01-01' }, { description: ' ' }, { description: 'x'.repeat(1001) }]) {
    await rejects(() => income(change), /invalid_income_/);
  }
  assert.deepEqual(await totals(), { entries: 0, lines: 0, impacts: 0 });
});

await test('same request replays once and changed payload conflicts', async () => {
  const payload = request();
  const first = await income(payload);
  const replay = await income(payload);
  assert.equal(replay.replayed, true); assert.equal(replay.entry_id, first.entry_id); assert.equal(replay.line_id, first.line_id);
  await rejects(() => income({ ...payload, amount: 1 }), /request_payload_conflict/);
  assert.deepEqual(await totals(), { entries: 1, lines: 1, impacts: 0 });
});

await test('line failure rolls back the whole income transaction', async () => {
  await db.exec("reset role; create function public.inject_income_failure() returns trigger language plpgsql as $$ begin raise exception 'injected_failure'; end $$; create trigger inject_income_failure after insert on journal_lines for each row execute function public.inject_income_failure(); set local role authenticated");
  await rejects(() => income(), /injected_failure/);
  assert.deepEqual(await totals(), { entries: 0, lines: 0, impacts: 0 });
});

await test('anon and missing authenticated identity cannot execute', async () => {
  await db.exec("set local request.jwt.claim.sub=''");
  await rejects(() => income(), /authentication_required/);
  await db.exec('set local role anon');
  await rejects(() => income(), /permission denied/);
});

console.log(`PASS: ${passed} isolated PostgreSQL income scenarios; no production connection used.`);
await db.close();
