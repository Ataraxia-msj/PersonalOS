// @vitest-environment node
import {beforeEach,it,expect,vi} from 'vitest';
import {createClient} from '@/lib/supabase/server';
import {confirmAgentAffairs} from '@/lib/agent/affairs/confirm';
import {getAgentTaskDuplicates} from '@/lib/affairs/service';
import {revalidatePath} from 'next/cache';
import {confirmAgentAffairsAction,checkAgentAffairsDuplicatesAction} from './agent-affairs-actions';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
vi.mock('@/lib/agent/affairs/confirm',()=>({confirmAgentAffairs:vi.fn()}));
vi.mock('@/lib/affairs/service',()=>({getAgentTaskDuplicates:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
const getClaims=vi.fn(),client={auth:{getClaims}};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(createClient).mockResolvedValue(client as never);getClaims.mockResolvedValue({data:{claims:{sub:'user'}},error:null});});
it('requires claims before any mutation or duplicate reads',async()=>{
 getClaims.mockResolvedValue({data:null,error:null});
 expect((await confirmAgentAffairsAction({} as never)).status).toBe('error');expect((await checkAgentAffairsDuplicatesAction(['面试'])).status).toBe('error');
 expect(confirmAgentAffairs).not.toHaveBeenCalled();expect(getAgentTaskDuplicates).not.toHaveBeenCalled();
});
it('preserves success when UI invalidation fails',async()=>{
 vi.mocked(confirmAgentAffairs).mockResolvedValue({status:'success',message:'已保存',receipt:null,objectId:'id',reused:false});
 vi.mocked(revalidatePath).mockImplementation(()=>{throw new Error('failed');});
 expect(await confirmAgentAffairsAction({} as never)).toMatchObject({status:'success',objectId:'id',message:expect.stringMatching(/刷新/)});
 expect(confirmAgentAffairs).toHaveBeenCalledWith(client,{});
});
it('uses the validated client for exact title duplicate lookup',async()=>{
 vi.mocked(getAgentTaskDuplicates).mockResolvedValue([]);
 expect(await checkAgentAffairsDuplicatesAction(['面试'])).toEqual({status:'success',items:[]});
 expect(getAgentTaskDuplicates).toHaveBeenCalledWith(client,['面试']);
});
