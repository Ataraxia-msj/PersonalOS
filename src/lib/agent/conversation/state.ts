import type {AgentConfirmationResult,ModelTransactionDraft} from '../types';
import type {ConversationItem,FinanceConversation,ModelFinanceTurn} from './types';
import {parseFieldChanges,invalidConversation} from './validation';

export const editable = (i:ConversationItem) => i.lifecycle==='editing'||i.lifecycle==='ready';
export const protectedConversation = (s:FinanceConversation) => s.items.some(i=>i.lifecycle==='saving'||i.lifecycle==='uncertain');
export function createFinanceConversation(ownerId:string,uuid:()=>string):FinanceConversation {
  return {ownerId,conversationId:uuid(),batchId:uuid(),revision:0,items:[],intentSeed:null,pendingQuestion:null,pendingTargetChanges:null,recentUserTexts:[],appliedTurnIds:[]};
}
export function newConversationItem(model:ModelTransactionDraft,uuid:()=>string,ordinal:number):ConversationItem {
  return {draft:{...model,draftId:uuid(),requestId:model.type==='expense'?null:uuid(),rawText:model.sourceText,accountName:null,categoryName:null,budgetBucketName:null,fromAccountName:null,toAccountName:null,status:'needs_input',issues:[]},ordinal,lifecycle:'editing',origins:{categoryId:model.categoryId?'suggested':'default',budgetBucketId:model.budgetBucketId?'explicit':'default',excludeFromBudget:model.excludeFromBudget?'explicit':'default'},timeAssumption:null,attempted:false,confirmation:null};
}
export function applyFinanceChanges(state:FinanceConversation,turnId:string,changes:ModelFinanceTurn,uuid:()=>string):FinanceConversation {
  if(state.appliedTurnIds.includes(turnId))return state;
  if(protectedConversation(state)||state.items.length+changes.additions.length>20)invalidConversation();
  const next=structuredClone(state),seen=new Set<string>();
  for(const update of changes.updates){
    if(seen.has(update.draftId))invalidConversation();seen.add(update.draftId);
    const item=next.items.find(i=>i.draft.draftId===update.draftId);if(!item||!editable(item))invalidConversation();
    for(const change of parseFieldChanges(update.changes)){
      Object.assign(item.draft,{[change.field]:change.value});item.origins[change.field]=change.origin;
      if(change.field==='occurredAt')item.timeAssumption=null;
    }
    if(item.draft.excludeFromBudget)item.draft.budgetBucketId=null;
    if(item.attempted&&item.draft.type!=='expense')item.draft.requestId=uuid();
    item.attempted=false;item.confirmation=null;
  }
  for(const model of changes.additions)next.items.push(newConversationItem(model,uuid,next.items.length+1));
  next.pendingTargetChanges=changes.ambiguity?.kind==='target'?structuredClone(changes.ambiguity.proposedChanges):null;
  next.revision++;next.appliedTurnIds=[...next.appliedTurnIds,turnId].slice(-32);
  return next;
}
export function setFinanceSubmission(state:FinanceConversation,draftId:string,event:{kind:'start'}|{kind:'result';result:AgentConfirmationResult}):FinanceConversation {
  const next=structuredClone(state),item=next.items.find(i=>i.draft.draftId===draftId);if(!item)invalidConversation();
  if(event.kind==='start'){
    if(protectedConversation(state)||item.lifecycle!=='ready')invalidConversation();item.lifecycle='saving';item.attempted=true;
  }else{
    if(item.lifecycle!=='saving')invalidConversation();
    const result=event.result;
    item.confirmation=(result.status==='success'||result.status==='warning')&&!result.entryId?{status:'uncertain',entryId:null,message:'保存回执缺少标识，请先核对交易记录。'}:result;
    item.lifecycle=item.confirmation.status==='success'||item.confirmation.status==='warning'?'saved':item.confirmation.status==='uncertain'?'uncertain':item.draft.status==='ready'?'ready':'editing';
  }
  next.revision++;return next;
}
