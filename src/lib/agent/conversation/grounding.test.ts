// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {handleFinanceTurn} from './orchestrator';
import {conversation,expenseItem,financeOptions,id,meal,modelTurn,textInput} from './test-fixtures';
const now=new Date('2026-10-12T10:00:00+08:00');
function deps(result:ReturnType<typeof modelTurn>){let n=60;return {now,uuid:()=>id(n++),interpret:vi.fn().mockResolvedValue(result)};}

it('drops model-guessed accounts and dates, but retains actual amounts and asks for a shared account',async()=>{
 const additions=[['早餐7.2元',7.2],['午餐16元',16],['加餐6元',6]].map(([sourceText,amount])=>({...meal,sourceText:String(sourceText),amount:Number(amount),accountId:id(1),occurredAt:'2026-10-12'}));
 const result=await handleFinanceTurn(textInput('早餐7.2元，午餐16元，加餐6元',null),financeOptions,deps(modelTurn({kind:'append',additions})));
 expect(result.state.items.map(i=>i.draft.accountId)).toEqual([null,null,null]);
 expect(result.state.items.map(i=>i.draft.amount)).toEqual([7.2,16,6]);
 expect(result.state.items.map(i=>i.draft.occurredAt)).toEqual(['2026-10-12T10:00','2026-10-12T10:00','2026-10-12T10:00']);
 expect(result.state.pendingQuestion?.targetIds).toHaveLength(3);
 const next=await handleFinanceTurn({...textInput('微信',result.state),turnId:id(31)},financeOptions,deps(modelTurn()));
 expect(next.state.items.map(i=>i.draft.accountId)).toEqual([id(1),id(1),id(1)]);
});
it('lets the user decline a shared account and answer one expense at a time',async()=>{
 const a=expenseItem(),b=expenseItem({ordinal:2,draft:{...a.draft,draftId:id(11)}});
 const first=await handleFinanceTurn(textInput('说明',conversation({items:[a,b]})),financeOptions,deps(modelTurn()));
 expect(first.state.pendingQuestion?.targetIds).toHaveLength(2);
 const result=await handleFinanceTurn({...textInput('不一样',first.state),turnId:id(31)},financeOptions,deps(modelTurn()));
 expect(result.state.pendingQuestion?.targetIds).toEqual([id(10)]);
 const next=await handleFinanceTurn({...textInput('微信',result.state),turnId:id(32)},financeOptions,deps(modelTurn()));
 expect(next.state.items.map(i=>i.draft.accountId)).toEqual([id(1),null]);expect(next.state.pendingQuestion?.targetIds).toEqual([id(11)]);
});
it('does not overwrite a chosen account while the user only corrects the amount',async()=>{
 const item=expenseItem({draft:{...expenseItem().draft,accountId:id(2)}});
 const result=await handleFinanceTurn(textInput('改成25',conversation({items:[item]})),financeOptions,deps(modelTurn({updates:[{draftId:id(10),changes:[{field:'amount',value:25,origin:'explicit'},{field:'accountId',value:id(1),origin:'suggested'}]}]})));
 expect(result.state.items[0].draft.accountId).toBe(id(2));expect(result.state.items[0].draft.amount).toBe(25);
});
it('asks about a specific ready draft when the model cannot safely resolve a correction',async()=>{
 const item=expenseItem({lifecycle:'ready',draft:{...expenseItem().draft,accountId:id(1),status:'ready',issues:[]}});
 const result=await handleFinanceTurn(textInput('账户不对',conversation({items:[item]})),financeOptions,deps(modelTurn({kind:'clarify',ambiguity:{kind:'field',field:'accountId',targetIds:[id(10)],proposedChanges:[]}})));
 expect(result.state.pendingQuestion?.field).toBe('accountId');expect(result.state.items[0].draft.accountId).toBe(id(1));
});
it('keeps explicitly provided per-entry accounts and a past date',async()=>{
 const result=await handleFinanceTurn(textInput('昨天微信早餐20元，情侣小荷包午餐20元',null),financeOptions,deps(modelTurn({kind:'append',additions:[{...meal,sourceText:'昨天微信早餐20元',accountId:id(1),occurredAt:'2026-10-11'},{...meal,sourceText:'情侣小荷包午餐20元',accountId:id(2),occurredAt:null}]})));
 expect(result.state.items.map(i=>i.draft.accountId)).toEqual([id(1),id(2)]);expect(result.state.items[0].draft.occurredAt).toBe('2026-10-11T00:00');
});
it('requires an explicit target even when the model guessed the first draft for a deictic correction',async()=>{
 const a=expenseItem({draft:{...expenseItem().draft,accountId:id(1)}}),b=expenseItem({ordinal:2,draft:{...a.draft,draftId:id(11),amount:15}});
 const dependencies=deps(modelTurn({updates:[{draftId:id(10),changes:[{field:'amount',value:18,origin:'explicit'}]}]}));
 const result=await handleFinanceTurn(textInput('这笔改成18元',conversation({items:[a,b]})),financeOptions,dependencies);
 expect(result.state.items.map(i=>i.draft.amount)).toEqual([20,15]);expect(result.state.pendingQuestion?.kind).toBe('target');
 const selected=await handleFinanceTurn({...textInput('',result.state),turnId:id(31),turn:{kind:'selection',questionId:result.state.pendingQuestion!.id,choiceId:id(11)}},financeOptions,dependencies);
 expect(selected.state.items.map(i=>i.draft.amount)).toEqual([20,18]);
});
it('can ask what to change after selecting a target with no proposed field yet',async()=>{
 const a=expenseItem({draft:{...expenseItem().draft,accountId:id(1)}}),b=expenseItem({ordinal:2,draft:{...a.draft,draftId:id(11)}});
 const dependencies=deps(modelTurn({kind:'clarify',ambiguity:{kind:'target',field:null,targetIds:[id(10),id(11)],proposedChanges:[]}}));
 const result=await handleFinanceTurn(textInput('这笔修改一下',conversation({items:[a,b]})),financeOptions,dependencies);
 const selected=await handleFinanceTurn({...textInput('',result.state),turnId:id(31),turn:{kind:'selection',questionId:result.state.pendingQuestion!.id,choiceId:id(11)}},financeOptions,dependencies);
 expect(selected.state.items.map(i=>i.draft.amount)).toEqual([20,20]);expect(selected.state.pendingQuestion?.targetIds).toEqual([id(11)]);
 expect(selected.state.pendingQuestion?.text).toMatch(/改什么|修改什么/);
});
it('grounds each update in its own ordinal clause, not facts said about another entry',async()=>{
 const a=expenseItem({draft:{...expenseItem().draft,accountId:id(2)}}),b=expenseItem({ordinal:2,draft:{...a.draft,draftId:id(11)}});
 const changes=[{field:'accountId' as const,value:id(1),origin:'explicit' as const},{field:'occurredAt' as const,value:'2026-10-11',origin:'explicit' as const}];
 const result=await handleFinanceTurn(textInput('第一笔改成25元，第二笔昨天用微信',conversation({items:[a,b]})),financeOptions,deps(modelTurn({updates:[{draftId:id(10),changes:[{field:'amount',value:25,origin:'explicit'},...changes]},{draftId:id(11),changes}]})));
 expect(result.state.items.map(i=>i.draft.accountId)).toEqual([id(2),id(1)]);
 expect(result.state.items.map(i=>i.draft.occurredAt)).toEqual(['2026-10-12T10:00','2026-10-11T00:00']);
});
it('does not reuse old-entry facts as the account or date of an independent addition',async()=>{
 const a=expenseItem({draft:{...expenseItem().draft,accountId:id(2)}});
 const result=await handleFinanceTurn(textInput('第一笔昨天用微信，另外咖啡15元',conversation({items:[a]})),financeOptions,deps(modelTurn({updates:[{draftId:id(10),changes:[{field:'accountId',value:id(1),origin:'explicit'},{field:'occurredAt',value:'2026-10-11',origin:'explicit'}]}],additions:[{...meal,sourceText:'另外咖啡15元',amount:15,accountId:id(1),occurredAt:'2026-10-11'}]})));
 expect(result.state.items[1].draft.accountId).toBeNull();expect(result.state.items[1].draft.occurredAt).toBe('2026-10-12T10:00');
});
it('limits a shared-question answer to the still-missing entries',async()=>{
 const a=expenseItem({draft:{...expenseItem().draft,accountId:id(2)}}),b=expenseItem({ordinal:2,draft:{...expenseItem().draft,draftId:id(11)}}),c=expenseItem({ordinal:3,draft:{...expenseItem().draft,draftId:id(12)}});
 const first=await handleFinanceTurn(textInput('补充',conversation({items:[a,b,c]})),financeOptions,deps(modelTurn()));
 const result=await handleFinanceTurn({...textInput('都是微信付的',first.state),turnId:id(31)},financeOptions,deps(modelTurn()));
 expect(result.state.items.map(i=>i.draft.accountId)).toEqual([id(2),id(1),id(1)]);
});
it('clarifies a common deictic variant instead of accepting a guessed first target',async()=>{
 const a=expenseItem({draft:{...expenseItem().draft,accountId:id(1)}}),b=expenseItem({ordinal:2,draft:{...a.draft,draftId:id(11),amount:15}});
 const result=await handleFinanceTurn(textInput('这一笔改成18元',conversation({items:[a,b]})),financeOptions,deps(modelTurn({updates:[{draftId:id(10),changes:[{field:'amount',value:18,origin:'explicit'}]}]})));
 expect(result.state.items.map(i=>i.draft.amount)).toEqual([20,15]);expect(result.state.pendingQuestion?.kind).toBe('target');
});
it('preserves independent coffee facts while deferring an ambiguous correction',async()=>{
 const a=expenseItem({draft:{...expenseItem().draft,accountId:id(1)}}),b=expenseItem({ordinal:2,draft:{...a.draft,draftId:id(11),amount:16}});
 const dependencies=deps(modelTurn({updates:[{draftId:id(10),changes:[{field:'amount',value:18,origin:'explicit'}]}],additions:[{...meal,sourceText:'另外咖啡15元',amount:15,description:'咖啡'}]}));
 const result=await handleFinanceTurn(textInput('这笔改成18元，另外咖啡15元',conversation({items:[a,b]})),financeOptions,dependencies);
 expect(result.state.items.map(i=>i.draft.amount)).toEqual([20,16,15]);expect(result.state.pendingQuestion?.kind).toBe('target');
 const selected=await handleFinanceTurn({...textInput('',result.state),turnId:id(31),turn:{kind:'selection',questionId:result.state.pendingQuestion!.id,choiceId:id(11)}},financeOptions,dependencies);
 expect(selected.state.items.map(i=>i.draft.amount)).toEqual([20,18,15]);expect(selected.state.pendingQuestion?.targetIds).toEqual([selected.state.items[2].draft.draftId]);
});
