// Disposable, in-memory PostgreSQL only. Never accepts a database URL.
// node supabase/tests/financial_analysis_views.mjs <absolute @electric-sql/pglite/dist/index.js> [--red]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = async (query, args = []) => (await db.query(query, args)).rows;
const one = async (query, args = []) => (await sql(query, args))[0];
await db.exec(await readFile(new URL('./fixtures/transfer_base.sql', import.meta.url), 'utf8'));
if (!process.argv.includes('--red')) {
  await db.exec(await readFile(new URL('../migrations/202610030003_financial_analysis_views.sql', import.meta.url), 'utf8'));
}

const required = await sql(`select column_name from information_schema.columns
  where table_schema='public' and table_name='vw_monthly_financial_summary'
    and column_name in ('actual_total_allocated','overall_execution_rate','monthly_balance')`);
assert.equal(required.length, 3, 'extended monthly summary columns must exist');
for (const view of ['vw_monthly_financial_analysis', 'vw_monthly_category_spending']) {
  assert.equal((await sql('select 1 from pg_views where schemaname=$1 and viewname=$2', ['public', view])).length, 1,
    `${view} must exist`);
}

let passed = 0;
async function test(name, fn) {
  await db.exec("begin; set local role authenticated; set local request.jwt.claim.sub='89000000-0000-0000-0000-000000000001'");
  try { await fn(); passed += 1; console.log('PASS:', name); }
  finally { await db.exec('rollback'); }
}
const ids = { account: randomUUID(), liability: randomUUID(), income: randomUUID(), food: randomUUID(), study: randomUUID(),
  expense: randomUUID(), saving: randomUUID(), investment: randomUUID(), debt: randomUUID() };
