do $preflight$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.budget_buckets bb
  where bb.is_active
    and bb.bucket_kind = 'expense'
    and bb.name in ('固定必要开销', '固定必要');
  if v_count <> 1 then
    raise exception 'financial_insights_requires_exactly_one_active_fixed_necessary_bucket (found %)', v_count
      using errcode = '23514';
  end if;
end;
$preflight$;
