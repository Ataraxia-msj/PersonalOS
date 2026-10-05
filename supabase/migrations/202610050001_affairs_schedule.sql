-- User-run, incremental only. No seeds, no Finance changes. Run preflight before this file.
begin;
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name in('affairs_projects','affairs_tasks') and column_name in('planned_start_date','planned_time')) then raise exception 'schedule_already_present: inspect before retry'; end if;
 if to_regprocedure('affairs_private.metadata(text,jsonb)') is null or
 regexp_replace((select prosrc from pg_proc where oid=to_regprocedure('affairs_private.metadata(text,jsonb)')),'[[:space:]]','','g')
 is distinct from regexp_replace($expected0$
declare r jsonb; k text;
begin
 if kind='mainline' then
 perform affairs_private.check_keys(p,array['name','description','sort_order']);
 if p ? 'sort_order' and (jsonb_typeof(p->'sort_order')<>'number' or (p->>'sort_order')::numeric<>trunc((p->>'sort_order')::numeric)) then raise exception 'invalid_payload'; end if;
 r:=jsonb_build_object('name',affairs_private.clean_text(p->>'name',200,true),'description',affairs_private.clean_text(p->>'description',10000),'sort_order',coalesce((p->>'sort_order')::int,0));
 if (r->>'sort_order')::int<0 then raise exception 'invalid_payload'; end if;
 elsif kind='project' then
 perform affairs_private.check_keys(p,array['name','outcome','description','mainline_id','due_date']);
 r:=jsonb_build_object('name',affairs_private.clean_text(p->>'name',200,true),'outcome',affairs_private.clean_text(p->>'outcome',2000,true),'description',affairs_private.clean_text(p->>'description',10000),'mainline_id',(p->>'mainline_id')::uuid,'due_date',(p->>'due_date')::date);
 elsif kind='task' then
 perform affairs_private.check_keys(p,array['title','description','project_id','is_core','core_reason','completion_criteria','due_date']);
 if p ? 'is_core' and jsonb_typeof(p->'is_core')<>'boolean' then raise exception 'invalid_payload'; end if;
 r:=jsonb_build_object('title',affairs_private.clean_text(p->>'title',200,true),'description',affairs_private.clean_text(p->>'description',10000),'project_id',(p->>'project_id')::uuid,'is_core',coalesce((p->>'is_core')::boolean,false),'core_reason',affairs_private.clean_text(p->>'core_reason',2000),'completion_criteria',affairs_private.clean_text(p->>'completion_criteria',2000),'due_date',(p->>'due_date')::date);
 if (r->>'is_core')::boolean and (r->>'core_reason' is null or r->>'completion_criteria' is null) then raise exception 'invalid_payload'; end if;
 else raise exception 'invalid_payload';
 end if;
 -- Text fields cannot be silently stringified from numbers/objects.
 foreach k in array array['name','title','description','outcome','core_reason','completion_criteria','mainline_id','project_id','due_date'] loop
 if p ? k and jsonb_typeof(p->k) not in('string','null') then raise exception 'invalid_payload'; end if;
 end loop;
 return r;
exception when invalid_text_representation or datetime_field_overflow then raise exception 'invalid_payload';
end$expected0$,'[[:space:]]','','g')
 then raise exception 'schedule_definition_conflict: affairs_private.metadata(text,jsonb); run preflight and inspect differences'; end if;
 if to_regprocedure('affairs_private.foundation(text,uuid,jsonb)') is null or
 regexp_replace((select prosrc from pg_proc where oid=to_regprocedure('affairs_private.foundation(text,uuid,jsonb)')),'[[:space:]]','','g')
 is distinct from regexp_replace($expected1$
declare
 u uuid:=affairs_private.lock_wallet(); a jsonb:=args; data jsonb; result jsonb; obj uuid; rev bigint; expected bigint;
 ml public.affairs_mainlines; pr public.affairs_projects; ta public.affairs_tasks; mi public.affairs_milestones;
 kind text; status_value text; item jsonb; ids uuid[]:=array[]::uuid[]; id_value uuid; project_value uuid; task_value uuid;
begin
 if op like 'create_affairs_%' or op like 'update_affairs_%' then
 kind:=replace(replace(op,'create_affairs_',''),'update_affairs_','');
 data:=affairs_private.metadata(kind,a->'payload'); a:=jsonb_set(a,'{payload}',data);
 elsif op='record_affairs_progress' then
 a:=a||jsonb_build_object('content',affairs_private.clean_text(a->>'content',4000,true),'next_step',affairs_private.clean_text(a->>'next_step',2000));
 elsif op='set_affairs_task_status' then
 a:=a||jsonb_build_object('waiting_reason',affairs_private.clean_text(a->>'waiting_reason',2000));
 elsif op='save_affairs_milestones' then
 if jsonb_typeof(a->'milestones') is distinct from 'array' then raise exception 'invalid_payload'; end if;
 data:='[]'::jsonb;
 for item in select value from jsonb_array_elements(a->'milestones') loop
 perform affairs_private.check_keys(item,array['id','expected_revision','title','completion_criteria','sort_order']);
 if jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'completion_criteria') is distinct from 'string'
 or (item ? 'sort_order' and jsonb_typeof(item->'sort_order')<>'number') then raise exception 'invalid_payload'; end if;
 if coalesce((item->>'sort_order')::numeric,0)<>trunc(coalesce((item->>'sort_order')::numeric,0)) then raise exception 'invalid_payload'; end if;
 data:=data||jsonb_build_array(jsonb_build_object('id',(item->>'id')::uuid,'expected_revision',(item->>'expected_revision')::bigint,
 'title',affairs_private.clean_text(item->>'title',200,true),'completion_criteria',affairs_private.clean_text(item->>'completion_criteria',2000,true),'sort_order',coalesce((item->>'sort_order')::int,0)));
 end loop;
 a:=jsonb_set(a,'{milestones}',data);
 end if;
 result:=affairs_private.replay(request,op,a); if result is not null then return result; end if;
 obj:=(a->>'id')::uuid; expected:=(a->>'expected_revision')::bigint;
 -- Wallet serializes all owner's commands; then project locks in id order, then target.
 perform 1 from public.affairs_projects where user_id=u order by id for update;
 if kind='mainline' or op like 'set_affairs_mainline_%' then
 if op='create_affairs_mainline' then
 insert into public.affairs_mainlines(user_id,name,description,sort_order) values(u,data->>'name',data->>'description',(data->>'sort_order')::int) returning id,revision into obj,rev;
 else
 select * into ml from public.affairs_mainlines where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if expected is distinct from ml.revision then raise exception 'stale_revision'; end if;
 if op='update_affairs_mainline' then update public.affairs_mainlines set name=data->>'name',description=data->>'description',sort_order=(data->>'sort_order')::int where id=obj;
 elsif op='set_affairs_mainline_status' then
 status_value:=a->>'status'; if status_value is null or status_value not in('active','paused','archived') then raise exception 'invalid_payload'; end if;
 update public.affairs_mainlines set status=status_value where id=obj;
 elsif op='set_affairs_mainline_focus' then
 project_value:=(a->>'project_id')::uuid; perform affairs_private.assert_reference('project',project_value);
 if project_value is not null and not exists(select 1 from public.affairs_projects where id=project_value and mainline_id=obj) then raise exception 'ownership_mismatch'; end if;
 update public.affairs_mainlines set focus_project_id=project_value where id=obj;
 else raise exception 'invalid_payload'; end if;
 update public.affairs_mainlines set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 end if;
 elsif kind='project' or op='set_affairs_project_status' then
 if kind='project' then perform affairs_private.assert_reference('mainline',(data->>'mainline_id')::uuid); end if;
 if op='create_affairs_project' then
 insert into public.affairs_projects(user_id,mainline_id,name,outcome,description,due_date) values(u,(data->>'mainline_id')::uuid,data->>'name',data->>'outcome',data->>'description',(data->>'due_date')::date) returning id,revision into obj,rev;
 else
 select * into pr from public.affairs_projects where user_id=u and id=obj;
 if not found then raise exception 'not_found'; end if;
 if expected is distinct from pr.revision then raise exception 'stale_revision'; end if;
 if op='update_affairs_project' then
 perform affairs_private.assert_reference('project',obj,true);
 update public.affairs_projects set mainline_id=(data->>'mainline_id')::uuid,name=data->>'name',outcome=data->>'outcome',description=data->>'description',due_date=(data->>'due_date')::date where id=obj;
 update public.affairs_mainlines set focus_project_id=null,revision=revision+1,updated_at=now() where user_id=u and focus_project_id=obj and id is distinct from (data->>'mainline_id')::uuid;
 else
 status_value:=a->>'status'; if status_value is null or status_value not in('active','paused','completed','archived') then raise exception 'invalid_payload'; end if;
 if pr.status in('completed','archived') and status_value='completed' then raise exception 'invalid_state_transition'; end if;
 if status_value='completed' and (coalesce((a->>'outcome_confirmed')::boolean,false)=false
 or exists(select 1 from public.affairs_milestones where user_id=u and project_id=obj and status<>'completed')
 or exists(select 1 from public.affairs_tasks where user_id=u and project_id=obj and is_core and status not in('done','cancelled'))) then raise exception 'project_requires_completion'; end if;
 update public.affairs_projects set status=status_value,completed_at=case when status_value='completed' then now() end where id=obj;
 end if;
 update public.affairs_projects set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 end if;
 elsif kind='task' or op='set_affairs_task_status' then
 if op='create_affairs_task' then
 perform affairs_private.assert_reference('project',(data->>'project_id')::uuid,true);
 insert into public.affairs_tasks(user_id,project_id,title,description,is_core,core_reason,completion_criteria,due_date) values(u,(data->>'project_id')::uuid,data->>'title',data->>'description',(data->>'is_core')::boolean,data->>'core_reason',data->>'completion_criteria',(data->>'due_date')::date) returning id,revision into obj,rev;
 else
 select * into ta from public.affairs_tasks where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if expected is distinct from ta.revision then raise exception 'stale_revision'; end if;
 perform affairs_private.assert_reference('project',ta.project_id,true);
 if ta.status='done' then raise exception 'invalid_state_transition'; end if;
 if op='update_affairs_task' then
 perform affairs_private.assert_reference('project',(data->>'project_id')::uuid,true);
 if ta.ever_completed and ta.is_core is distinct from (data->>'is_core')::boolean then raise exception 'core_eligibility_locked'; end if;
 update public.affairs_tasks set project_id=(data->>'project_id')::uuid,title=data->>'title',description=data->>'description',is_core=(data->>'is_core')::boolean,core_reason=data->>'core_reason',completion_criteria=data->>'completion_criteria',due_date=(data->>'due_date')::date where id=obj;
 else
 status_value:=a->>'status'; if status_value is null or status_value not in('todo','in_progress','waiting','cancelled') then raise exception 'invalid_payload'; end if;
 update public.affairs_tasks set status=status_value,waiting_reason=case when status_value='waiting' then a->>'waiting_reason' end where id=obj;
 end if;
 update public.affairs_tasks set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 end if;
 elsif op='save_affairs_milestones' then
 perform affairs_private.assert_reference('project',obj,true);
 select * into pr from public.affairs_projects where id=obj and user_id=u;
 if expected is distinct from pr.revision then raise exception 'stale_revision'; end if;
 for item in select value from jsonb_array_elements(a->'milestones') loop
 id_value:=(item->>'id')::uuid;
 if (item->>'sort_order')::int<0 then raise exception 'invalid_payload'; end if;
 if id_value is null then
 if item->>'expected_revision' is not null then raise exception 'invalid_payload'; end if;
 insert into public.affairs_milestones(user_id,project_id,title,completion_criteria,sort_order) values(u,obj,item->>'title',item->>'completion_criteria',(item->>'sort_order')::int) returning id into id_value;
 else
 if id_value=any(ids) then raise exception 'invalid_payload'; end if;
 select * into mi from public.affairs_milestones where id=id_value and user_id=u and project_id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if (item->>'expected_revision')::bigint is distinct from mi.revision then raise exception 'stale_revision'; end if;
 update public.affairs_milestones set title=item->>'title',completion_criteria=item->>'completion_criteria',sort_order=(item->>'sort_order')::int,revision=revision+1,updated_at=now() where id=id_value;
 end if;
 ids:=array_append(ids,id_value);
 end loop;
 if exists(select 1 from public.affairs_milestones where user_id=u and project_id=obj and not(id=any(ids)) and status='completed') then raise exception 'invalid_state_transition'; end if;
 delete from public.affairs_milestones where user_id=u and project_id=obj and not(id=any(ids));
 update public.affairs_projects set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 elsif op='set_affairs_milestone_completed' then
 select * into mi from public.affairs_milestones where id=obj and user_id=u for update;
 if not found then raise exception 'not_found'; end if;
 perform affairs_private.assert_reference('project',mi.project_id,true);
 if expected is distinct from mi.revision then raise exception 'stale_revision'; end if;
 if a->>'completed' is null then raise exception 'invalid_payload'; end if;
 update public.affairs_milestones set status=case when (a->>'completed')::boolean then 'completed' else 'pending' end,completed_at=case when (a->>'completed')::boolean then now() end,revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 update public.affairs_projects set revision=revision+1,updated_at=now() where id=mi.project_id;
 elsif op='record_affairs_progress' then
 project_value:=(a->>'project_id')::uuid; task_value:=(a->>'task_id')::uuid;
 if project_value is null and task_value is null then raise exception 'invalid_payload'; end if;
 if (a->>'occurred_at')::timestamptz is null or (a->>'occurred_at')::timestamptz>now() then raise exception 'invalid_payload'; end if;
 if task_value is not null then
 select * into ta from public.affairs_tasks where id=task_value and user_id=u for update;
 if not found then raise exception 'not_found'; end if;
 if project_value is not null and project_value is distinct from ta.project_id then raise exception 'ownership_mismatch'; end if;
 project_value:=ta.project_id;
 end if;
 perform affairs_private.assert_reference('project',project_value,true);
 insert into public.affairs_progress_entries(user_id,project_id,task_id,kind,content,next_step,occurred_at) values(u,project_value,task_value,'manual',a->>'content',a->>'next_step',(a->>'occurred_at')::timestamptz) returning id into obj;
 rev:=null;
 else raise exception 'invalid_payload';
 end if;
 return affairs_private.receipt(request,op,a,obj,rev);
