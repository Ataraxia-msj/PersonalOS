-- Adds authoritative overall budget execution and monthly/category analysis.
-- REVIEW BEFORE EXECUTION. Read-only Views only; no historical rows are changed.
begin;
set local lock_timeout = '5s';

alter view public.vw_monthly_financial_summary
  rename to vw_monthly_financial_summary_source_20261003;

create view public.vw_monthly_financial_summary
with (security_invoker = true) as
with execution as (
  select
    v.budget_period_id,
    coalesce(sum(v.actual_amount) filter (where v.bucket_kind = 'expense'), 0::numeric) as actual_expense,
    coalesce(sum(v.actual_amount) filter (where v.bucket_kind = 'saving'), 0::numeric) as actual_saving,
    coalesce(sum(v.actual_amount) filter (where v.bucket_kind = 'investment'), 0::numeric) as actual_investment,
    coalesce(sum(v.actual_amount) filter (where v.bucket_kind = 'debt'), 0::numeric) as actual_debt
  from public.vw_budget_execution v
  group by v.budget_period_id
), normalized as (
  select
    s.budget_period_id,
    s.start_date,
    s.end_date,
    s.status,
    s.currency,
    s.summary_as_of,
    s.planned_income,
    s.actual_income,
    s.planned_total_allocated,
    s.planned_unallocated,
    s.planned_expense,
    s.planned_saving,
    s.planned_investment,
    s.planned_debt,
    coalesce(e.actual_expense, 0::numeric) as actual_expense,
    coalesce(e.actual_saving, 0::numeric) as actual_saving,
    coalesce(e.actual_investment, 0::numeric) as actual_investment,
    coalesce(e.actual_debt, 0::numeric) as actual_debt,
    s.net_worth_start,
    s.net_worth_as_of,
    s.net_worth_change,
    s.missing_start_snapshots,
    s.missing_current_snapshots,
    s.actual_total_expense
  from public.vw_monthly_financial_summary_source_20261003 s
  left join execution e on e.budget_period_id = s.budget_period_id
)
select
  n.budget_period_id,
  n.start_date,
  n.end_date,
  n.status,
  n.currency,
  n.summary_as_of,
  n.planned_income,
  n.actual_income,
  n.planned_total_allocated,
  n.planned_unallocated,
  n.planned_expense,
  n.planned_saving,
  n.planned_investment,
  n.planned_debt,
  n.actual_expense,
  n.actual_saving,
  n.actual_investment,
  n.actual_debt,
  n.actual_income - n.actual_expense - n.actual_saving - n.actual_investment - n.actual_debt
    as actual_unallocated,
  n.actual_expense - n.planned_expense as expense_variance,
  case when n.actual_income > 0
    then round(n.actual_saving / n.actual_income * 100::numeric, 2)
    else null::numeric end as saving_rate,
  n.net_worth_start,
  n.net_worth_as_of,
  n.net_worth_change,
  n.missing_start_snapshots,
  n.missing_current_snapshots,
  n.actual_total_expense,
  n.actual_expense + n.actual_saving + n.actual_investment + n.actual_debt
    as actual_total_allocated,
  case when n.planned_total_allocated > 0
    then round(
      (n.actual_expense + n.actual_saving + n.actual_investment + n.actual_debt)
      / n.planned_total_allocated * 100::numeric,
      2
    )
    else null::numeric end as overall_execution_rate,
  n.actual_income - n.actual_total_expense as monthly_balance
from normalized n;

