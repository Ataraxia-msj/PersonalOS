import {allRows,type AffairsQueryClient} from './queries';
import type {InboxEntryRow,InboxStatus,InboxTarget} from './inbox-types';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function getAffairsInboxEntries(c:AffairsQueryClient,status:InboxStatus):Promise<InboxEntryRow[]> {
 if(!['pending','resolved','discarded'].includes(status)) throw new Error('invalid_inbox_status');
 return allRows<InboxEntryRow>('affairs_inbox_entries',c.from('affairs_inbox_entries').select('*').eq('status',status).order('created_at',{ascending:false}).order('id'));
}
export async function getAffairsInboxPendingCount(c:AffairsQueryClient):Promise<number> {
 const {count,error}=await c.from('affairs_inbox_entries').select('id',{count:'exact',head:true}).eq('status','pending');
 if(error) throw new Error(`affairs_inbox_entries: ${error.code} ${error.message}`);
 if(count===null||!Number.isSafeInteger(count)||count<0) throw new Error('missing_inbox_count');
 return count;
}
export async function getAffairsResourceInboxSource(c:AffairsQueryClient,resource:InboxTarget,objectId:string):Promise<InboxEntryRow|null> {
 if(!uuid.test(objectId)||!['task','project'].includes(resource)) throw new Error('invalid_source_reference');
 const {data,error}=await c.from('affairs_commands').select('*').eq('operation','resolve_affairs_inbox_entry').eq('result->>resolved_resource',resource).eq('result->>resolved_object_id',objectId).limit(1).maybeSingle();
 if(error) throw new Error(`affairs_commands: ${error.code} ${error.message}`);
 if(!data) return null;
 const r=await c.from('affairs_inbox_entries').select('*').eq('id',data.result.object_id).maybeSingle();
 if(r.error) throw new Error(`affairs_inbox_entries: ${r.error.code} ${r.error.message}`);
 if(!r.data||r.data.status!=='resolved'||(resource==='task'?r.data.resolved_task_id:r.data.resolved_project_id)!==objectId) throw new Error('invalid_inbox_source');
 return r.data;
}