end$expected1$,'[[:space:]]','','g')
 then raise exception 'schedule_definition_conflict: affairs_private.foundation(text,uuid,jsonb); run preflight and inspect differences'; end if;
 if to_regprocedure('affairs_private.resolve_inbox(uuid,jsonb)') is null or
 regexp_replace((select prosrc from pg_proc where oid=to_regprocedure('affairs_private.resolve_inbox(uuid,jsonb)')),'[[:space:]]','','g')
 is distinct from regexp_replace($expected2$
declare
 u uuid:=affairs_private.require_user(); a jsonb:=args; data jsonb; v_result jsonb;
 item public.affairs_inbox_entries; obj uuid; rev bigint; target_id uuid; target_rev bigint; kind text;
 description_value text;
begin
 perform affairs_private.check_keys(a,array['id','expected_revision','target','payload']);
 kind:=a->>'target';
 if kind is null or kind not in('task','project') then raise exception 'invalid_payload'; end if;
 data:=affairs_private.metadata(kind,a->'payload'); a:=jsonb_set(a,'{payload}',data);
 perform affairs_private.lock_wallet();
 v_result:=affairs_private.replay(request,'resolve_affairs_inbox_entry',a); if v_result is not null then return v_result; end if;
 -- Same global order as the existing Affairs RPCs: wallet → projects → target.
 perform 1 from public.affairs_projects where user_id=u order by id for update;
 obj:=(a->>'id')::uuid;
 select * into item from public.affairs_inbox_entries where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if (a->>'expected_revision')::bigint is distinct from item.revision then raise exception 'stale_revision'; end if;
 if item.status<>'pending' then raise exception 'invalid_state_transition'; end if;
 description_value:=affairs_private.clean_text(case
  when data->>'description' is null or data->>'description'=item.content then item.content
  else (data->>'description')||E'\n\n'||item.content end,10000,true);
 if kind='task' then
  perform affairs_private.assert_reference('project',(data->>'project_id')::uuid,true);
  insert into public.affairs_tasks(user_id,project_id,title,description,is_core,core_reason,completion_criteria,due_date)
  values(u,(data->>'project_id')::uuid,data->>'title',description_value,(data->>'is_core')::boolean,data->>'core_reason',data->>'completion_criteria',(data->>'due_date')::date)
  returning id,revision into target_id,target_rev;
 else
  perform affairs_private.assert_reference('mainline',(data->>'mainline_id')::uuid);
  insert into public.affairs_projects(user_id,mainline_id,name,outcome,description,due_date)
  values(u,(data->>'mainline_id')::uuid,data->>'name',data->>'outcome',description_value,(data->>'due_date')::date)
  returning id,revision into target_id,target_rev;
 end if;
 update public.affairs_inbox_entries set status='resolved',resolved_task_id=case when kind='task' then target_id end,
 resolved_project_id=case when kind='project' then target_id end,resolved_at=now(),revision=revision+1,updated_at=now()
 where id=obj returning revision into rev;
 v_result:=affairs_private.receipt(request,'resolve_affairs_inbox_entry',a,obj,rev)||jsonb_build_object('resolved_resource',kind,'resolved_object_id',target_id,'resolved_object_revision',target_rev);
 update public.affairs_commands set result=v_result where id=(v_result->>'command_id')::uuid and user_id=u;
 return v_result;
end$expected2$,'[[:space:]]','','g')
 then raise exception 'schedule_definition_conflict: affairs_private.resolve_inbox(uuid,jsonb); run preflight and inspect differences'; end if;
 if (select array_agg(attname::text order by attnum) from pg_attribute where attrelid='public.vw_affairs_project_progress'::regclass and attnum>0 and not attisdropped)
 is distinct from array['id','user_id','created_at','updated_at','revision','mainline_id','name','outcome','description','due_date','status','completed_at','milestone_total','milestone_completed','progress_rate'] then raise exception 'schedule_view_conflict'; end if;
 if not ((select reloptions from pg_class where oid='public.vw_affairs_project_progress'::regclass) @> array['security_invoker=true']) then raise exception 'schedule_view_security_conflict'; end if;
