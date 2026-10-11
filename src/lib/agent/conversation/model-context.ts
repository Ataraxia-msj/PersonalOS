import {shanghaiDateTime} from '@/lib/finance/reconciliation-validation';
import type {AgentFinanceOptions} from '../types';
import type {FinanceConversation,FinanceConversationContext,FinanceTurnInput} from './types';
import {editable} from './state';

export function boundedTexts(texts:string[]):string[] {
 const result:string[]=[];let size=0;
 for(const text of texts.slice(-6).reverse()){
  const length=[...text].length;if(size+length>6000)break;result.unshift(text);size+=length;
 }return result;
}
export function buildFinanceModelContext(input:FinanceTurnInput,state:FinanceConversation,options:AgentFinanceOptions,now:Date):FinanceConversationContext {
 const rawText=input.turn.kind==='text'?input.turn.rawText:'';
 const saved=state.items.filter(i=>!editable(i)).flatMap(i=>[i.draft.description,i.draft.rawText,i.draft.sourceText]).filter((s):s is string=>Boolean(s));
 const recent=state.recentUserTexts.filter(t=>!saved.some(s=>t.includes(s)));
 return {...options,rawText,nowShanghai:shanghaiDateTime(now).slice(0,16),pendingQuestion:state.pendingQuestion,intentSeed:state.intentSeed,recentUserTexts:boundedTexts([...recent,rawText]),
  items:state.items.filter(editable).map(i=>({type:i.draft.type,occurredAt:i.draft.occurredAt,amount:i.draft.amount,description:i.draft.description,memo:i.draft.memo,accountId:i.draft.accountId,categoryId:i.draft.categoryId,budgetBucketId:i.draft.budgetBucketId,excludeFromBudget:i.draft.excludeFromBudget,fromAccountId:i.draft.fromAccountId,toAccountId:i.draft.toAccountId,purpose:i.draft.purpose,sourceText:i.draft.sourceText,draftId:i.draft.draftId,ordinal:i.ordinal})),
 };
}
