-- Optional test helpers cleanup ONLY; app fixtures stay in this disposable database.
\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'personal_os_affairs_isolated_test' then raise exception 'isolated_test_database_required'; end if;
end $$;
drop function public.affairs_inbox_lock_observed(int,timestamptz);
drop table public.affairs_inbox_race;
