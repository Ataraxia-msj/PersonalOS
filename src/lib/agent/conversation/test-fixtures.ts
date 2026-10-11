import type { AgentFinanceOptions, ModelTransactionDraft } from '../types';
import type { ConversationItem, FinanceConversation, FinanceTurnInput, ModelFinanceTurn } from './types';

export const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const financeOptions: AgentFinanceOptions = {
  accounts: [{id:id(1),name:'微信',accountClass:'asset',currency:'CNY'}, {id:id(2),name:'情侣小荷包',accountClass:'asset',currency:'CNY'}, {id:id(3),name:'助学贷款',accountClass:'liability',currency:'CNY'}],
  expenseCategories: [{id:id(4),name:'餐饮',defaultBudgetBucketId:id(6)}, {id:id(5),name:'学习',defaultBudgetBucketId:null}],
  incomeCategories: [{id:id(7),name:'工资'}],
  budgetBuckets: [{id:id(6),name:'变动必要开销',kind:'expense'}, {id:id(8),name:'储蓄',kind:'saving'}, {id:id(9),name:'还款',kind:'debt'}],
};
export const meal: ModelTransactionDraft = {type:'expense',sourceText:'午饭花了20',amount:20,description:'午饭',accountId:null,categoryId:id(4),budgetBucketId:null,excludeFromBudget:false,occurredAt:null,memo:null,fromAccountId:null,toAccountId:null,purpose:null};
export function expenseItem(overrides: Partial<ConversationItem> = {}): ConversationItem {
  return {draft:{...meal,draftId:id(10),requestId:null,rawText:meal.sourceText,accountName:null,categoryName:'餐饮',budgetBucketName:null,fromAccountName:null,toAccountName:null,status:'needs_input',issues:['需要选择账户']},ordinal:1,lifecycle:'editing',origins:{categoryId:'suggested'},timeAssumption:null,attempted:false,confirmation:null,budgetChoice:null,...overrides};
}
export function conversation(overrides: Partial<FinanceConversation> = {}): FinanceConversation {
  return {ownerId:id(20),conversationId:id(21),batchId:id(22),revision:0,items:[expenseItem()],intentSeed:null,pendingQuestion:null,pendingTargetChanges:null,recentUserTexts:[],appliedTurnIds:[],...overrides};
}
export function textInput(rawText:string,state:FinanceConversation|null=conversation()):FinanceTurnInput {
  return {ownerId:id(20),state,turnId:id(30),baseRevision:state?.revision??0,turn:{kind:'text',rawText}};
}
export function modelTurn(overrides:Partial<ModelFinanceTurn>={}):ModelFinanceTurn {
  return {kind:'patch',updates:[],additions:[],ambiguity:null,routeDomain:null,unresolvedSegments:[],...overrides};
}
