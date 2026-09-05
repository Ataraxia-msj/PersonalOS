begin;

create or replace view public.vw_transaction_details
with (security_invoker = true) as
select
  e.id as entry_id,
  e.occurred_at,
  e.entry_type,
  e.description,
  e.source,
  e.status,
  e.related_entry_id,
  l.id as line_id,
  l.sort_order as line_sort_order,
  l.amount,
  l.memo,
  a.id as account_id,
  a.name as account_name,
  a.account_class,
  a.account_type,
  a.institution,
  c.id as category_id,
  c.name as category_name,
  c.category_type,
  e.exclude_from_budget,
  impact.budget_period_id,
  bp.start_date as budget_period_start_date,
  bp.end_date as budget_period_end_date,
  impact.budget_bucket_id,
  bb.name as budget_bucket_name
from public.journal_entries e
join public.journal_lines l on l.entry_id = e.id
join public.accounts a on a.id = l.account_id
left join public.categories c on c.id = l.category_id
left join lateral (
  select
    bi.budget_period_id,
    bi.budget_bucket_id
  from public.budget_impacts bi
  where bi.entry_id = e.id
    and (bi.line_id = l.id or (bi.line_id is null and l.sort_order = 0))
  order by
    case when bi.line_id = l.id then 0 else 1 end,
    bi.created_at,
    bi.id
  limit 1
) impact on true
left join public.budget_periods bp on bp.id = impact.budget_period_id
left join public.budget_buckets bb on bb.id = impact.budget_bucket_id;

comment on view public.vw_transaction_details is
'Confirmed transaction detail lines with optional budget period and bucket attribution.';

notify pgrst, 'reload schema';

commit;
