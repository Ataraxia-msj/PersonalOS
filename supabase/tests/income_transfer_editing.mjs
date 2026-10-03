// Disposable, in-memory PostgreSQL only. Never accepts a database URL.
// node supabase/tests/income_transfer_editing.mjs <absolute @electric-sql/pglite/dist/index.js> [--red]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = async (query, args = []) => (await db.query(query, args)).rows;
const one = async (query, args = []) => (await sql(query, args))[0];

await db.exec(await readFile(new URL('./fixtures/transfer_base.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../migrations/202609080003_transfer_transactions.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../migrations/202609150001_income_transactions.sql', import.meta.url), 'utf8'));
if (!process.argv.includes('--red')) {
  await db.exec(await readFile(new URL('../migrations/202610030002_income_transfer_editing.sql', import.meta.url), 'utf8'));
}

assert.equal((await sql("select 1 from pg_proc where proname='update_income_transaction'")).length, 1,
  'income update RPC must exist');
assert.equal((await sql("select 1 from pg_proc where proname='update_transfer_transaction'")).length, 1,
  'transfer update RPC must exist');

const account = {
  bank: randomUUID(),
  pocket: randomUUID(),
  investment: randomUUID(),
  debt: randomUUID(),
  usd: randomUUID(),
};
const category = { salary: randomUUID(), grant: randomUUID(), expense: randomUUID() };
const bucket = { expense: randomUUID(), saving: randomUUID(), investment: randomUUID(), debt: randomUUID() };

for (const [id, name, cls, currency] of [
  [account.bank, 'bank', 'asset', 'CNY'],
  [account.pocket, 'pocket', 'asset', 'CNY'],
  [account.investment, 'investment', 'asset', 'CNY'],
  [account.debt, 'debt', 'liability', 'CNY'],
  [account.usd, 'usd', 'asset', 'USD'],
]) {
  await sql("insert into accounts(id,name,account_class,account_type,currency,is_active) values($1,$2,$3,'other',$4,true)",
    [id, name, cls, currency]);
}
await sql("insert into categories(id,name,category_type,is_active) values($1,'salary','income',true),($2,'grant','income',true),($3,'food','expense',true)",
  [category.salary, category.grant, category.expense]);
for (const [kind, id] of Object.entries(bucket)) {
  await sql('insert into budget_buckets(id,name,bucket_kind,is_active) values($1,$2,$2,true)', [id, kind]);
}

