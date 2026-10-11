import {beforeEach,it,expect,vi} from 'vitest';
import {renderHook,act,waitFor} from '@testing-library/react';
import {useFinanceConversation} from './use-finance-conversation';
import {conversation,expenseItem,financeOptions,id} from '@/lib/agent/conversation/test-fixtures';
import type {AgentTurnResult,FinanceTurnInput} from '@/lib/agent/conversation/types';
import type {AgentConfirmationResult} from '@/lib/agent/types';
beforeEach(()=>sessionStorage.clear());
function setup(overrides:Partial<Parameters<typeof useFinanceConversation>[0]>={}){
 const state=conversation({revision:1,items:[expenseItem({lifecycle:'ready',draft:{...expenseItem().draft,status:'ready',accountId:id(1),occurredAt:'2026-10-11T00:00',issues:[]}})]});
 const turnAction=vi.fn(async(input:FinanceTurnInput):Promise<AgentTurnResult>=>({status:'success',domain:'finance',state,options:financeOptions,message:'请确认',ownerId:input.ownerId,turnId:input.turnId,baseRevision:input.baseRevision}));
 const identityAction=vi.fn(async()=>({status:'success' as const,ownerId:id(20)}));
 const confirmAction=vi.fn(async():Promise<AgentConfirmationResult>=>({status:'success',entryId:id(80),message:'已记录'}));
 const props={ownerId:id(20),turnAction,identityAction,confirmAction,onProtectionChange:vi.fn(),...overrides};
 const hook=renderHook(()=>useFinanceConversation(props));return {...hook,turnAction,identityAction,confirmAction,props};
}
async function ready(hook:ReturnType<typeof setup>){await waitFor(()=>expect(hook.result.current.pending).toBe(false));await act(()=>hook.result.current.sendTurn({kind:'text',rawText:'午饭20'}));}
it('locks double clicks and stores marker before the RPC, then freezes success',async()=>{
 let resolve!:(value:AgentConfirmationResult)=>void;
 const confirm=vi.fn(()=>{expect(sessionStorage.getItem(`personal-os:agent:finance-submission:${id(20)}`)).not.toBeNull();return new Promise<AgentConfirmationResult>(r=>resolve=r);});
 const hook=setup({confirmAction:confirm});await ready(hook);
 let request!:Promise<void>;act(()=>{request=hook.result.current.confirm(id(10));void hook.result.current.confirm(id(10));});
 await waitFor(()=>expect(confirm).toHaveBeenCalledOnce());expect(hook.result.current.blocked).toBe(true);
 await act(async()=>{resolve({status:'success',entryId:id(80),message:'已记录'});await request;});
 expect(hook.result.current.state?.items[0].lifecycle).toBe('saved');expect(sessionStorage.length).toBe(0);
 await act(()=>hook.result.current.confirm(id(10)));expect(confirm).toHaveBeenCalledOnce();expect(confirm).toHaveBeenCalledWith(expect.any(Object),id(20));
});
it('does not write when storage fails or verified identity changes',async()=>{
 const hook=setup();await ready(hook);
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
 await act(()=>hook.result.current.confirm(id(10)));expect(hook.confirmAction).not.toHaveBeenCalled();spy.mockRestore();hook.unmount();
 const next=setup({identityAction:async()=>({status:'success',ownerId:id(99)})});await ready(next);await act(()=>next.result.current.confirm(id(10)));
 expect(next.confirmAction).not.toHaveBeenCalled();expect(next.result.current.state).toBeNull();
});
it('freezes unknown results across remount, with no retry after acknowledging',async()=>{
 const hook=setup({confirmAction:async()=>{throw new Error('network');}});await ready(hook);await act(()=>hook.result.current.confirm(id(10)));
 expect(hook.result.current.state?.items[0].lifecycle).toBe('uncertain');expect(hook.result.current.blocked).toBe(true);hook.unmount();
 const next=setup();await waitFor(()=>expect(next.result.current.restoredMarker).not.toBeNull());
 expect(next.result.current.blocked).toBe(true);await act(()=>next.result.current.acknowledgeCheckedResult(false));expect(next.result.current.blocked).toBe(true);
 await act(()=>next.result.current.acknowledgeCheckedResult(true));expect(next.result.current.blocked).toBe(false);expect(next.confirmAction).not.toHaveBeenCalled();
});
it('ignores stale responses and keeps drafts on ordinary errors',async()=>{
 const hook=setup({turnAction:async input=>({status:'error',domain:null,turnId:input.turnId,baseRevision:input.baseRevision+1,message:'迟到'})});
 await act(()=>hook.result.current.sendTurn({kind:'text',rawText:'午饭20'}));expect(hook.result.current.state).toBeNull();expect(hook.result.current.messages.some(m=>m.text==='迟到')).toBe(false);
});
it('retains protection after successful saving when marker cleanup fails',async()=>{
 const hook=setup();await ready(hook);
 const spy=vi.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw new Error('denied');});
 await act(()=>hook.result.current.confirm(id(10)));
 expect(hook.result.current.state?.items[0].lifecycle).toBe('saved');expect(hook.result.current.blocked).toBe(true);
 await act(()=>hook.result.current.confirm(id(10)));expect(hook.confirmAction).toHaveBeenCalledOnce();
 spy.mockRestore();await act(()=>hook.result.current.acknowledgeCheckedResult(true));expect(hook.result.current.blocked).toBe(false);
});
it('preserves drafts after definite errors and warns before leaving unsaved work',async()=>{
 const hook=setup({confirmAction:async()=>({status:'error',entryId:null,message:'未写入'})});await ready(hook);
 const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
 await act(()=>hook.result.current.confirm(id(10)));expect(hook.result.current.state?.items[0].lifecycle).toBe('ready');expect(hook.result.current.blocked).toBe(false);
});
it('does not release a marker or resurrect messages after unmount during submission',async()=>{
 let resolve!:(r:AgentConfirmationResult)=>void;const confirmAction=()=>new Promise<AgentConfirmationResult>(r=>resolve=r);
 const hook=setup({confirmAction});await ready(hook);let pending!:Promise<void>;act(()=>{pending=hook.result.current.confirm(id(10));});
 await waitFor(()=>expect(hook.result.current.state?.items[0].lifecycle).toBe('saving'));hook.unmount();
 await act(async()=>{resolve({status:'success',entryId:id(80),message:'已记录'});await pending;});
 expect(sessionStorage.length).toBe(1);
});
it('clears identity-bound data and settles pending for preflight and confirmation identity changes',async()=>{
 for(const preflight of [true,false]){
  const hook=setup({identityAction:async()=>({status:'success',ownerId:preflight?id(99):id(20)}),confirmAction:async()=>({status:'error',entryId:null,message:'用户改变',identityChanged:true} as AgentConfirmationResult)});
  await ready(hook);await act(()=>hook.result.current.confirm(id(10)));
  expect(hook.result.current.state).toBeNull();expect(hook.result.current.options).toBeNull();expect(hook.result.current.pending).toBe(false);expect(hook.result.current.blocked).toBe(true);
  expect(hook.result.current.messages.map(m=>m.text).join('')).not.toContain('午饭20');hook.unmount();
 }
});
it('retains read-only saved receipts when a new batch starts, but clears them for another owner',async()=>{
 const hook=setup();await ready(hook);await act(()=>hook.result.current.confirm(id(10)));
 const next=conversation({batchId:id(90),revision:1,items:[expenseItem({draft:{...expenseItem().draft,draftId:id(91)}})]});
 hook.turnAction.mockImplementationOnce(async input=>({status:'success',domain:'finance',state:next,options:financeOptions,message:'下一笔',ownerId:input.ownerId,turnId:input.turnId,baseRevision:input.baseRevision}));
 await act(()=>hook.result.current.sendTurn({kind:'text',rawText:'下一笔'}));
 expect((hook.result.current as unknown as {receipts:typeof next.items}).receipts[0].confirmation?.entryId).toBe(id(80));
 hook.props.ownerId=id(99);hook.rerender();await waitFor(()=>expect(hook.result.current.state).toBeNull());
 expect((hook.result.current as unknown as {receipts:typeof next.items}).receipts).toEqual([]);
});