async function seedDimensions() {
  await sql("insert into accounts(id,name,account_class,account_type,currency) values($1,'bank','asset','bank','CNY'),($2,'loan','liability','loan','CNY')", [ids.account, ids.liability]);
  await sql("insert into categories(id,name,category_type) values($1,'salary','income'),($2,'food','expense'),($3,'study','expense')", [ids.income, ids.food, ids.study]);
  for (const [id, name, kind] of [[ids.expense,'variable','expense'],[ids.saving,'saving','saving'],[ids.investment,'investment','investment'],[ids.debt,'debt','debt']]) {
    await sql('insert into budget_buckets(id,name,bucket_kind) values($1,$2,$3)', [id,name,kind]);
  }
}
async function period(month, planned, allocations) {
  const id = randomUUID();
  const start = `${month}-01`;
  const end = new Date(`${month}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  await sql("insert into budget_periods(id,start_date,end_date,planned_income,status) values($1,$2,$3,$4,'active')",
    [id,start,end.toISOString().slice(0,10),planned]);
  for (const [bucket, amount] of allocations) await sql('insert into budget_allocations(budget_period_id,budget_bucket_id,planned_amount) values($1,$2,$3)', [id,bucket,amount]);
  return id;
}
async function entry({ month, type, amount, category, status='confirmed', excluded=false, account=ids.account, bucket=null, periodId=null, description='entry' }) {
  const entryId = randomUUID(); const lineId = randomUUID();
  await sql('insert into journal_entries(id,occurred_at,entry_type,description,status,exclude_from_budget) values($1,$2,$3,$4,$5,$6)',
    [entryId,`${month}-15T12:00:00+08`,type,description,status,excluded]);
  await sql('insert into journal_lines(id,entry_id,account_id,amount,category_id,sort_order,budget_bucket_id) values($1,$2,$3,$4,$5,0,$6)',
    [lineId,entryId,account,amount,category,bucket]);
  if (periodId && bucket) await sql('insert into budget_impacts(entry_id,line_id,budget_period_id,budget_bucket_id,amount) values($1,$2,$3,$4,$5)',
    [entryId,lineId,periodId,bucket,Math.abs(amount)]);
  return entryId;
}

await test('overall execution uses budget impacts while excluded expenses remain monthly spending', async () => {
  await seedDimensions();
  const p = await period('2025-02', 1000, [[ids.expense,200],[ids.saving,200]]);
  await entry({ month:'2025-02', type:'income', amount:1000, category:ids.income });
  await entry({ month:'2025-02', type:'expense', amount:-100, category:ids.food, bucket:ids.expense, periodId:p });
  await entry({ month:'2025-02', type:'expense', amount:-50, category:ids.study, excluded:true, description:'excluded' });
  await entry({ month:'2025-02', type:'transfer', amount:-100, category:null, bucket:ids.saving, periodId:p });
  const row = await one('select * from vw_monthly_financial_summary where budget_period_id=$1',[p]);
  assert.equal(Number(row.actual_total_allocated),200); assert.equal(Number(row.overall_execution_rate),50);
  assert.equal(Number(row.actual_total_expense),150); assert.equal(Number(row.monthly_balance),850);
});

await test('zero plan is null and execution may exceed one hundred percent', async () => {
  await seedDimensions();
  const zero = await period('2025-03', 1000, [[ids.expense,0]]);
  await entry({ month:'2025-03', type:'expense', amount:-20, category:ids.food, bucket:ids.expense, periodId:zero });
  assert.equal((await one('select overall_execution_rate from vw_monthly_financial_summary where budget_period_id=$1',[zero])).overall_execution_rate, null);
  const over = await period('2025-04', 1000, [[ids.expense,100]]);
  await entry({ month:'2025-04', type:'expense', amount:-150, category:ids.food, bucket:ids.expense, periodId:over });
  assert.equal(Number((await one('select overall_execution_rate from vw_monthly_financial_summary where budget_period_id=$1',[over])).overall_execution_rate),150);
});

await test('analysis compares exact natural previous month and prior year only', async () => {
  await seedDimensions();
  for (const [month,income,expense] of [['2025-01',500,100],['2025-12',800,200],['2026-01',1000,250],['2026-03',900,100]]) {
    await period(month,1000,[[ids.expense,500]]);
    await entry({ month,type:'income',amount:income,category:ids.income });
    await entry({ month,type:'expense',amount:-expense,category:ids.food });
  }
  const jan = await one("select * from vw_monthly_financial_analysis where month='2026-01-01'");
  assert.equal(Number(jan.previous_month_income),800); assert.equal(Number(jan.prior_year_income),500);
  assert.equal(Number(jan.income_mom_change),200); assert.equal(Number(jan.income_yoy_rate),100);
  const mar = await one("select * from vw_monthly_financial_analysis where month='2026-03-01'");
  assert.equal(mar.previous_month_income,null); assert.equal(mar.income_mom_rate,null);
});

await test('category spending includes excluded expenses and ignores non-confirmed or non-expense facts', async () => {
  await seedDimensions();
  await period('2025-05',1000,[[ids.expense,500]]);
  await entry({ month:'2025-05',type:'expense',amount:-60,category:ids.food,excluded:true,description:'excluded food' });
  await entry({ month:'2025-05',type:'expense',amount:-40,category:ids.food });
  await entry({ month:'2025-05',type:'expense',amount:-90,category:ids.study });
  await entry({ month:'2025-05',type:'expense',amount:-999,category:ids.food,status:'void' });
  await entry({ month:'2025-05',type:'income',amount:500,category:ids.income });
  const rows = await sql("select * from vw_monthly_category_spending where month='2025-05-01' order by month_rank");
  assert.deepEqual(rows.map((row)=>[row.category_name,Number(row.actual_amount),Number(row.transaction_count)]), [['food',100,2],['study',90,1]]);
  assert.equal(Number(rows[0].month_rank),1); assert.equal(Number(Number(rows[0].month_share).toFixed(2)),52.63);
});

console.log(`PASS: ${passed} isolated financial analysis View scenarios; no production connection used.`);
