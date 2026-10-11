import {deriveAgentDraft} from '../orchestrator';
import {shanghaiDateTime} from '@/lib/finance/reconciliation-validation';
import type {AgentFinanceOptions} from '../types';
import type {ConversationItem} from './types';
import {editable} from './state';

export function normalizeConversationItem(item:ConversationItem,options:AgentFinanceOptions,now:Date,uuid:()=>string):ConversationItem {
  if(!editable(item))return item;
  const next=structuredClone(item),model={...next.draft};
  if(!model.occurredAt){model.occurredAt=shanghaiDateTime(now).slice(0,16);next.timeAssumption='recorded_now';next.origins.occurredAt='default';}
  else if(/^\d{4}-\d{2}-\d{2}$/.test(model.occurredAt)){model.occurredAt+='T00:00';next.timeAssumption='date_only';}
  if(!model.description?.trim())model.description=model.type==='expense'?'支出':model.type==='income'?'收入':'转账';
  model.budgetBucketId=next.origins.budgetBucketId==='explicit'?next.budgetChoice:null;
  if(model.type!=='expense'&&!model.requestId)model.requestId=uuid();
  const draft=deriveAgentDraft(model,next.draft.rawText,options,now,{draftId:model.draftId,requestId:model.requestId});
  // Invalid explicit time must remain visible and must not default to today on a later turn.
  if(!draft.occurredAt)draft.occurredAt=model.occurredAt;
  next.draft=draft;next.lifecycle=draft.status==='ready'?'ready':'editing';
  return next;
}