end $$;
alter table public.affairs_projects add column planned_start_date date, add column planned_time time without time zone;
alter table public.affairs_tasks add column planned_start_date date, add column planned_time time without time zone;
alter table public.affairs_projects add constraint affairs_projects_schedule check(
 (planned_start_date is null or (planned_start_date between date '1000-01-01' and date '9999-12-31')) and
 (due_date is null or (due_date between date '1000-01-01' and date '9999-12-31')) and
 (planned_start_date is null or due_date is null or planned_start_date<=due_date) and
 (planned_time is null or (due_date is not null and planned_time<time '24:00' and extract(second from planned_time)=0)));
alter table public.affairs_tasks add constraint affairs_tasks_schedule check(
 (planned_start_date is null or (planned_start_date between date '1000-01-01' and date '9999-12-31')) and
 (due_date is null or (due_date between date '1000-01-01' and date '9999-12-31')) and
 (planned_start_date is null or due_date is null or planned_start_date<=due_date) and
 (planned_time is null or (due_date is not null and planned_time<time '24:00' and extract(second from planned_time)=0)));
create or replace function affairs_private.metadata(kind text, p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare r jsonb; k text;
begin
 if kind='mainline' then
 perform affairs_private.check_keys(p,array['name','description','sort_order']);
 if p ? 'sort_order' and (jsonb_typeof(p->'sort_order')<>'number' or (p->>'sort_order')::numeric<>trunc((p->>'sort_order')::numeric)) then raise exception 'invalid_payload'; end if;
 r:=jsonb_build_object('name',affairs_private.clean_text(p->>'name',200,true),'description',affairs_private.clean_text(p->>'description',10000),'sort_order',coalesce((p->>'sort_order')::int,0));
 if (r->>'sort_order')::int<0 then raise exception 'invalid_payload'; end if;
 elsif kind='project' then
 perform affairs_private.check_keys(p,array['name','outcome','description','mainline_id','due_date','planned_start_date','planned_time']);
 r:=jsonb_build_object('name',affairs_private.clean_text(p->>'name',200,true),'outcome',affairs_private.clean_text(p->>'outcome',2000,true),'description',affairs_private.clean_text(p->>'description',10000),'mainline_id',(p->>'mainline_id')::uuid,'due_date',(p->>'due_date')::date);
 elsif kind='task' then
 perform affairs_private.check_keys(p,array['title','description','project_id','is_core','core_reason','completion_criteria','due_date','planned_start_date','planned_time']);
 if p ? 'is_core' and jsonb_typeof(p->'is_core')<>'boolean' then raise exception 'invalid_payload'; end if;
 r:=jsonb_build_object('title',affairs_private.clean_text(p->>'title',200,true),'description',affairs_private.clean_text(p->>'description',10000),'project_id',(p->>'project_id')::uuid,'is_core',coalesce((p->>'is_core')::boolean,false),'core_reason',affairs_private.clean_text(p->>'core_reason',2000),'completion_criteria',affairs_private.clean_text(p->>'completion_criteria',2000),'due_date',(p->>'due_date')::date);
 if (r->>'is_core')::boolean and (r->>'core_reason' is null or r->>'completion_criteria' is null) then raise exception 'invalid_payload'; end if;
 else raise exception 'invalid_payload';
 end if;
 -- Text fields cannot be silently stringified from numbers/objects.
 foreach k in array array['name','title','description','outcome','core_reason','completion_criteria','mainline_id','project_id','due_date'] loop
 if p ? k and jsonb_typeof(p->k) not in('string','null') then raise exception 'invalid_payload'; end if;
 end loop;
 if kind in('project','task') then
  if p ? 'planned_start_date' then
   if jsonb_typeof(p->'planned_start_date') not in('string','null') or
    (p->>'planned_start_date' is not null and (p->>'planned_start_date' !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' or to_char((p->>'planned_start_date')::date,'YYYY-MM-DD')<>p->>'planned_start_date')) then raise exception 'invalid_payload'; end if;
   r:=r||jsonb_build_object('planned_start_date',(p->>'planned_start_date')::date);
  end if;
  if p ? 'planned_time' then
   if jsonb_typeof(p->'planned_time') not in('string','null') or
    (p->>'planned_time' is not null and p->>'planned_time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'invalid_payload'; end if;
   r:=r||jsonb_build_object('planned_time',p->>'planned_time');
  end if;
 end if;
 return r;
exception when invalid_text_representation or datetime_field_overflow then raise exception 'invalid_payload';
end $$;

create or replace function affairs_private.foundation(op text,request uuid,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=affairs_private.lock_wallet(); a jsonb:=args; data jsonb; result jsonb; obj uuid; rev bigint; expected bigint;
 ml public.affairs_mainlines; pr public.affairs_projects; ta public.affairs_tasks; mi public.affairs_milestones;
 kind text; status_value text; item jsonb; ids uuid[]:=array[]::uuid[]; id_value uuid; project_value uuid; task_value uuid;
begin
 if op like 'create_affairs_%' or op like 'update_affairs_%' then
 kind:=replace(replace(op,'create_affairs_',''),'update_affairs_','');
 data:=affairs_private.metadata(kind,a->'payload'); a:=jsonb_set(a,'{payload}',data);
 elsif op='record_affairs_progress' then
 a:=a||jsonb_build_object('content',affairs_private.clean_text(a->>'content',4000,true),'next_step',affairs_private.clean_text(a->>'next_step',2000));
 elsif op='set_affairs_task_status' then
 a:=a||jsonb_build_object('waiting_reason',affairs_private.clean_text(a->>'waiting_reason',2000));
 elsif op='save_affairs_milestones' then
 if jsonb_typeof(a->'milestones') is distinct from 'array' then raise exception 'invalid_payload'; end if;
 data:='[]'::jsonb;
 for item in select value from jsonb_array_elements(a->'milestones') loop
 perform affairs_private.check_keys(item,array['id','expected_revision','title','completion_criteria','sort_order']);
 if jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'completion_criteria') is distinct from 'string'
 or (item ? 'sort_order' and jsonb_typeof(item->'sort_order')<>'number') then raise exception 'invalid_payload'; end if;
 if coalesce((item->>'sort_order')::numeric,0)<>trunc(coalesce((item->>'sort_order')::numeric,0)) then raise exception 'invalid_payload'; end if;
 data:=data||jsonb_build_array(jsonb_build_object('id',(item->>'id')::uuid,'expected_revision',(item->>'expected_revision')::bigint,
 'title',affairs_private.clean_text(item->>'title',200,true),'completion_criteria',affairs_private.clean_text(item->>'completion_criteria',2000,true),'sort_order',coalesce((item->>'sort_order')::int,0)));
 end loop;
 a:=jsonb_set(a,'{milestones}',data);
 end if;
 result:=affairs_private.replay(request,op,a); if result is not null then return result; end if;
 obj:=(a->>'id')::uuid; expected:=(a->>'expected_revision')::bigint;
 -- Wallet serializes all owner's commands; then project locks in id order, then target.
 perform 1 from public.affairs_projects where user_id=u order by id for update;
 if kind='mainline' or op like 'set_affairs_mainline_%' then
 if op='create_affairs_mainline' then
 insert into public.affairs_mainlines(user_id,name,description,sort_order) values(u,data->>'name',data->>'description',(data->>'sort_order')::int) returning id,revision into obj,rev;
 else
 select * into ml from public.affairs_mainlines where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if expected is distinct from ml.revision then raise exception 'stale_revision'; end if;
 if op='update_affairs_mainline' then update public.affairs_mainlines set name=data->>'name',description=data->>'description',sort_order=(data->>'sort_order')::int where id=obj;
 elsif op='set_affairs_mainline_status' then
 status_value:=a->>'status'; if status_value is null or status_value not in('active','paused','archived') then raise exception 'invalid_payload'; end if;
 update public.affairs_mainlines set status=status_value where id=obj;
 elsif op='set_affairs_mainline_focus' then
 project_value:=(a->>'project_id')::uuid; perform affairs_private.assert_reference('project',project_value);
 if project_value is not null and not exists(select 1 from public.affairs_projects where id=project_value and mainline_id=obj) then raise exception 'ownership_mismatch'; end if;
 update public.affairs_mainlines set focus_project_id=project_value where id=obj;
 else raise exception 'invalid_payload'; end if;
 update public.affairs_mainlines set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 end if;
 elsif kind='project' or op='set_affairs_project_status' then
 if kind='project' then perform affairs_private.assert_reference('mainline',(data->>'mainline_id')::uuid); end if;
 if op='create_affairs_project' then
 insert into public.affairs_projects(user_id,mainline_id,name,outcome,description,due_date,planned_start_date,planned_time) values(u,(data->>'mainline_id')::uuid,data->>'name',data->>'outcome',data->>'description',(data->>'due_date')::date,(data->>'planned_start_date')::date,(data->>'planned_time')::time) returning id,revision into obj,rev;
 else
 select * into pr from public.affairs_projects where user_id=u and id=obj;
 if not found then raise exception 'not_found'; end if;
 if expected is distinct from pr.revision then raise exception 'stale_revision'; end if;
 if op='update_affairs_project' then
 perform affairs_private.assert_reference('project',obj,true);
 update public.affairs_projects set mainline_id=(data->>'mainline_id')::uuid,name=data->>'name',outcome=data->>'outcome',description=data->>'description',due_date=(data->>'due_date')::date,planned_start_date=case when data ? 'planned_start_date' then (data->>'planned_start_date')::date else pr.planned_start_date end,
 planned_time=case when data ? 'planned_time' then (data->>'planned_time')::time when data->>'due_date' is null then null else pr.planned_time end where id=obj;
 update public.affairs_mainlines set focus_project_id=null,revision=revision+1,updated_at=now() where user_id=u and focus_project_id=obj and id is distinct from (data->>'mainline_id')::uuid;
 else
 status_value:=a->>'status'; if status_value is null or status_value not in('active','paused','completed','archived') then raise exception 'invalid_payload'; end if;
 if pr.status in('completed','archived') and status_value='completed' then raise exception 'invalid_state_transition'; end if;
 if status_value='completed' and (coalesce((a->>'outcome_confirmed')::boolean,false)=false
 or exists(select 1 from public.affairs_milestones where user_id=u and project_id=obj and status<>'completed')
 or exists(select 1 from public.affairs_tasks where user_id=u and project_id=obj and is_core and status not in('done','cancelled'))) then raise exception 'project_requires_completion'; end if;
 update public.affairs_projects set status=status_value,completed_at=case when status_value='completed' then now() end where id=obj;
 end if;
 update public.affairs_projects set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 end if;
 elsif kind='task' or op='set_affairs_task_status' then
 if op='create_affairs_task' then
 perform affairs_private.assert_reference('project',(data->>'project_id')::uuid,true);
 insert into public.affairs_tasks(user_id,project_id,title,description,is_core,core_reason,completion_criteria,due_date,planned_start_date,planned_time) values(u,(data->>'project_id')::uuid,data->>'title',data->>'description',(data->>'is_core')::boolean,data->>'core_reason',data->>'completion_criteria',(data->>'due_date')::date,(data->>'planned_start_date')::date,(data->>'planned_time')::time) returning id,revision into obj,rev;
 else
 select * into ta from public.affairs_tasks where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if expected is distinct from ta.revision then raise exception 'stale_revision'; end if;
 perform affairs_private.assert_reference('project',ta.project_id,true);
 if ta.status='done' then raise exception 'invalid_state_transition'; end if;
 if op='update_affairs_task' then
 perform affairs_private.assert_reference('project',(data->>'project_id')::uuid,true);
 if ta.ever_completed and ta.is_core is distinct from (data->>'is_core')::boolean then raise exception 'core_eligibility_locked'; end if;
 update public.affairs_tasks set project_id=(data->>'project_id')::uuid,title=data->>'title',description=data->>'description',is_core=(data->>'is_core')::boolean,core_reason=data->>'core_reason',completion_criteria=data->>'completion_criteria',due_date=(data->>'due_date')::date,planned_start_date=case when data ? 'planned_start_date' then (data->>'planned_start_date')::date else ta.planned_start_date end,
 planned_time=case when data ? 'planned_time' then (data->>'planned_time')::time when data->>'due_date' is null then null else ta.planned_time end where id=obj;
 else
 status_value:=a->>'status'; if status_value is null or status_value not in('todo','in_progress','waiting','cancelled') then raise exception 'invalid_payload'; end if;
 update public.affairs_tasks set status=status_value,waiting_reason=case when status_value='waiting' then a->>'waiting_reason' end where id=obj;
 end if;
 update public.affairs_tasks set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 end if;
 elsif op='save_affairs_milestones' then
 perform affairs_private.assert_reference('project',obj,true);
 select * into pr from public.affairs_projects where id=obj and user_id=u;
 if expected is distinct from pr.revision then raise exception 'stale_revision'; end if;
 for item in select value from jsonb_array_elements(a->'milestones') loop
 id_value:=(item->>'id')::uuid;
 if (item->>'sort_order')::int<0 then raise exception 'invalid_payload'; end if;
 if id_value is null then
 if item->>'expected_revision' is not null then raise exception 'invalid_payload'; end if;
 insert into public.affairs_milestones(user_id,project_id,title,completion_criteria,sort_order) values(u,obj,item->>'title',item->>'completion_criteria',(item->>'sort_order')::int) returning id into id_value;
 else
 if id_value=any(ids) then raise exception 'invalid_payload'; end if;
 select * into mi from public.affairs_milestones where id=id_value and user_id=u and project_id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if (item->>'expected_revision')::bigint is distinct from mi.revision then raise exception 'stale_revision'; end if;
 update public.affairs_milestones set title=item->>'title',completion_criteria=item->>'completion_criteria',sort_order=(item->>'sort_order')::int,revision=revision+1,updated_at=now() where id=id_value;
 end if;
 ids:=array_append(ids,id_value);
 end loop;
 if exists(select 1 from public.affairs_milestones where user_id=u and project_id=obj and not(id=any(ids)) and status='completed') then raise exception 'invalid_state_transition'; end if;
 delete from public.affairs_milestones where user_id=u and project_id=obj and not(id=any(ids));
 update public.affairs_projects set revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 elsif op='set_affairs_milestone_completed' then
 select * into mi from public.affairs_milestones where id=obj and user_id=u for update;
 if not found then raise exception 'not_found'; end if;
 perform affairs_private.assert_reference('project',mi.project_id,true);
 if expected is distinct from mi.revision then raise exception 'stale_revision'; end if;
 if a->>'completed' is null then raise exception 'invalid_payload'; end if;
 update public.affairs_milestones set status=case when (a->>'completed')::boolean then 'completed' else 'pending' end,completed_at=case when (a->>'completed')::boolean then now() end,revision=revision+1,updated_at=now() where id=obj returning revision into rev;
 update public.affairs_projects set revision=revision+1,updated_at=now() where id=mi.project_id;
 elsif op='record_affairs_progress' then
 project_value:=(a->>'project_id')::uuid; task_value:=(a->>'task_id')::uuid;
 if project_value is null and task_value is null then raise exception 'invalid_payload'; end if;
 if (a->>'occurred_at')::timestamptz is null or (a->>'occurred_at')::timestamptz>now() then raise exception 'invalid_payload'; end if;
 if task_value is not null then
 select * into ta from public.affairs_tasks where id=task_value and user_id=u for update;
 if not found then raise exception 'not_found'; end if;
 if project_value is not null and project_value is distinct from ta.project_id then raise exception 'ownership_mismatch'; end if;
 project_value:=ta.project_id;
 end if;
 perform affairs_private.assert_reference('project',project_value,true);
 insert into public.affairs_progress_entries(user_id,project_id,task_id,kind,content,next_step,occurred_at) values(u,project_value,task_value,'manual',a->>'content',a->>'next_step',(a->>'occurred_at')::timestamptz) returning id into obj;
 rev:=null;
 else raise exception 'invalid_payload';
 end if;
 return affairs_private.receipt(request,op,a,obj,rev);
end $$;

create or replace function affairs_private.resolve_inbox(request uuid,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=affairs_private.require_user(); a jsonb:=args; data jsonb; v_result jsonb;
 item public.affairs_inbox_entries; obj uuid; rev bigint; target_id uuid; target_rev bigint; kind text;
 description_value text;
begin
 perform affairs_private.check_keys(a,array['id','expected_revision','target','payload']);
 kind:=a->>'target';
 if kind is null or kind not in('task','project') then raise exception 'invalid_payload'; end if;
 data:=affairs_private.metadata(kind,a->'payload'); a:=jsonb_set(a,'{payload}',data);
 perform affairs_private.lock_wallet();
 v_result:=affairs_private.replay(request,'resolve_affairs_inbox_entry',a); if v_result is not null then return v_result; end if;
 -- Same global order as the existing Affairs RPCs: wallet → projects → target.
 perform 1 from public.affairs_projects where user_id=u order by id for update;
 obj:=(a->>'id')::uuid;
 select * into item from public.affairs_inbox_entries where user_id=u and id=obj for update;
 if not found then raise exception 'not_found'; end if;
 if (a->>'expected_revision')::bigint is distinct from item.revision then raise exception 'stale_revision'; end if;
 if item.status<>'pending' then raise exception 'invalid_state_transition'; end if;
 description_value:=affairs_private.clean_text(case
  when data->>'description' is null or data->>'description'=item.content then item.content
  else (data->>'description')||E'\n\n'||item.content end,10000,true);
 if kind='task' then
  perform affairs_private.assert_reference('project',(data->>'project_id')::uuid,true);
  insert into public.affairs_tasks(user_id,project_id,title,description,is_core,core_reason,completion_criteria,due_date,planned_start_date,planned_time)
  values(u,(data->>'project_id')::uuid,data->>'title',description_value,(data->>'is_core')::boolean,data->>'core_reason',data->>'completion_criteria',(data->>'due_date')::date,(data->>'planned_start_date')::date,(data->>'planned_time')::time)
  returning id,revision into target_id,target_rev;
 else
  perform affairs_private.assert_reference('mainline',(data->>'mainline_id')::uuid);
  insert into public.affairs_projects(user_id,mainline_id,name,outcome,description,due_date,planned_start_date,planned_time)
  values(u,(data->>'mainline_id')::uuid,data->>'name',data->>'outcome',description_value,(data->>'due_date')::date,(data->>'planned_start_date')::date,(data->>'planned_time')::time)
  returning id,revision into target_id,target_rev;
 end if;
 update public.affairs_inbox_entries set status='resolved',resolved_task_id=case when kind='task' then target_id end,
 resolved_project_id=case when kind='project' then target_id end,resolved_at=now(),revision=revision+1,updated_at=now()
 where id=obj returning revision into rev;
 v_result:=affairs_private.receipt(request,'resolve_affairs_inbox_entry',a,obj,rev)||jsonb_build_object('resolved_resource',kind,'resolved_object_id',target_id,'resolved_object_revision',target_rev);
 update public.affairs_commands set result=v_result where id=(v_result->>'command_id')::uuid and user_id=u;
 return v_result;
end $$;

create or replace view public.vw_affairs_project_progress with(security_invoker=true) as
select p.id,p.user_id,p.created_at,p.updated_at,p.revision,p.mainline_id,p.name,p.outcome,p.description,p.due_date,p.status,p.completed_at,
 count(m.id)::int milestone_total,count(m.id) filter(where m.status='completed')::int milestone_completed,
 (count(m.id) filter(where m.status='completed'))::numeric/nullif(count(m.id),0) progress_rate,
 p.planned_start_date,p.planned_time
from public.affairs_projects p left join public.affairs_milestones m on m.user_id=p.user_id and m.project_id=p.id group by p.id;
-- CREATE OR REPLACE retains owners and ACLs; no new grants or changed public RPCs.
commit;

