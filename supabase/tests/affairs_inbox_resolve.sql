-- Isolated only. A normal owner's commands; no production seed.
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='a0000000-0000-0000-0000-000000000001';
do $$ declare captured record; result record; replay record; item record; request uuid:=gen_random_uuid(); p record; begin
 select * into captured from public.create_affairs_inbox_entry(gen_random_uuid(),'Read paper 📖'||chr(10)||'Compare methods');
 select * into result from public.resolve_affairs_inbox_entry(request,captured.object_id,1,'task','{"title":"Read paper"}');
 if result.object_id<>captured.object_id or result.object_revision<>2 or result.resolved_object_revision<>1 or result.resolved_resource<>'task' or result.coin_delta<>0 then raise exception 'invalid target receipt'; end if;
 select * into item from public.affairs_tasks where id=result.resolved_object_id;
 if item.status<>'todo' or item.is_core or item.ever_completed or item.project_id is not null or item.due_date is not null or position('Compare methods' in item.description)=0 then raise exception 'bad task defaults/original'; end if;
 select * into replay from public.resolve_affairs_inbox_entry(request,captured.object_id,1,'task','{"title":"Read paper"}');
 if not replay.replayed or replay.resolved_object_id<>result.resolved_object_id then raise exception 'bad replay'; end if;
 begin perform * from public.resolve_affairs_inbox_entry(gen_random_uuid(),captured.object_id,2,'task','{"title":"Duplicate"}'); raise exception 'accepted duplicate'; exception when raise_exception then if sqlerrm<>'invalid_state_transition' then raise; end if; end;
 begin perform * from public.update_affairs_inbox_entry(gen_random_uuid(),captured.object_id,2,'Edited'); raise exception 'edited resolved'; exception when raise_exception then if sqlerrm<>'invalid_state_transition' then raise; end if; end;
 begin perform * from public.discard_affairs_inbox_entry(gen_random_uuid(),captured.object_id,2); raise exception 'discarded resolved'; exception when raise_exception then if sqlerrm<>'invalid_state_transition' then raise; end if; end;
 begin perform * from public.restore_affairs_inbox_entry(gen_random_uuid(),captured.object_id,2); raise exception 'restored resolved'; exception when raise_exception then if sqlerrm<>'invalid_state_transition' then raise; end if; end;
 select * into captured from public.create_affairs_inbox_entry(gen_random_uuid(),'Project original');
 select * into p from public.resolve_affairs_inbox_entry(gen_random_uuid(),captured.object_id,1,'project','{"name":"New project","outcome":"Deliver paper"}');
 if p.resolved_resource<>'project' or not exists(select 1 from public.affairs_projects where id=p.resolved_object_id and status='active' and mainline_id is null and description='Project original') then raise exception 'bad project'; end if;
 if exists(select 1 from public.affairs_milestones where project_id=p.resolved_object_id) then raise exception 'auto milestones'; end if;
 select * into captured from public.create_affairs_inbox_entry(gen_random_uuid(),'Core task');
 begin perform * from public.resolve_affairs_inbox_entry(gen_random_uuid(),captured.object_id,1,'task','{"title":"Core","is_core":true}'); raise exception 'accepted invalid core'; exception when raise_exception then if sqlerrm<>'invalid_payload' then raise; end if; end;
 begin perform * from public.resolve_affairs_inbox_entry(gen_random_uuid(),captured.object_id,1,'note','{}'); raise exception 'accepted target'; exception when raise_exception then if sqlerrm<>'invalid_payload' then raise; end if; end;
 begin perform * from public.resolve_affairs_inbox_entry(gen_random_uuid(),captured.object_id,0,'task','{"title":"Stale"}'); raise exception 'accepted stale'; exception when raise_exception then if sqlerrm<>'stale_revision' then raise; end if; end;
 begin perform * from public.resolve_affairs_inbox_entry(gen_random_uuid(),captured.object_id,1,'task',jsonb_build_object('title',repeat('x',201))); raise exception 'accepted long title'; exception when raise_exception then if sqlerrm<>'invalid_payload' then raise; end if; end;
 begin perform * from public.resolve_affairs_inbox_entry(gen_random_uuid(),captured.object_id,1,'task','{"title":"Bad","user_id":"a0000000-0000-0000-0000-000000000001"}'); raise exception 'accepted user_id'; exception when raise_exception then if sqlerrm<>'invalid_payload' then raise; end if; end;
 select * into result from public.resolve_affairs_inbox_entry(gen_random_uuid(),captured.object_id,1,'task','{"title":"Core","is_core":true,"core_reason":"Mainline","completion_criteria":"One paper"}');
 if not exists(select 1 from public.affairs_tasks where id=result.resolved_object_id and is_core and not ever_completed and status='todo') then raise exception 'core defaults'; end if;
 if (select count(*) from public.affairs_coin_events)<>0 or (select count(*) from public.affairs_progress_entries)<>0 then raise exception 'unexpected reward/contribution'; end if;
end $$;
