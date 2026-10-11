import type {AgentConfirmationResult, AgentFinanceOptions, AgentTransactionDraft, ModelTransactionDraft} from '../types';
import type {AffairsInterpretation} from '../affairs/types';

export const financeFields = ['type','occurredAt','amount','description','memo','accountId','categoryId','budgetBucketId','excludeFromBudget','fromAccountId','toAccountId','purpose'] as const;
export type FinanceField = typeof financeFields[number];
export type FieldOrigin = 'explicit'|'suggested'|'default';
export interface FieldChange {field:FinanceField;value:string|number|boolean|null;origin:FieldOrigin}
export interface ConversationItem {
  draft:AgentTransactionDraft; ordinal:number; lifecycle:'editing'|'ready'|'saving'|'saved'|'uncertain'|'discarded';
  origins:Partial<Record<FinanceField,FieldOrigin>>;timeAssumption:'recorded_now'|'date_only'|null;
  attempted:boolean;confirmation:AgentConfirmationResult|null;budgetChoice:string|null;
}
export interface FinanceQuestion {id:string;kind:'field'|'target'|'direction';field:FinanceField|null;targetIds:string[];text:string;choices:Array<{id:string;label:string}>}
export interface FinanceConversation {
  ownerId:string;conversationId:string;batchId:string;revision:number;items:ConversationItem[];
  intentSeed:{rawText:string;accountId:string}|null;pendingQuestion:FinanceQuestion|null;pendingTargetChanges:FieldChange[]|null;
  recentUserTexts:string[];appliedTurnIds:string[];
}
export type FinanceTurn = {kind:'text';rawText:string}|{kind:'selection';questionId:string;choiceId:string}|{kind:'edit';draftId:string;changes:FieldChange[]}|{kind:'discard';draftId:string};
export interface FinanceTurnInput {ownerId:string;state:FinanceConversation|null;turnId:string;baseRevision:number;turn:FinanceTurn}
export interface ModelFinanceTurn {
  kind:'patch'|'append'|'clarify'|'route';updates:Array<{draftId:string;changes:FieldChange[]}>;additions:ModelTransactionDraft[];
  ambiguity:{kind:'field'|'target'|'direction';field:FinanceField|null;targetIds:string[];proposedChanges:FieldChange[]}|null;
  routeDomain:'affairs'|'mixed'|'unsupported'|null;unresolvedSegments:string[];
}
export type AgentTurnResult =
  | {status:'success';domain:'finance';state:FinanceConversation;options:AgentFinanceOptions;message:string;turnId:string;baseRevision:number;ownerId:string}
  | {status:'success';domain:'affairs';interpretation:AffairsInterpretation;message:string;turnId:string;baseRevision:number;ownerId:string}
  | {status:'error';domain:null;message:string;turnId:string;baseRevision:number;identityChanged?:boolean};
export interface FinanceConversationContext extends AgentFinanceOptions {
  rawText:string;nowShanghai:string;items:Array<ModelTransactionDraft & {draftId:string;ordinal:number}>;
  pendingQuestion:FinanceQuestion|null;intentSeed:FinanceConversation['intentSeed'];recentUserTexts:string[];
}
