-- ISOLATED ONLY, loaded after transfer_base.sql. No production credentials.
create table auth.users (id uuid primary key);
insert into auth.users values ('a0000000-0000-0000-0000-000000000001'), ('b0000000-0000-0000-0000-000000000002');
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true),'') $$;
grant execute on function auth.uid(), auth.role() to authenticated, anon;
