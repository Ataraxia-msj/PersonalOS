// @vitest-environment node
import {it,expect} from 'vitest';
import {buildFinanceQuestion,resolveFinanceSelection} from './questions';
import {normalizeConversationItem} from './drafts';
import {conversation,expenseItem,financeOptions,id} from './test-fixtures';
it('asks one focused real account question and validates refreshed choices',()=>{
 const state=conversation({items:[normalizeConversationItem(expenseItem(),financeOptions,new Date('2026-10-11T10:00:00+08:00'),()=>id(50))]});
 state.pendingQuestion=buildFinanceQuestion(state,financeOptions,null);
 expect(state.pendingQuestion?.field).toBe('accountId');expect(state.pendingQuestion?.choices[1].label).toBe('情侣小荷包');
 const selection={kind:'selection' as const,questionId:state.pendingQuestion!.id,choiceId:id(2)};
 expect(resolveFinanceSelection(state,selection,financeOptions).updates[0].changes[0].value).toBe(id(2));
 expect(()=>resolveFinanceSelection(state,selection,{...financeOptions,accounts:financeOptions.accounts.slice(0,1)})).toThrow();
});
it('uses stable ordinals for target clarification and preserves pending changes',()=>{
 const a=expenseItem(),b=expenseItem({ordinal:2,draft:{...a.draft,draftId:id(11)}});
 const state=conversation({items:[a,b],pendingTargetChanges:[{field:'amount',value:25,origin:'explicit'}]});
 state.pendingQuestion=buildFinanceQuestion(state,financeOptions,{kind:'target',field:null,targetIds:[id(10),id(11)],proposedChanges:state.pendingTargetChanges!});
 const result=resolveFinanceSelection(state,{kind:'selection',questionId:state.pendingQuestion!.id,choiceId:id(11)},financeOptions);
 expect(result.updates).toEqual([{draftId:id(11),changes:state.pendingTargetChanges}]);
});
