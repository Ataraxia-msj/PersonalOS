import type {AgentFinanceOptions,ModelTransactionDraft} from '../types';
import type {FinanceConversation,FinanceField,FinanceQuestion,FinanceTurn,ModelFinanceTurn} from './types';
import {editable} from './state';
import {invalidConversation} from './validation';

const blankTurn=():ModelFinanceTurn=>({kind:'patch',updates:[],additions:[],ambiguity:null,routeDomain:null,unresolvedSegments:[]});
export class StaleFinanceChoice extends Error {}
function question(state:FinanceConversation,kind:FinanceQuestion['kind'],field:FinanceField|null,ids:string[],text:string,choices:FinanceQuestion['choices']):FinanceQuestion {
 return {id:`${state.batchId}:${state.revision}:${kind}:${field??'target'}`,kind,field,targetIds:ids,text,choices};
}
export function fieldChoices(field:FinanceField,state:FinanceConversation,options:AgentFinanceOptions,targetId?:string):FinanceQuestion['choices'] {
 const d=state.items.find(i=>i.draft.draftId===targetId)?.draft;
 if(field==='type')return [{id:'expense',label:'支出'},{id:'income',label:'收入'},{id:'transfer',label:'转账'}];
 if(field==='purpose')return [{id:'general',label:'普通转账'},{id:'saving',label:'储蓄'},{id:'investment',label:'投资'},{id:'debt',label:'还款'}];
 if(field==='categoryId')return (d?.type==='income'?options.incomeCategories:options.expenseCategories).map(x=>({id:x.id,label:x.name}));
 if(field==='budgetBucketId')return options.budgetBuckets.filter(x=>x.kind===(d?.type==='expense'?'expense':d?.purpose)).map(x=>({id:x.id,label:x.name}));
 if(['accountId','fromAccountId','toAccountId'].includes(field))return options.accounts.filter(x=>{
  if(field==='accountId')return d?.type!=='income'||x.accountClass==='asset';
  if(field==='fromAccountId')return x.accountClass==='asset'&&x.id!==d?.toAccountId;
  const from=options.accounts.find(a=>a.id===d?.fromAccountId);
  return x.accountClass===(d?.purpose==='debt'?'liability':'asset')&&x.id!==d?.fromAccountId&&(!from||x.currency===from.currency);
 }).map(x=>({id:x.id,label:x.name}));
 return [];
}
export function buildFinanceQuestion(state:FinanceConversation,options:AgentFinanceOptions,ambiguity:ModelFinanceTurn['ambiguity']):FinanceQuestion|null {
 if(state.intentSeed)return question(state,'direction','type',[],'这笔是支出、收入还是转账？',fieldChoices('type',state,options));
 if(ambiguity?.kind==='target'){
  const items=state.items.filter(i=>editable(i)&&(!ambiguity.targetIds.length||ambiguity.targetIds.includes(i.draft.draftId)));
  if(!items.length)invalidConversation();
  return question(state,'target',null,items.map(i=>i.draft.draftId),'要修改哪一笔？',items.map(i=>({id:i.draft.draftId,label:`第 ${i.ordinal} 笔 · ${i.draft.description??'交易'}`})));
 }
 const item=state.items.find(i=>editable(i)&&i.draft.status!=='ready');if(!item)return null;
 const d=item.draft,issues=d.issues.join(' ');
 let field:FinanceField=ambiguity?.field??'amount';
 if(!ambiguity?.field){
  if(d.amount===null)field='amount';
  else if(issues.includes('时间')||issues.includes('日期'))field='occurredAt';
  else if(d.type==='transfer')field=!d.purpose?'purpose':issues.includes('转出')?'fromAccountId':issues.includes('转入')||issues.includes('币种')?'toAccountId':'budgetBucketId';
  else field=issues.includes('账户')?'accountId':issues.includes('分类')&&issues.includes('预算')?'budgetBucketId':'categoryId';
 }
 const labels:Partial<Record<FinanceField,string>>={amount:'金额是多少？',occurredAt:'什么时候发生的？',accountId:d.type==='income'?'收入到了哪个账户？':'用哪个账户支付？',categoryId:'归到哪个分类？',budgetBucketId:'归到哪个预算分类？',fromAccountId:'从哪个账户转出？',toAccountId:'转入哪个账户？',purpose:'这笔转账是什么用途？'};
 return question(state,'field',field,[d.draftId],`第 ${item.ordinal} 笔：${labels[field]??'请补充这项信息。'}`,fieldChoices(field,state,options,d.draftId));
}
export function resolveFinanceSelection(state:FinanceConversation,selection:Extract<FinanceTurn,{kind:'selection'}>,options:AgentFinanceOptions):ModelFinanceTurn {
 const previous=state.pendingQuestion;if(!previous||previous.id!==selection.questionId||!previous.choices.some(c=>c.id===selection.choiceId))invalidConversation();
 const ambiguity=previous.kind==='target'?{kind:'target' as const,field:null,targetIds:previous.targetIds,proposedChanges:state.pendingTargetChanges??[]}:previous.kind==='field'?{kind:'field' as const,field:previous.field,targetIds:previous.targetIds,proposedChanges:[]}:null;
 const rebuilt=buildFinanceQuestion(state,options,ambiguity);
 if(!rebuilt||rebuilt.kind!==previous.kind||!rebuilt.choices.some(c=>c.id===selection.choiceId))throw new StaleFinanceChoice();
 const result=blankTurn();
 if(previous.kind==='target'){if(!state.pendingTargetChanges?.length)invalidConversation();result.updates=[{draftId:selection.choiceId,changes:state.pendingTargetChanges}];}
 else if(previous.kind==='direction'){
  if(!state.intentSeed)invalidConversation();
  const draft:ModelTransactionDraft={type:selection.choiceId as ModelTransactionDraft['type'],accountId:selection.choiceId==='transfer'?null:state.intentSeed.accountId,fromAccountId:selection.choiceId==='transfer'?state.intentSeed.accountId:null,toAccountId:null,amount:null,description:null,memo:null,occurredAt:null,categoryId:null,budgetBucketId:null,excludeFromBudget:false,purpose:null,sourceText:[...state.intentSeed.rawText].slice(0,1000).join('')};
  result.kind='append';result.additions=[draft];
 }else{if(!previous.field||!previous.targetIds.length)invalidConversation();result.updates=previous.targetIds.map(draftId=>({draftId,changes:[{field:previous.field!,value:selection.choiceId,origin:'explicit'}]}));}
 return result;
}