const allocations = Object.values(bucket).map((id) => ({ budget_bucket_id: id, planned_amount: 1000 }));
const saveBudget = (month = '2025-02-01') => one(
  'select * from public.save_monthly_budget($1,5000,$2,null,null)', [month, JSON.stringify(allocations)],
);
const createIncome = (overrides = {}) => {
  const value = { id: randomUUID(), time: '2025-02-15T09:00:00+08', description: 'salary',
    account: account.bank, amount: 8000, category: category.salary, raw: null, memo: null, ...overrides };
  return one('select * from public.create_income_transaction($1,$2,$3,$4,$5,$6,$7,$8)',
    [value.id, value.time, value.description, value.account, value.amount, value.category, value.raw, value.memo]);
};
const createTransfer = (overrides = {}) => {
  const value = { id: randomUUID(), time: '2025-02-15T10:00:00+08', description: 'move',
    from: account.bank, to: account.pocket, amount: 100, purpose: 'general', bucket: null, memo: null, ...overrides };
  return one('select * from public.create_transfer_transaction($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [value.id, value.time, value.description, value.from, value.to, value.amount, value.purpose, value.bucket, value.memo]);
};
const updateIncome = (id, overrides = {}) => {
  const value = { time: '2025-02-16T09:00:00+08', description: 'updated income', account: account.pocket,
    amount: 9000, category: category.grant, raw: 'source', memo: 'memo', ...overrides };
  return one('select * from public.update_income_transaction($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, value.time, value.description, value.account, value.amount, value.category, value.raw, value.memo]);
};
const updateTransfer = (id, overrides = {}) => {
  const value = { time: '2025-02-16T10:00:00+08', description: 'updated transfer', from: account.bank,
    to: account.investment, amount: 250, purpose: 'investment', bucket: bucket.investment, memo: 'memo', ...overrides };
  return one('select * from public.update_transfer_transaction($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, value.time, value.description, value.from, value.to, value.amount, value.purpose, value.bucket, value.memo]);
};
async function rejects(factory, pattern) {
  await db.exec('savepoint expected_error');
  try { await assert.rejects(factory, pattern); }
  finally { await db.exec('rollback to savepoint expected_error; release savepoint expected_error'); }
}
let passed = 0;
async function test(name, fn) {
  await db.exec("begin; set local role authenticated; set local request.jwt.claim.sub='89000000-0000-0000-0000-000000000001'");
  try { await fn(); passed += 1; console.log('PASS:', name); }
  finally { await db.exec('rollback'); }
}

await test('income edit updates exactly one entry and line without budget impact', async () => {
  const created = await createIncome();
  const result = await updateIncome(created.entry_id);
  assert.equal(result.entry_id, created.entry_id);
  const entry = await one('select * from journal_entries where id=$1', [created.entry_id]);
  assert.equal(entry.description, 'updated income'); assert.equal(entry.raw_text, 'source');
  const lines = await sql('select * from journal_lines where entry_id=$1', [created.entry_id]);
  assert.equal(lines.length, 1); assert.equal(lines[0].account_id, account.pocket);
  assert.equal(lines[0].category_id, category.grant); assert.equal(Number(lines[0].amount), 9000);
  assert.equal(lines[0].memo, 'memo');
  assert.equal((await sql('select 1 from budget_impacts where entry_id=$1', [created.entry_id])).length, 0);
});

await test('income edit rejects invalid structure and inactive or wrong references atomically', async () => {
  const created = await createIncome();
  const before = await one('select description from journal_entries where id=$1', [created.entry_id]);
  await sql('insert into journal_lines(entry_id,account_id,amount,sort_order) values($1,$2,1,1)', [created.entry_id, account.bank]);
  await rejects(() => updateIncome(created.entry_id), /income_entry_must_have_exactly_one_line/);
  await sql('delete from journal_lines where entry_id=$1 and sort_order=1', [created.entry_id]);
  await rejects(() => updateIncome(created.entry_id, { account: account.debt }), /income_account_must_be_asset/);
  await rejects(() => updateIncome(created.entry_id, { category: category.expense }), /income_category_not_found_or_inactive/);
  assert.equal((await one('select description from journal_entries where id=$1', [created.entry_id])).description, before.description);
});

await test('transfer edit rewrites both lines and creates one open-period impact', async () => {
  const period = await saveBudget();
  const created = await createTransfer();
  const result = await updateTransfer(created.entry_id);
  assert.equal(result.budget_impact_created, true); assert.equal(result.budget_period_id, period.budget_period_id);
  assert.equal(result.warning_code, null);
  const entry = await one('select * from journal_entries where id=$1', [created.entry_id]);
  assert.equal(entry.transfer_purpose, 'investment'); assert.equal(entry.exclude_from_budget, false);
  const lines = await sql('select * from journal_lines where entry_id=$1 order by sort_order', [created.entry_id]);
  assert.deepEqual(lines.map((line) => Number(line.amount)), [-250, 250]);
  assert.deepEqual(lines.map((line) => line.account_id), [account.bank, account.investment]);
  const impacts = await sql('select * from budget_impacts where entry_id=$1', [created.entry_id]);
  assert.equal(impacts.length, 1); assert.equal(impacts[0].line_id, lines[0].id);
  assert.equal(impacts[0].budget_bucket_id, bucket.investment); assert.equal(Number(impacts[0].amount), 250);
});

await test('all transfer purposes preserve their exact account and sign rules', async () => {
  await saveBudget();
  for (const [purpose, to, targetBucket, amounts] of [
    ['general', account.pocket, null, [-75, 75]],
    ['saving', account.pocket, bucket.saving, [-75, 75]],
    ['investment', account.investment, bucket.investment, [-75, 75]],
    ['debt', account.debt, bucket.debt, [-75, -75]],
  ]) {
    const created = await createTransfer();
    const result = await updateTransfer(created.entry_id, { purpose, to, bucket: targetBucket, amount: 75 });
    const lines = await sql('select amount::float8 amount from journal_lines where entry_id=$1 order by sort_order', [created.entry_id]);
    assert.deepEqual(lines.map((line) => line.amount), amounts);
    assert.equal(result.budget_impact_created, purpose !== 'general');
  }
});

await test('open impact is moved once while a closed impact is preserved exactly', async () => {
  const feb = await saveBudget();
  const mar = await saveBudget('2025-03-01');
  const open = await createTransfer({ purpose: 'saving', bucket: bucket.saving });
  await updateTransfer(open.entry_id, { time: '2025-03-02T10:00:00+08', purpose: 'investment', bucket: bucket.investment });
  let impact = await one('select * from budget_impacts where entry_id=$1', [open.entry_id]);
  assert.equal(impact.budget_period_id, mar.budget_period_id); assert.equal(impact.budget_bucket_id, bucket.investment);
  const closed = await createTransfer({ purpose: 'saving', bucket: bucket.saving });
  const original = await one('select * from budget_impacts where entry_id=$1', [closed.entry_id]);
  await sql("update budget_periods set status='closed' where id=$1", [feb.budget_period_id]);
  const result = await updateTransfer(closed.entry_id, { time: '2025-03-03T10:00:00+08', purpose: 'general', bucket: null });
  assert.equal(result.warning_code, 'budget_period_closed_preserved');
  const preserved = await one('select * from budget_impacts where entry_id=$1', [closed.entry_id]);
  assert.equal(preserved.id, original.id); assert.equal(preserved.budget_period_id, original.budget_period_id);
  assert.equal(Number(preserved.amount), Number(original.amount));
  assert.equal((await sql('select 1 from budget_impacts where entry_id=$1', [closed.entry_id])).length, 1);
  const repeated = await updateTransfer(closed.entry_id, { time: '2025-03-04T10:00:00+08', purpose: 'general', bucket: null, amount: 99 });
  assert.equal(repeated.warning_code, 'budget_period_closed_preserved');
  const stillPreserved = await one('select * from budget_impacts where entry_id=$1', [closed.entry_id]);
  assert.equal(stillPreserved.id, original.id); assert.equal(Number(stillPreserved.amount), Number(original.amount));
});

await test('missing budget inputs are nonfatal warnings without stale impacts', async () => {
  const created = await createTransfer();
  const missingPeriod = await updateTransfer(created.entry_id, { purpose: 'saving', bucket: bucket.saving });
  assert.equal(missingPeriod.warning_code, 'no_budget_period');
  assert.equal((await sql('select 1 from budget_impacts where entry_id=$1', [created.entry_id])).length, 0);
  const noBucket = await updateTransfer(created.entry_id, { purpose: 'saving', bucket: null });
  assert.equal(noBucket.warning_code, 'no_budget_bucket');
});

await test('malformed, wrong-currency and injected-failure edits roll back atomically', async () => {
  const malformed = await createTransfer();
  await sql('insert into journal_lines(entry_id,account_id,amount,sort_order) values($1,$2,1,2)', [malformed.entry_id, account.pocket]);
  await rejects(() => updateTransfer(malformed.entry_id), /transfer_entry_must_have_exactly_two_lines/);
  const currency = await createTransfer();
  await rejects(() => updateTransfer(currency.entry_id, { to: account.usd }), /currency_mismatch/);
  const failing = await createTransfer();
  await db.exec("reset role; create function public.inject_update_failure() returns trigger language plpgsql as $$ begin raise exception 'injected_update_failure'; end $$; create trigger inject_update_failure before update on journal_lines for each row when (new.sort_order=1) execute function public.inject_update_failure(); set local role authenticated");
  await rejects(() => updateTransfer(failing.entry_id), /injected_update_failure/);
  const entry = await one('select description,transfer_purpose from journal_entries where id=$1', [failing.entry_id]);
  assert.equal(entry.description, 'move'); assert.equal(entry.transfer_purpose, 'general');
});

await test('anon and missing authenticated identity cannot edit', async () => {
  const income = await createIncome();
  const transfer = await createTransfer();
  await db.exec("set local request.jwt.claim.sub=''");
  await rejects(() => updateIncome(income.entry_id), /authentication_required/);
  await rejects(() => updateTransfer(transfer.entry_id), /authentication_required/);
  await db.exec('set local role anon');
  await rejects(() => updateIncome(income.entry_id), /permission denied/);
  await rejects(() => updateTransfer(transfer.entry_id), /permission denied/);
});

console.log(`PASS: ${passed} isolated PostgreSQL editing scenarios; no production connection used.`);
await db.close();
