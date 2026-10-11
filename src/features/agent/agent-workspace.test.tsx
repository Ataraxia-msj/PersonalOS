import {act,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,it,expect,vi} from 'vitest';
import {AgentWorkspace} from './agent-workspace';
import {handleFinanceTurn} from '@/lib/agent/conversation/orchestrator';
import {id,financeOptions,meal,modelTurn} from '@/lib/agent/conversation/test-fixtures';
import type {AgentTurnResult,FinanceTurnInput} from '@/lib/agent/conversation/types';
import type {AgentConfirmationResult} from '@/lib/agent/types';
import {draft as affairsDraft,options as affairsOptions} from '@/lib/agent/affairs/test-fixtures';
beforeEach(()=>sessionStorage.clear());
const identityAction=async()=>({status:'success' as const,ownerId:id(20)});
function realTurnAction(){let n=60;const interpret=vi.fn().mockResolvedValue(modelTurn({kind:'append',additions:[meal]}));return vi.fn(async(input:FinanceTurnInput):Promise<AgentTurnResult>=>{const result=await handleFinanceTurn(input,financeOptions,{now:new Date('2026-10-11T10:00:00+08:00'),uuid:()=>id(n++),interpret});return {status:'success',domain:'finance',state:result.state,options:financeOptions,message:result.message,ownerId:input.ownerId,turnId:input.turnId,baseRevision:input.baseRevision};});}
async function send(user:ReturnType<typeof userEvent.setup>,text:string){await user.type(screen.getByRole('textbox',{name:'给 Agent 发消息'}),text);await user.click(screen.getByRole('button',{name:'发送消息'}));}
it('updates one current preview across a short account answer',async()=>{
 const user=userEvent.setup(),turnAction=realTurnAction();render(<AgentWorkspace ownerId={id(20)} turnAction={turnAction} identityAction={identityAction}/>);
 await send(user,'午饭花了20');expect(await screen.findByRole('button',{name:'情侣小荷包'})).toBeVisible();
 await send(user,'情侣小荷包');
 await waitFor(()=>expect(screen.getAllByRole('article',{name:/交易预览/})).toHaveLength(1));
 const card=screen.getByRole('article',{name:'交易预览 1'});expect(within(card).getByText('¥20.00')).toBeVisible();expect(within(card).getByText('情侣小荷包')).toBeVisible();expect(within(card).getByRole('button',{name:'确认并记录'})).toBeEnabled();
 expect(turnAction.mock.calls[1][0].state?.items[0].draft.amount).toBe(20);
});
it('does not submit during IME composition but supports normal Enter',async()=>{
 const action=realTurnAction();render(<AgentWorkspace ownerId={id(20)} turnAction={action} identityAction={identityAction}/>);
 const input=screen.getByRole('textbox',{name:'给 Agent 发消息'});fireEvent.change(input,{target:{value:'午饭花了20'}});fireEvent.compositionStart(input);fireEvent.keyDown(input,{key:'Enter',isComposing:true});expect(action).not.toHaveBeenCalled();
 fireEvent.compositionEnd(input);fireEvent.keyDown(input,{key:'Enter'});await waitFor(()=>expect(action).toHaveBeenCalledOnce());
});
it('locks input and candidates during uncertain finance confirmation',async()=>{
 const user=userEvent.setup();let resolve!:(r:AgentConfirmationResult)=>void;const confirm=vi.fn(()=>new Promise<AgentConfirmationResult>(r=>resolve=r));
 render(<AgentWorkspace ownerId={id(20)} turnAction={realTurnAction()} identityAction={identityAction} confirmAction={confirm}/>);
 await send(user,'午饭花了20');await user.click(await screen.findByRole('button',{name:'情侣小荷包'}));await user.click(await screen.findByRole('button',{name:'确认并记录'}));
 await waitFor(()=>expect(confirm).toHaveBeenCalledOnce());expect(screen.getByRole('textbox',{name:'给 Agent 发消息'})).toBeDisabled();
 await act(()=>resolve({status:'uncertain',entryId:null,message:'结果待核对'}));expect(screen.getByRole('button',{name:'结束待核对保护'})).toBeDisabled();
 await user.click(screen.getByLabelText('我已核对交易记录'));await user.click(screen.getByRole('button',{name:'结束待核对保护'}));expect(confirm).toHaveBeenCalledOnce();expect(screen.getByRole('textbox',{name:'给 Agent 发消息'})).toBeEnabled();
});
it('preserves previews on ordinary action failures without inventing data',async()=>{
 const user=userEvent.setup(),action=realTurnAction();render(<AgentWorkspace ownerId={id(20)} turnAction={action} identityAction={identityAction}/>);
 await send(user,'午饭花了20');
 action.mockImplementationOnce(async input=>({status:'error',domain:null,message:'服务暂时不可用',turnId:input.turnId,baseRevision:input.baseRevision}));
 await send(user,'补充');expect(await screen.findByRole('alert')).toHaveTextContent('服务暂时不可用');expect(screen.getAllByRole('article',{name:/交易预览/})).toHaveLength(1);
});
it('preserves affairs previews and protects the shared composer for unknown saves',async()=>{
 const user=userEvent.setup(),confirm=vi.fn().mockResolvedValue({status:'uncertain',message:'事务结果未知',receipt:null,objectId:null,reused:false});
 const turnAction=async(input:FinanceTurnInput):Promise<AgentTurnResult>=>({status:'success',domain:'affairs',message:'事务预览',interpretation:{domain:'affairs',message:'事务预览',items:[affairsDraft()],options:affairsOptions,duplicates:[],unresolvedSegments:[]},ownerId:input.ownerId,turnId:input.turnId,baseRevision:input.baseRevision});
 render(<AgentWorkspace ownerId={id(20)} turnAction={turnAction} identityAction={identityAction} affairsConfirmAction={confirm} affairsDuplicateAction={async()=>({status:'success',items:[]})}/>);
 await send(user,'面试');expect(await screen.findByRole('article',{name:'事务预览 1'})).toBeVisible();await user.click(screen.getByRole('button',{name:/确认保存/}));expect(await screen.findByRole('alert')).toHaveTextContent('事务结果未知');expect(screen.getByRole('textbox',{name:'给 Agent 发消息'})).toBeDisabled();
});