create view public.vw_monthly_financial_analysis
with (security_invoker = true) as
select
  current.start_date as month,
  current.budget_period_id,
  current.status,
  current.currency,
  current.summary_as_of,
  current.actual_income,
  current.actual_total_expense,
  current.monthly_balance,
  current.actual_saving,
  current.saving_rate,
  current.planned_total_allocated,
  current.actual_total_allocated,
  current.overall_execution_rate,
  current.net_worth_as_of,
  current.net_worth_change,
  previous.actual_income as previous_month_income,
  previous.actual_total_expense as previous_month_expense,
  previous.monthly_balance as previous_month_balance,
  previous.saving_rate as previous_month_saving_rate,
  previous.overall_execution_rate as previous_month_execution_rate,
  prior_year.actual_income as prior_year_income,
  prior_year.actual_total_expense as prior_year_expense,
  prior_year.monthly_balance as prior_year_balance,
  current.actual_income - previous.actual_income as income_mom_change,
  case when previous.actual_income <> 0
    then round((current.actual_income - previous.actual_income) / abs(previous.actual_income) * 100::numeric, 2)
    else null::numeric end as income_mom_rate,
  current.actual_total_expense - previous.actual_total_expense as expense_mom_change,
  case when previous.actual_total_expense <> 0
    then round((current.actual_total_expense - previous.actual_total_expense) / abs(previous.actual_total_expense) * 100::numeric, 2)
    else null::numeric end as expense_mom_rate,
  current.monthly_balance - previous.monthly_balance as balance_mom_change,
  case when previous.monthly_balance <> 0
    then round((current.monthly_balance - previous.monthly_balance) / abs(previous.monthly_balance) * 100::numeric, 2)
    else null::numeric end as balance_mom_rate,
  current.actual_income - prior_year.actual_income as income_yoy_change,
  case when prior_year.actual_income <> 0
    then round((current.actual_income - prior_year.actual_income) / abs(prior_year.actual_income) * 100::numeric, 2)
    else null::numeric end as income_yoy_rate,
  current.actual_total_expense - prior_year.actual_total_expense as expense_yoy_change,
  case when prior_year.actual_total_expense <> 0
    then round((current.actual_total_expense - prior_year.actual_total_expense) / abs(prior_year.actual_total_expense) * 100::numeric, 2)
    else null::numeric end as expense_yoy_rate,
  current.monthly_balance - prior_year.monthly_balance as balance_yoy_change,
  case when prior_year.monthly_balance <> 0
    then round((current.monthly_balance - prior_year.monthly_balance) / abs(prior_year.monthly_balance) * 100::numeric, 2)
    else null::numeric end as balance_yoy_rate
from public.vw_monthly_financial_summary current
left join public.vw_monthly_financial_summary previous
  on previous.currency = current.currency
 and previous.start_date = (current.start_date - interval '1 month')::date
left join public.vw_monthly_financial_summary prior_year
  on prior_year.currency = current.currency
 and prior_year.start_date = (current.start_date - interval '1 year')::date;

create view public.vw_monthly_category_spending
with (security_invoker = true) as
with category_totals as (
  select
    date_trunc('month', je.occurred_at at time zone 'Asia/Shanghai')::date as month,
    a.currency,
    c.id as category_id,
    c.name as category_name,
    sum(case
      when a.account_class = 'asset' and jl.amount < 0 then -jl.amount
      when a.account_class = 'liability' and jl.amount > 0 then jl.amount
      else 0::numeric
    end) as actual_amount,
    count(distinct je.id) as transaction_count
  from public.journal_entries je
  join public.journal_lines jl on jl.entry_id = je.id
  join public.accounts a on a.id = jl.account_id
  join public.categories c on c.id = jl.category_id and c.category_type = 'expense'
  where je.entry_type = 'expense'
    and je.status = 'confirmed'
    and je.occurred_at <= now()
  group by 1, a.currency, c.id, c.name
), nonzero as (
  select * from category_totals where actual_amount > 0
)
select
  n.month,
  n.currency,
  n.category_id,
  n.category_name,
  n.actual_amount,
  n.transaction_count,
  case when sum(n.actual_amount) over (partition by n.month, n.currency) > 0
    then round(n.actual_amount / sum(n.actual_amount) over (partition by n.month, n.currency) * 100::numeric, 2)
    else null::numeric end as month_share,
  dense_rank() over (partition by n.month, n.currency order by n.actual_amount desc, n.category_id) as month_rank
from nonzero n;

grant select on public.vw_monthly_financial_summary to authenticated;
grant select on public.vw_monthly_financial_analysis to authenticated;
grant select on public.vw_monthly_category_spending to authenticated;

notify pgrst, 'reload schema';
commit;
