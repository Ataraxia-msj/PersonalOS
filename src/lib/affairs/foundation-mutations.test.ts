import {it,expect,vi} from 'vitest';
import {executeFoundationCommand} from './foundation-mutations';
import type {AffairsQueryClient} from './queries';
it('sends typed foundation args to one RPC, without client-created coin fields',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:[{object_id:'o',object_revision:1,command_id:'c',coin_delta:0,balance_coins:0,replayed:false}],error:null});
 const command={operation:'create_affairs_task' as const,args:{p_request_id:'r',p_payload:{title:'T',description:null,project_id:null,is_core:false,core_reason:null,completion_criteria:null,due_date:null}}};
 expect((await executeFoundationCommand({rpc} as unknown as AffairsQueryClient,command)).coinDelta).toBe(0);
 expect(rpc).toHaveBeenCalledWith(command.operation,command.args);
 rpc.mockResolvedValue({data:[],error:null});await expect(executeFoundationCommand({rpc} as unknown as AffairsQueryClient,command)).rejects.toThrow('missing_receipt');
});
