// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {AffairsQueue} from './affairs-queue';
import {draft,options,ids} from '@/lib/agent/affairs/test-fixtures';
const ok={status:'success' as const,message:'已保存',receipt:null,objectId:ids.project,reused:false};
it('freezes content, pauses at unknown B, retries exact command and never resends A',async()=>{
 const a=draft({name:'A'}),b=draft({name:'B'}),c=draft({name:'C'});
 const queue=new AffairsQueue([a,b,c],options);
 const confirm=vi.fn().mockResolvedValueOnce(ok).mockResolvedValueOnce({...ok,status:'uncertain',objectId:null}).mockResolvedValue(ok);
 a.name='changed';await queue.run(confirm);
 expect(confirm).toHaveBeenCalledTimes(2);expect(queue.rows.map(r=>r.status)).toEqual(['success','unknown','pending']);
 const original=confirm.mock.calls[1][0];await queue.run(confirm);
 expect(confirm.mock.calls[2][0]).toEqual(original);expect(confirm).toHaveBeenCalledTimes(4);expect(queue.rows[0].draft.name).toBe('A');
});
it('uses real parent ID and suppresses reentrant calls',async()=>{
 const parent=draft({type:'project',outcome:'成果'}),child=draft({parentDraftId:parent.draftId});
 const queue=new AffairsQueue([child,parent],options);let resolve!:(value:typeof ok)=>void;
 const confirm=vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue(ok);
 const first=queue.run(confirm);await queue.run(confirm);expect(confirm).toHaveBeenCalledTimes(1);
 resolve(ok);await first;
 expect(confirm.mock.calls[1][0]).toMatchObject({kind:'task',payload:{project_id:ids.project}});
});
it('preserves unknown when a later retry gets explicit rejection',async()=>{
 const queue=new AffairsQueue([draft()],options),confirm=vi.fn().mockResolvedValueOnce({...ok,status:'uncertain'}).mockResolvedValueOnce({...ok,status:'error'});
 await queue.run(confirm);await queue.run(confirm);expect(queue.rows[0].status).toBe('unknown');expect(queue.canEditRemaining).toBe(false);
});
it('blocks skipped parent and refuses an invalid batch before writing',()=>{
 const parent=draft({type:'project',outcome:'成果',mode:'skip'});
 expect(()=>new AffairsQueue([parent,draft({parentDraftId:parent.draftId})],options)).toThrow();
});
