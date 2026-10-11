// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {handleFinanceTurn} from './orchestrator';
import {conversation,expenseItem,financeOptions,id,meal,modelTurn,textInput} from './test-fixtures';
const now=new Date('2026-10-11T10:00:00+08:00');
function deps(interpret=vi.fn().mockResolvedValue(modelTurn({kind:'append',additions:[meal]}))){let n=60;return {now,uuid:()=>id(n++),interpret};}
it('keeps the same meal when a short account answer follows',async()=>{
 const dependencies=deps();const first=await handleFinanceTurn(textInput('午饭花了20',null),financeOptions,dependencies);
 expect(first.state.pendingQuestion?.field).toBe('accountId');
 const input={...textInput('情侣小荷包',first.state),turnId:id(31)};
 const second=await handleFinanceTurn(input,financeOptions,dependencies);
 expect(second.state.items).toHaveLength(1);expect(second.state.items[0].draft.draftId).toBe(first.state.items[0].draft.draftId);
 expect(second.state.items[0].draft.amount).toBe(20);expect(second.state.items[0].lifecycle).toBe('ready');expect(dependencies.interpret).toHaveBeenCalledOnce();
});
it('applies all expense accounts and second-item exclusion without changing other types',async()=>{
 const a=expenseItem(),b=expenseItem({ordinal:2,draft:{...a.draft,draftId:id(11)}}),c=expenseItem({ordinal:3,draft:{...a.draft,draftId:id(12),type:'income'}});
 const first=await handleFinanceTurn(textInput('都是微信付的',conversation({items:[a,b,c]})),financeOptions,deps());
 expect(first.state.items.map(i=>i.draft.accountId)).toEqual([id(1),id(1),null]);
 const second=await handleFinanceTurn({...textInput('第二笔不计预算',first.state),turnId:id(31)},financeOptions,deps());
 expect(second.state.items.map(i=>i.draft.excludeFromBudget)).toEqual([false,true,false]);
});
it('resolves ambiguous targeting deterministically and rejects invalid operations atomically',async()=>{
 const a=expenseItem(),b=expenseItem({ordinal:2,draft:{...a.draft,draftId:id(11)}});
 const interpret=vi.fn().mockResolvedValue(modelTurn({kind:'clarify',ambiguity:{kind:'target',field:null,targetIds:[id(10),id(11)],proposedChanges:[{field:'amount',value:25,origin:'explicit'}]}}));
 const first=await handleFinanceTurn(textInput('这笔改25',conversation({items:[a,b]})),financeOptions,deps(interpret));
 const second=await handleFinanceTurn({...textInput('',first.state),turnId:id(31),turn:{kind:'selection',questionId:first.state.pendingQuestion!.id,choiceId:id(11)}},financeOptions,deps(interpret));
 expect(second.state.items.map(i=>i.draft.amount)).toEqual([20,25]);expect(interpret).toHaveBeenCalledOnce();
 interpret.mockResolvedValueOnce(modelTurn({updates:[{draftId:id(10),changes:[{field:'accountId',value:id(99),origin:'explicit'}]}]}));
 await expect(handleFinanceTurn(textInput('未知账户',conversation()),financeOptions,deps(interpret))).rejects.toThrow();
});
it('keeps a bare account as a direction seed instead of guessing expense',async()=>{
 const dependencies=deps();const first=await handleFinanceTurn(textInput('情侣小荷包',null),financeOptions,dependencies);
 expect(first.state.items).toHaveLength(0);expect(first.state.intentSeed?.accountId).toBe(id(2));
 const second=await handleFinanceTurn({...textInput('',first.state),turnId:id(31),turn:{kind:'selection',questionId:first.state.pendingQuestion!.id,choiceId:'expense'}},financeOptions,dependencies);
 expect(second.state.items[0].draft.accountId).toBe(id(2));expect(second.state.pendingQuestion?.field).toBe('amount');expect(dependencies.interpret).not.toHaveBeenCalled();
});
