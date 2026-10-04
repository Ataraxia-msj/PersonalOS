// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {confirmAgentAffairs} from './confirm';
import {draft,options,ids} from './test-fixtures';
import {toAffairsConfirmation} from './preview';
import type {AffairsQueryClient} from '@/lib/affairs/queries';
const receipt={object_id:ids.project,object_revision:1,command_id:ids.mainline,coin_delta:0,balance_coins:1,replayed:false};
it('only creates through RPC and retries identical payload even when parent subsequently archived',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:[receipt],error:null}),from=vi.fn();
 const client={rpc,from} as unknown as AffairsQueryClient;
 const command=toAffairsConfirmation(draft({parentId:ids.project}),null);
 await expect(confirmAgentAffairs(client,command)).resolves.toMatchObject({status:'success',objectId:ids.project,reused:false});
 rpc.mockResolvedValueOnce({data:[{...receipt,replayed:true}],error:null});
 await expect(confirmAgentAffairs(client,command)).resolves.toMatchObject({status:'success',receipt:{replayed:true}});
 expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);expect(from).not.toHaveBeenCalled();
});
it('rejects extra fields, unsupported operations and malformed payload before RPC',async()=>{
 const rpc=vi.fn(),client={rpc} as unknown as AffairsQueryClient;
 for(const value of [{kind:'complete',requestId:ids.mainline},{...toAffairsConfirmation(draft(),null),owner:'another'},{kind:'task',requestId:ids.mainline,payload:{title:'面试',is_core:'true'}},null]){
  await expect(confirmAgentAffairs(client,value as never)).resolves.toMatchObject({status:'error'});
 }
 expect(rpc).not.toHaveBeenCalled();
});
it('maps explicit RLS rejection separately from lost response without exposing detail',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'42501',message:'private details'}}),client={rpc} as unknown as AffairsQueryClient,command=toAffairsConfirmation(draft(),null);
 expect((await confirmAgentAffairs(client,command)).status).toBe('error');
 rpc.mockResolvedValueOnce({data:null,error:{code:'',message:'private details'},status:0});
 const unknown=await confirmAgentAffairs(client,command);expect(unknown.status).toBe('uncertain');expect(unknown.message).not.toContain('private');
});
it('verifies reuse against real owner-scoped candidates, never RPC',async()=>{
 const rpc=vi.fn(),client={rpc} as unknown as AffairsQueryClient;
 await expect(confirmAgentAffairs(client,{kind:'reuse_mainline',requestId:ids.project,objectId:ids.mainline},async()=>options)).resolves.toMatchObject({status:'success',reused:true});
 await expect(confirmAgentAffairs(client,{kind:'reuse_mainline',requestId:ids.project,objectId:ids.project},async()=>options)).resolves.toMatchObject({status:'error'});
 expect(rpc).not.toHaveBeenCalled();
});
