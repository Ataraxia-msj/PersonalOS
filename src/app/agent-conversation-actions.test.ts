// @vitest-environment node
import {beforeEach,it,expect,vi} from 'vitest';
import {createClient} from '@/lib/supabase/server';
import {getAgentFinanceOptions} from '@/lib/finance/service';
import {classifyAgentMessage} from '@/lib/agent/intent';
import {interpretAffairsMessage} from '@/lib/agent/affairs/orchestrator';
import {interpretFinanceTurn} from '@/lib/agent/qwen';
import {confirmAgentTransaction} from '@/lib/agent/confirm';
import {interpretAgentTurnAction,confirmAgentTransactionAction} from './agent-actions';
import {conversation,expenseItem,financeOptions,id,modelTurn,textInput} from '@/lib/agent/conversation/test-fixtures';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
vi.mock('@/lib/finance/service',()=>({getAgentFinanceOptions:vi.fn()}));
vi.mock('@/lib/agent/intent',()=>({classifyAgentMessage:vi.fn()}));
vi.mock('@/lib/agent/affairs/orchestrator',()=>({interpretAffairsMessage:vi.fn()}));
vi.mock('@/lib/agent/confirm',()=>({confirmAgentTransaction:vi.fn()}));
vi.mock('@/lib/agent/qwen',async importOriginal=>({...await importOriginal<object>(),interpretFinanceTurn:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
const getClaims=vi.fn(),client={auth:{getClaims}};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(createClient).mockResolvedValue(client as never);getClaims.mockResolvedValue({data:{claims:{sub:id(20)}},error:null});vi.mocked(getAgentFinanceOptions).mockResolvedValue(financeOptions);vi.mocked(classifyAgentMessage).mockResolvedValue('finance');vi.mocked(interpretFinanceTurn).mockResolvedValue(modelTurn());});
it('validates auth, uses one candidate read, and bypasses classification for active finance',async()=>{
 const result=await interpretAgentTurnAction(textInput('情侣小荷包',conversation()));
 expect(result.status).toBe('success');expect(createClient).toHaveBeenCalledOnce();expect(getClaims).toHaveBeenCalledOnce();expect(getAgentFinanceOptions).toHaveBeenCalledExactlyOnceWith(client);expect(classifyAgentMessage).not.toHaveBeenCalled();
});
it('blocks mismatched identity before model and mutation',async()=>{
 getClaims.mockResolvedValue({data:{claims:{sub:id(99)}},error:null});
 expect(await interpretAgentTurnAction(textInput('午饭20'))).toMatchObject({status:'error',identityChanged:true});
 expect(await confirmAgentTransactionAction(expenseItem().draft,id(20))).toMatchObject({status:'error',identityChanged:true});
 expect(interpretFinanceTurn).not.toHaveBeenCalled();expect(getAgentFinanceOptions).not.toHaveBeenCalled();expect(confirmAgentTransaction).not.toHaveBeenCalled();
});
it('routes only the current text to affairs on the same verified client',async()=>{
 vi.mocked(interpretFinanceTurn).mockResolvedValue(modelTurn({kind:'route',routeDomain:'affairs'}));
 vi.mocked(interpretAffairsMessage).mockResolvedValue({domain:'affairs',message:'请确认',items:[],options:{},duplicates:[],unresolvedSegments:[]} as never);
 expect(await interpretAgentTurnAction(textInput('明天面试'))).toMatchObject({status:'success',domain:'affairs'});
 expect(interpretAffairsMessage).toHaveBeenCalledExactlyOnceWith('明天面试',client);expect(confirmAgentTransaction).not.toHaveBeenCalled();
});
