// Disposable, in-memory PostgreSQL only. Never accepts a database URL.
// node supabase/tests/transfer_transactions.mjs <absolute @electric-sql/pglite/dist/index.js> [--red]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = async (query, args=[]) => (await db.query(query,args)).rows;
const one = async (query,args=[]) => (await sql(query,args))[0];
await db.exec(await readFile(new URL('./fixtures/transfer_base.sql',import.meta.url),'utf8'));
const prefixBefore = (await sql("select column_name from information_schema.columns where table_name='vw_transaction_details' order by ordinal_position")).map(x=>x.column_name);
const grantsBefore = await sql("select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' order by 1,2,3");
const viewsBefore = await sql("select viewname,definition from pg_views where schemaname='public' and viewname<>'vw_transaction_details' order by 1");
const policiesBefore = await sql("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by 1,2");
if (!process.argv.includes('--red')) await db.exec(await readFile(new URL('../migrations/202609080003_transfer_transactions.sql',import.meta.url),'utf8'));
assert.equal((await sql("select 1 from pg_proc where proname='create_transfer_transaction'")).length,1,'transfer RPC must exist');
assert.deepEqual((await sql("select column_name from information_schema.columns where table_name='vw_transaction_details' order by ordinal_position")).map(x=>x.column_name),[...prefixBefore,'transfer_purpose']);
assert.deepEqual(await sql("select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' order by 1,2,3"),grantsBefore);
assert.deepEqual(await sql("select viewname,definition from pg_views where schemaname='public' and viewname<>'vw_transaction_details' order by 1"),viewsBefore);
assert.deepEqual(await sql("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by 1,2"),policiesBefore);
const from=randomUUID(), to=randomUUID(), debt=randomUUID(), usd=randomUUID();
const bucket={expense:randomUUID(),saving:randomUUID(),investment:randomUUID(),debt:randomUUID()};
for(const [id,name,cls,currency] of [[from,'test bank','asset','CNY'],[to,'test pocket','asset','CNY'],[debt,'test debt','liability','CNY'],[usd,'test USD','asset','USD']]) {
  await sql("insert into accounts(id,name,account_class,account_type,currency) values($1,$2,$3,'other',$4)",[id,name,cls,currency]);
  await sql("insert into balance_snapshots(account_id,snapshot_at,balance) values($1,'2025-01-01T00:00:00Z',$2)",[id,cls==='liability'?300:1000]);
}
for(const [kind,id] of Object.entries(bucket)) await sql('insert into budget_buckets(id,name,bucket_kind) values($1,$2,$2)',[id,kind]);
const allocations = Object.values(bucket).map(id=>({budget_bucket_id:id,planned_amount:1000}));
const request=()=>({id:randomUUID(),time:'2025-02-15T00:00:00+08',description:'test transfer',from,to,amount:100,purpose:'general',bucket:null,memo:null});
async function transfer(input={}) {
  const p={...request(),...input};
  return one('select * from public.create_transfer_transaction($1,$2,$3,$4,$5,$6,$7,$8,$9)',[p.id,p.time,p.description,p.from,p.to,p.amount,p.purpose,p.bucket,p.memo]);
}
const saveBudget=(period=null,month='2025-02-01',items=allocations)=>one('select * from public.save_monthly_budget($1,5000,$2,$3,$4)',[month,JSON.stringify(items),period?.budget_period_id??null,period?.period_updated_at??null]);
const totals=()=>one('select (select count(*)::int from journal_entries) entries,(select count(*)::int from journal_lines) lines,(select count(*)::int from budget_impacts) impacts');
async function rejects(promiseFactory,pattern) {
  await db.exec('savepoint expected_error');
  try { await assert.rejects(promiseFactory,pattern); }
  finally { await db.exec('rollback to savepoint expected_error; release savepoint expected_error'); }
}
let passed=0;
async function test(name,fn) {
  await db.exec("begin; set local role authenticated; set local request.jwt.claim.sub='89000000-0000-0000-0000-000000000001'");
  try { await fn(); passed++; console.log('PASS:',name); }
  finally { await db.exec('rollback'); }
}
await test('general transfer: two opposite asset lines, no budget, unchanged net worth',async()=>{
  const result=await transfer();
  assert.equal(result.budget_impact_created,false); assert.equal(result.warning_code,null);
  assert.deepEqual((await sql('select amount::float8 amount from journal_lines where entry_id=$1 order by sort_order',[result.entry_id])).map(x=>x.amount),[-100,100]);
  assert.deepEqual(await totals(),{entries:1,lines:2,impacts:0});
  assert.equal(Number((await one("select net_worth from vw_net_worth where currency='CNY'")).net_worth),1700);
  const lines=await sql('select * from vw_transaction_details where entry_id=$1 order by line_sort_order',[result.entry_id]);
  assert.equal(lines.length,2); assert.ok(lines.every(l=>l.transfer_purpose==='general'&&l.category_id===null&&l.exclude_from_budget));
});
await test('saving, investment, principal repayment: exactly one impact per entry and no income/expense',async()=>{
  const period=await saveBudget();
  for(const purpose of ['saving','investment','debt']) {
    const r=await transfer({purpose,bucket:bucket[purpose],to:purpose==='debt'?debt:to});
    assert.equal(r.budget_impact_created,true); assert.equal(r.budget_period_id,period.budget_period_id);
    const impact=await one('select * from budget_impacts where entry_id=$1',[r.entry_id]);
    assert.equal(impact.line_id,r.from_line_id); assert.equal(Number(impact.amount),100);
    const lines=await sql('select amount::float8 amount,budget_bucket_id from journal_lines where entry_id=$1 order by sort_order',[r.entry_id]);
    assert.deepEqual(lines.map(l=>l.amount),purpose==='debt'?[-100,-100]:[-100,100]);
    assert.equal(lines[0].budget_bucket_id,bucket[purpose]); assert.equal(lines[1].budget_bucket_id,null);
  }
  const m=await one('select * from vw_monthly_financial_summary where budget_period_id=$1',[period.budget_period_id]);
  for(const key of ['actual_saving','actual_investment','actual_debt']) assert.equal(Number(m[key]),100);
  assert.equal(Number(m.actual_income),0); assert.equal(Number(m.actual_total_expense),0); assert.equal(Number(m.actual_expense),0);
  assert.equal(Number((await one("select net_worth from vw_net_worth where currency='CNY'")).net_worth),1700);
});
await test('return does not reduce cumulative investment; a new contribution adds again',async()=>{
  const period=await saveBudget();
  await transfer({amount:1000,purpose:'saving',bucket:bucket.saving});
  await transfer({amount:200,from:to,to:from});
  assert.equal(Number((await one('select actual_saving from vw_monthly_financial_summary where budget_period_id=$1',[period.budget_period_id])).actual_saving),1000);
  await transfer({amount:200,purpose:'saving',bucket:bucket.saving});
  assert.equal(Number((await one('select actual_saving from vw_monthly_financial_summary where budget_period_id=$1',[period.budget_period_id])).actual_saving),1200);
});
await test('late budget backfills one source impact, preserves expense backfill and repeats safely',async()=>{
  const r=await transfer({purpose:'saving',bucket:bucket.saving});
  assert.equal(r.warning_code,'no_budget_period');
  const expense=randomUUID();
  await sql("insert into journal_entries(id,occurred_at,entry_type,description,source,status) values($1,'2025-02-15','expense','test expense','manual','confirmed')",[expense]);
  await sql('insert into journal_lines(entry_id,account_id,amount,sort_order,budget_bucket_id) values($1,$2,-25,0,$3)',[expense,from,bucket.expense]);
  const p=await saveBudget(); assert.equal(p.backfilled_count,2);
  assert.deepEqual(await totals(),{entries:2,lines:3,impacts:2});
  const next=await saveBudget(p); assert.equal(next.backfilled_count,0);
  const m=await one('select * from vw_monthly_financial_summary where budget_period_id=$1',[p.budget_period_id]);
  assert.equal(Number(m.actual_saving),100); assert.equal(Number(m.actual_total_expense),25);
});
await test('idempotent replay survives later budget creation without duplicate facts',async()=>{
  const p={...request(),purpose:'saving',bucket:bucket.saving};
  const first=await transfer(p); assert.equal(first.replayed,false);
  await saveBudget(); const replay=await transfer(p);
  assert.equal(replay.replayed,true); assert.equal(replay.entry_id,first.entry_id); assert.equal(replay.budget_impact_created,true);
  assert.deepEqual(await totals(),{entries:1,lines:2,impacts:1});
  await rejects(()=>transfer({...p,amount:200}),/request_payload_conflict/);
});
await test('invalid input rolls back; explicit invalid bucket cannot hide behind absent period',async()=>{
  for(const amount of [0,-1,'NaN','Infinity',1.001,1e12,null]) await rejects(()=>transfer({amount}),/invalid_transfer_amount/);
  for(const changed of [{from:to},{from:debt},{to:debt},{purpose:'debt'},{to:usd},{to:randomUUID()},{purpose:'bad'},{time:'2999-01-01'},{description:' '}]) await rejects(()=>transfer(changed),/invalid_|account_|currency_/);
  await rejects(()=>transfer({purpose:'saving',bucket:randomUUID()}),/budget_bucket_/);
  await rejects(()=>transfer({purpose:'saving',bucket:bucket.investment}),/budget_bucket_/);
  await rejects(()=>transfer({bucket:bucket.saving}),/general_transfer_/);
  assert.deepEqual(await totals(),{entries:0,lines:0,impacts:0});
});
await test('missing bucket, closed period and absent allocation are explicit nonfatal warnings',async()=>{
  assert.equal((await transfer({purpose:'saving'})).warning_code,'no_budget_bucket');
  const p=await saveBudget();
  await sql('delete from budget_allocations where budget_period_id=$1 and budget_bucket_id=$2',[p.budget_period_id,bucket.saving]);
  assert.equal((await transfer({purpose:'saving',bucket:bucket.saving})).warning_code,'no_budget_allocation');
  await sql("update budget_periods set status='closed' where id=$1",[p.budget_period_id]);
  assert.equal((await transfer({purpose:'debt',bucket:bucket.debt,to:debt})).warning_code,'budget_period_closed');
  assert.deepEqual(await totals(),{entries:3,lines:6,impacts:0});
});
await test('overlapping periods fail atomically, including general transfers',async()=>{
  await sql("insert into budget_periods(start_date,end_date,planned_income,currency,status) values('2025-02-01','2025-02-28',1000,'CNY','active'),('2025-02-02','2025-03-01',1000,'CNY','active')");
  await rejects(()=>transfer(),/overlapping_budget_periods/); assert.deepEqual(await totals(),{entries:0,lines:0,impacts:0});
});
await test('failure on second line or impact rolls back entire entry',async()=>{
  await saveBudget();
  await db.exec("reset role; create function public.inject_transfer_failure() returns trigger language plpgsql as $$ begin raise exception 'injected_failure'; end $$; create trigger inject_failure after insert on journal_lines for each row when (new.sort_order=1) execute function public.inject_transfer_failure(); set local role authenticated");
  await rejects(()=>transfer({purpose:'saving',bucket:bucket.saving}),/injected_failure/);
  assert.deepEqual(await totals(),{entries:0,lines:0,impacts:0});
  await db.exec('reset role; drop trigger inject_failure on journal_lines; create trigger inject_failure after insert on budget_impacts for each row execute function public.inject_transfer_failure(); set local role authenticated');
  await rejects(()=>transfer({purpose:'saving',bucket:bucket.saving}),/injected_failure/);
  assert.deepEqual(await totals(),{entries:0,lines:0,impacts:0});
});
await test('anon execution and empty authenticated identity are denied',async()=>{
  await db.exec("set local request.jwt.claim.sub=''");
  await rejects(()=>transfer(),/authentication_required/);
  await db.exec('set local role anon'); await rejects(()=>transfer(),/permission denied/);
});
await test('inactive account and bucket reject new writes, but existing request still replays',async()=>{
  const p={...request(),purpose:'saving',bucket:bucket.saving};
  const first=await transfer(p);
  await sql('update accounts set is_active=false where id=$1',[to]);
  await rejects(()=>transfer(),/account_inactive/);
  assert.equal((await transfer(p)).entry_id,first.entry_id);
  await sql('update accounts set is_active=true where id=$1',[to]);
  await sql('update budget_buckets set is_active=false where id=$1',[bucket.saving]);
  await rejects(()=>transfer({purpose:'saving',bucket:bucket.saving}),/budget_bucket_not_found_or_inactive/);
  assert.equal((await transfer(p)).replayed,true);
});
await test('same-currency foreign transfer never gets silently converted into CNY budget',async()=>{
  const other=randomUUID();
  await sql("insert into accounts(id,name,account_class,account_type,currency) values($1,'USD second','asset','bank','USD')",[other]);
  const p=await saveBudget();
  const r=await transfer({from:usd,to:other,purpose:'investment',bucket:bucket.investment});
  assert.equal(r.warning_code,'budget_currency_mismatch');
  const next=await saveBudget(p); assert.equal(next.backfilled_count,0); assert.equal(next.pending_transaction_count,1);
  assert.deepEqual(await totals(),{entries:1,lines:2,impacts:0});
});
await test('zero budget allocation receives actual amount, not treated as missing',async()=>{
  await saveBudget(null,'2025-02-01',allocations.map(a=>({...a,planned_amount:0})));
  const r=await transfer({purpose:'saving',bucket:bucket.saving});
  assert.equal(r.budget_impact_created,true);
  const row=await one('select * from vw_budget_execution where budget_bucket_id=$1',[bucket.saving]);
  assert.equal(Number(row.actual_amount),100); assert.equal(Number(row.planned_amount),0);
});
await test('Shanghai monthly boundaries assign exact months before and after budget creation',async()=>{
  for(const time of ['2025-01-31T23:59:59+08','2025-02-01T00:00:00+08','2025-02-28T23:59:59+08','2025-03-01T00:00:00+08']) {
    await transfer({time,purpose:'saving',bucket:bucket.saving});
  }
  const feb=await saveBudget(); assert.equal(feb.backfilled_count,2);
  const jan=await saveBudget(null,'2025-01-01'); assert.equal(jan.backfilled_count,1);
  assert.equal((await transfer({time:'2025-01-31T16:00:00Z',purpose:'investment',bucket:bucket.investment})).budget_period_id,feb.budget_period_id);
  const m=await one('select actual_saving from vw_monthly_financial_summary where budget_period_id=$1',[feb.budget_period_id]);
  assert.equal(Number(m.actual_saving),200);
});
await test('unknown and malformed transfers remain unassigned, no classification guessed',async()=>{
  await transfer({purpose:'saving'});
  const wrong=await transfer({purpose:'saving',bucket:bucket.saving});
  await sql('update journal_lines set budget_bucket_id=$1 where id=$2',[bucket.investment,wrong.from_line_id]);
  const extra=await transfer({purpose:'saving',bucket:bucket.saving});
  await sql('insert into journal_lines(entry_id,account_id,amount,sort_order) values($1,$2,1,2)',[extra.entry_id,to]);
  const legacy=randomUUID();
  await sql("insert into journal_entries(id,occurred_at,entry_type,description,source,status) values($1,'2025-02-15','transfer','legacy','manual','confirmed')",[legacy]);
  const result=await saveBudget();
  assert.equal(result.backfilled_count,0); assert.equal(result.pending_transaction_count,3);
  assert.equal((await one('select transfer_purpose from journal_entries where id=$1',[legacy])).transfer_purpose,null);
  assert.equal((await totals()).impacts,0);
});
await test('disabled saved classification remains historical truth when allocation already exists',async()=>{
  const r=await transfer({purpose:'saving',bucket:bucket.saving});
  const p=await saveBudget();
  await sql('delete from budget_impacts where entry_id=$1',[r.entry_id]);
  await sql('update budget_buckets set is_active=false where id=$1',[bucket.saving]);
  const next=await saveBudget(p); assert.equal(next.backfilled_count,1);
  assert.equal((await totals()).impacts,1);
});
await test('new purpose constraint rejects non-transfer use and unknown purpose',async()=>{
  await rejects(()=>sql("insert into journal_entries(occurred_at,entry_type,description,transfer_purpose) values('2025-02-15','expense','wrong','saving')"),/journal_entries_transfer_purpose_check/);
  await rejects(()=>sql("insert into journal_entries(occurred_at,entry_type,description,transfer_purpose) values('2025-02-15','transfer','wrong','arbitrary')"),/journal_entries_transfer_purpose_check/);
});
await test('replay rejects changed intent, destination, memo, date or existing unrelated entry',async()=>{
  const p=request(); await transfer(p);
  for(const change of [{purpose:'saving'},{to:debt},{memo:'new memo'},{description:'new description'},{time:'2025-02-16'}]) {
    await rejects(()=>transfer({...p,...change}),/request_payload_conflict/);
  }
  const id=randomUUID();
  await sql("insert into journal_entries(id,occurred_at,entry_type,description) values($1,'2025-02-15','expense','existing')",[id]);
  await rejects(()=>transfer({id}),/request_payload_conflict/);
});
console.log(`PASS: ${passed} isolated PostgreSQL scenarios; no production connection used.`);
await db.close();
