import {expect,it,vi} from 'vitest';
import {executeInboxCommand} from './inbox-mutations';
import type {AffairsQueryClient} from './queries';
it('uses one RPC and returns target identity from its real receipt',async()=>{
 const rpc=vi.fn(async()=>({data:[{object_id:'inbox',object_revision:2,command_id:'c',coin_delta:0,balance_coins:0,replayed:false,resolved_resource:'task',resolved_object_id:'t',resolved_object_revision:1}],error:null}));
 const result=await executeInboxCommand({rpc} as unknown as AffairsQueryClient,{operation:'resolve_affairs_inbox_entry',args:{p_request_id:'r',p_inbox_id:'i',p_expected_revision:'1',p_target:'task',p_payload:{title:'t',description:null,project_id:null,is_core:false,core_reason:null,completion_criteria:null,due_date:null}}});
 expect(rpc).toHaveBeenCalledTimes(1);expect(result).toMatchObject({objectId:'inbox',resolvedObjectId:'t',coinDelta:0});
});
it.each([{data:null,error:{code:'',message:'fetch failed'},status:0},{data:[],error:null,status:200},{data:null,error:{code:'P0001',message:'stale_revision'},status:400}])('does not fake success for a failed/unknown RPC response',async result=>{
 await expect(executeInboxCommand({rpc:async()=>result} as unknown as AffairsQueryClient,{operation:'create_affairs_inbox_entry',args:{p_request_id:'r',p_content:'text'}})).rejects.toThrow();
});
