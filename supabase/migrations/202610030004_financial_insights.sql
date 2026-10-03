-- Deterministic, explainable financial insight rules over existing read models.
-- REVIEW BEFORE EXECUTION. Read-only View; no historical rows are changed.
begin;
set local lock_timeout = '5s';

do $preflight$
declare v_count integer;
begin
  select count(*) into v_count
  from public.budget_buckets bb
  where bb.is_active and bb.bucket_kind = 'expense'
    and bb.name in ('固定必要开销', '固定必要');
  if v_count <> 1 then
    raise exception 'financial_insights_requires_exactly_one_active_fixed_necessary_bucket (found %)', v_count
      using errcode = '23514';
  end if;
end;
$preflight$;

create view public.vw_financial_insights
with (security_invoker = true) as
with expense_facts as (
  select
    je.id as entry_id,
    je.occurred_at,
    date_trunc('month', je.occurred_at at time zone 'Asia/Shanghai')::date as month,
    je.description,
    je.exclude_from_budget,
    a.currency,
    c.id as category_id,
    c.name as category_name,
    jl.id as line_id,
    case
      when a.account_class = 'asset' and jl.amount < 0 then -jl.amount
      when a.account_class = 'liability' and jl.amount > 0 then jl.amount
      else 0::numeric
    end as amount
  from public.journal_entries je
  join public.journal_lines jl on jl.entry_id = je.id
  join public.accounts a on a.id = jl.account_id
  join public.categories c on c.id = jl.category_id and c.category_type = 'expense'
  where je.entry_type = 'expense' and je.status = 'confirmed' and je.occurred_at <= now()
), unbudgeted as (
  select f.month, f.currency, sum(f.amount) as amount, count(distinct f.entry_id) as transaction_count
  from expense_facts f
  left join public.budget_impacts bi on bi.entry_id = f.entry_id and bi.line_id = f.line_id
  where not f.exclude_from_budget and f.amount > 0 and bi.id is null
  group by f.month, f.currency
), anomaly_candidates as (
  select
    f.*,
    income.average_income,
    history.category_median,
    history.sample_count
  from expense_facts f
  left join lateral (
    select avg(s.actual_income) as average_income, count(*) as month_count
    from public.vw_monthly_financial_summary s
    where s.currency = f.currency
      and s.start_date >= (f.month - interval '3 months')::date
      and s.start_date < f.month
  ) income on income.month_count = 3
  left join lateral (
    select
      percentile_cont(0.5) within group (order by prior.amount) as category_median,
      count(*) as sample_count
    from expense_facts prior
    where prior.category_id = f.category_id
      and prior.currency = f.currency
      and prior.occurred_at < f.occurred_at
      and prior.occurred_at >= f.occurred_at - interval '12 months'
      and prior.amount > 0
  ) history on true
), fixed_bucket as (
  select id from public.budget_buckets
  where is_active and bucket_kind = 'expense' and name in ('固定必要开销', '固定必要')
), latest_period as (
  select ranked.* from (
    select bp.*, row_number() over (partition by bp.currency order by bp.start_date desc, bp.id) as rn
    from public.budget_periods bp
    where bp.start_date <= (now() at time zone 'Asia/Shanghai')::date
  ) ranked where ranked.rn = 1
), fixed_plan as (
  select lp.id as budget_period_id, lp.start_date as month, lp.currency, ba.budget_bucket_id, ba.planned_amount
  from latest_period lp
  join public.budget_allocations ba on ba.budget_period_id = lp.id
  join fixed_bucket fb on fb.id = ba.budget_bucket_id
), liquidity as (
  select currency, coalesce(sum(greatest(estimated_balance, 0::numeric)), 0::numeric) as amount
  from public.vw_account_balances
  where is_active and account_class = 'asset'
    and account_type in ('cash','bank','ewallet','wallet_pocket','money_market')
  group by currency
)
select
  'budget:' || v.budget_period_id || ':' || v.budget_bucket_id || ':near' as insight_key,
  v.start_date as month,
  v.currency,
  'budget_near_limit'::text as insight_type,
  'reminder'::text as severity,
  v.budget_bucket_name || '接近预算上限' as title,
  '已执行 ' || v.execution_rate || '%，预算 ' || v.planned_amount || '，实际 ' || v.actual_amount || '。' as message,
  v.execution_rate as metric_value,
  80::numeric as threshold_value,
  null::uuid as related_entry_id,
  v.budget_period_id as related_budget_period_id,
  v.budget_bucket_id as related_budget_bucket_id,
  null::uuid as related_category_id
