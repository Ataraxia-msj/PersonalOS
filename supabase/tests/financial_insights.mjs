// Disposable, in-memory PostgreSQL only. Never accepts a database URL.
// node supabase/tests/financial_insights.mjs <absolute @electric-sql/pglite/dist/index.js> [--red]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const baseFixture = await readFile(new URL('./fixtures/transfer_base.sql', import.meta.url),'utf8');
const preflight = await readFile(new URL('../checks/financial_insights_preflight.sql', import.meta.url),'utf8');
const sql = async (query,args=[]) => (await db.query(query,args)).rows;
await db.exec(baseFixture);
const fixed = randomUUID();
await sql("insert into budget_buckets(id,name,bucket_kind,is_active) values($1,'固定必要开销','expense',true)",[fixed]);
await db.exec(await readFile(new URL('../migrations/202610030003_financial_analysis_views.sql', import.meta.url),'utf8'));
if (!process.argv.includes('--red')) await db.exec(await readFile(new URL('../migrations/202610030004_financial_insights.sql', import.meta.url),'utf8'));
assert.equal((await sql("select 1 from pg_views where schemaname='public' and viewname='vw_financial_insights'")).length,1,
  'financial insights View must exist');

let passed=0;
async function test(name,fn){await db.exec("begin; set local role authenticated; set local request.jwt.claim.sub='89000000-0000-0000-0000-000000000001'");try{await fn();passed++;console.log('PASS:',name);}finally{await db.exec('rollback');}}
const account=randomUUID(), incomeCategory=randomUUID(), expenseCategory=randomUUID(), variable=randomUUID();
async function dimensions(){
  await sql("insert into accounts(id,name,account_class,account_type,currency) values($1,'bank','asset','bank','CNY')",[account]);
  await sql("insert into categories(id,name,category_type) values($1,'salary','income'),($2,'food','expense')",[incomeCategory,expenseCategory]);
  await sql("insert into budget_buckets(id,name,bucket_kind,is_active) values($1,'变动必要开销','expense',true)",[variable]);
}
async function period(month,income,allocations){const id=randomUUID();const next=new Date(`${month}-01T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);next.setUTCDate(0);
  await sql("insert into budget_periods(id,start_date,end_date,planned_income,status) values($1,$2,$3,$4,'active')",[id,`${month}-01`,next.toISOString().slice(0,10),income]);
  for(const [bucket,amount] of allocations)await sql('insert into budget_allocations(budget_period_id,budget_bucket_id,planned_amount) values($1,$2,$3)',[id,bucket,amount]);return id;}
async function entry(month,type,amount,category,{bucket=null,periodId=null,excluded=false,status='confirmed',description='entry'}={}){const id=randomUUID(),line=randomUUID();
  await sql('insert into journal_entries(id,occurred_at,entry_type,description,status,exclude_from_budget) values($1,$2,$3,$4,$5,$6)',[id,`${month}-15T12:00:00+08`,type,description,status,excluded]);
  await sql('insert into journal_lines(id,entry_id,account_id,amount,category_id,sort_order,budget_bucket_id) values($1,$2,$3,$4,$5,0,$6)',[line,id,account,amount,category,bucket]);
  if(periodId&&bucket)await sql('insert into budget_impacts(entry_id,line_id,budget_period_id,budget_bucket_id,amount) values($1,$2,$3,$4,$5)',[id,line,periodId,bucket,Math.abs(amount)]);return id;}

await test('budget thresholds, missing period and over-allocation emit stable unique insights',async()=>{
  await dimensions(); const p=await period('2025-02',100,[[fixed,100],[variable,50]]);
  await entry('2025-02','expense',-85,expenseCategory,{bucket:fixed,periodId:p});
  await entry('2025-02','expense',-60,expenseCategory,{bucket:variable,periodId:p});
  await entry('2025-02','expense',-20,expenseCategory,{description:'unbudgeted'});
  const rows=await sql("select * from vw_financial_insights where month='2025-02-01' order by insight_key");
  assert.ok(rows.some(r=>r.insight_type==='budget_near_limit'&&r.severity==='reminder'));
  assert.ok(rows.some(r=>r.insight_type==='budget_overrun'&&r.severity==='warning'));
  assert.ok(!rows.some(r=>r.insight_type==='unbudgeted_spending'), 'an existing period suppresses the no-period reminder');
  assert.ok(rows.some(r=>r.insight_type==='plan_overallocated'));
  assert.equal(new Set(rows.map(r=>r.insight_key)).size,rows.length);
  await entry('2025-01','expense',-20,expenseCategory,{description:'no-period'});
  const noPeriod=await sql("select * from vw_financial_insights where month='2025-01-01' and insight_type='unbudgeted_spending'");
  assert.equal(noPeriod.length,1,'spending in a month with no period emits one reminder');
});

await test('negative cashflow requires exact adjacent month for the consecutive warning',async()=>{
  await dimensions();
  for(const month of ['2025-03','2025-04','2025-06']){await period(month,1000,[[fixed,100]]);await entry(month,'income',100,incomeCategory);await entry(month,'expense',-200,expenseCategory);}
  const april=await sql("select insight_type from vw_financial_insights where month='2025-04-01'");
  assert.ok(april.some(r=>r.insight_type==='negative_cashflow'));assert.ok(april.some(r=>r.insight_type==='consecutive_negative_cashflow'));
  const june=await sql("select insight_type from vw_financial_insights where month='2025-06-01'");
  assert.ok(june.some(r=>r.insight_type==='negative_cashflow'));assert.ok(!june.some(r=>r.insight_type==='consecutive_negative_cashflow'));
});

await test('large-expense rule requires five prior category samples and three prior income months',async()=>{
  await dimensions();
  for(const month of ['2025-01','2025-02','2025-03']){await period(month,1000,[[fixed,100]]);await entry(month,'income',1000,incomeCategory);}
  for(let i=0;i<5;i++)await entry('2025-03','expense',-20-i,expenseCategory,{description:`sample-${i}`});
  await period('2025-04',1000,[[fixed,100]]);
  const large=randomUUID();
  await sql("insert into journal_entries(id,occurred_at,entry_type,description,status,exclude_from_budget) values($1,'2025-04-15T12:00:00+08','expense','large','confirmed',false)",[large]);
  for(const [sort,amount] of [[0,-150],[1,-150]])await sql('insert into journal_lines(id,entry_id,account_id,amount,category_id,sort_order) values($1,$2,$3,$4,$5,$6)',[randomUUID(),large,account,amount,expenseCategory,sort]);
  const rows=await sql("select * from vw_financial_insights where insight_type='large_expense'");
  assert.equal(rows.length,1,'a multi-line transaction emits one stable insight');
  assert.equal(rows[0].related_entry_id,large);assert.equal(Number(rows[0].metric_value),300);
});

await test('no-data and explicitly budget-excluded spending do not create false missing-budget warnings',async()=>{
  await dimensions(); await period('2025-07',1000,[[fixed,100]]);
  await entry('2025-07','expense',-50,expenseCategory,{excluded:true});
  const rows=await sql("select insight_type from vw_financial_insights where month='2025-07-01'");
  assert.ok(!rows.some(r=>r.insight_type==='unbudgeted_spending'));
});

async function assertPreflightRejects(bucketNames, expectedCount) {
  const isolated = new PGlite();
  await isolated.exec(baseFixture);
  for (const name of bucketNames) {
    await isolated.query(
      "insert into budget_buckets(id,name,bucket_kind,is_active) values($1,$2,'expense',true)",
      [randomUUID(), name],
    );
  }
  await assert.rejects(
    () => isolated.exec(preflight),
    new RegExp(`financial_insights_requires_exactly_one_active_fixed_necessary_bucket \\(found ${expectedCount}\\)`),
  );
  await isolated.close();
}

await assertPreflightRejects([], 0);
await assertPreflightRejects(['固定必要开销', '固定必要'], 2);
const validPreflight = new PGlite();
await validPreflight.exec(baseFixture);
await validPreflight.query(
  "insert into budget_buckets(id,name,bucket_kind,is_active) values($1,'固定必要','expense',true)",
  [randomUUID()],
);
await validPreflight.exec(preflight);
await validPreflight.close();
console.log('PASS: fixed-necessary bucket preflight rejects zero/ambiguous matches and accepts one match');

console.log(`PASS: ${passed} isolated financial insight scenarios; no production connection used.`);