from public.vw_budget_execution v
where v.execution_rate between 80 and 100

union all
select 'budget:' || v.budget_period_id || ':' || v.budget_bucket_id || ':over', v.start_date, v.currency,
  'budget_overrun', 'warning', v.budget_bucket_name || '已超预算',
  '已执行 ' || v.execution_rate || '%，超出 ' || greatest(v.actual_amount - v.planned_amount, 0::numeric) || '。',
  v.execution_rate, 100::numeric, null::uuid, v.budget_period_id, v.budget_bucket_id, null::uuid
from public.vw_budget_execution v where v.execution_rate > 100

union all
select 'unbudgeted:' || u.month || ':' || u.currency, u.month, u.currency,
  'unbudgeted_spending', 'reminder', '存在未计入预算的消费',
  u.transaction_count || ' 笔消费合计 ' || u.amount || '，且没有预算影响记录。',
  u.amount, null::numeric, null::uuid, null::uuid, null::uuid, null::uuid
from unbudgeted u

union all
select 'plan:' || s.budget_period_id || ':overallocated', s.start_date, s.currency,
  'plan_overallocated', 'warning', '预算分配超过计划收入',
  '已分配 ' || s.planned_total_allocated || '，计划收入 ' || s.planned_income || '。',
  s.planned_total_allocated, s.planned_income, null::uuid, s.budget_period_id, null::uuid, null::uuid
from public.vw_monthly_financial_summary s where s.planned_total_allocated > s.planned_income

union all
select 'cashflow:' || s.budget_period_id || ':negative', s.start_date, s.currency,
  'negative_cashflow', 'warning', '本月现金结余为负',
  '收入 ' || s.actual_income || '，支出 ' || s.actual_total_expense || '，结余 ' || s.monthly_balance || '。',
  s.monthly_balance, 0::numeric, null::uuid, s.budget_period_id, null::uuid, null::uuid
from public.vw_monthly_financial_summary s where s.monthly_balance < 0

union all
select 'cashflow:' || a.budget_period_id || ':consecutive-negative', a.month, a.currency,
  'consecutive_negative_cashflow', 'warning', '连续两个月现金结余为负',
  '本月结余 ' || a.monthly_balance || '，上月结余 ' || a.previous_month_balance || '。',
  a.monthly_balance, 0::numeric, null::uuid, a.budget_period_id, null::uuid, null::uuid
from public.vw_monthly_financial_analysis a
where a.monthly_balance < 0 and a.previous_month_balance < 0

union all
select 'expense:' || a.entry_id || ':large', a.month, a.currency,
  'large_expense', 'warning', '发现相对个人收入和历史习惯偏大的消费',
  a.description || '：' || a.amount || '；近三个月平均收入 ' || round(a.average_income,2)
    || '，该分类历史中位数 ' || round(a.category_median::numeric,2) || '。',
  a.amount, greatest(a.average_income * 0.10, (a.category_median * 2.5)::numeric), a.entry_id,
  null::uuid, null::uuid, a.category_id
from anomaly_candidates a
where a.sample_count >= 5 and a.average_income is not null and a.category_median is not null
  and a.amount >= a.average_income * 0.10
  and a.amount >= (a.category_median * 2.5)::numeric

union all
select 'liquidity:' || f.budget_period_id || ':' || f.currency, f.month, f.currency,
  'low_liquidity', 'warning', '可用流动资金不足一个月固定必要预算',
  '流动资金 ' || coalesce(l.amount,0::numeric) || '，固定必要预算 ' || f.planned_amount || '。',
  coalesce(l.amount,0::numeric), f.planned_amount, null::uuid, f.budget_period_id,
  f.budget_bucket_id, null::uuid
from fixed_plan f left join liquidity l on l.currency = f.currency
where f.planned_amount > 0 and coalesce(l.amount,0::numeric) < f.planned_amount;

grant select on public.vw_financial_insights to authenticated;
notify pgrst, 'reload schema';
commit;
