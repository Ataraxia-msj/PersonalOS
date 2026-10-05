import type {MainlineStatus,ProjectStatus,TaskStatus,AffairsReceipt,MainlineMetadata,ProjectMetadata,TaskMetadata} from '@/lib/affairs/types';
export type AffairsKind='mainline'|'project'|'task'|'capture';
export interface ModelAffairsItem {
  type:AffairsKind;sourceText:string;name:string|null;description:string|null;outcome:string|null;
  dueDate:string|null;plannedTime:string|null;yearInferred:boolean;isCore:boolean;
  plannedStartDate?:string|null;
  coreReason:string|null;completionCriteria:string|null;parentId:string|null;parentIndex:number|null;existingId:string|null;
}
export interface ModelAffairsInterpretation {message:string;items:ModelAffairsItem[];unresolvedSegments:string[];}
export interface AffairsAgentOptions {
  mainlines:Array<{id:string;name:string;status:MainlineStatus}>;
  projects:Array<{id:string;name:string;status:ProjectStatus;mainlineId:string|null}>;
  serverNowISO:string;
}
export interface AffairsTaskDuplicate {id:string;title:string;status:TaskStatus;projectId:string|null;}
export interface AffairsDraft extends ModelAffairsItem {
  draftId:string;requestId:string;rawText:string;parentDraftId:string|null;
  mode:'create'|'reuse'|'skip';reuseId:string|null;matchConfirmed:boolean;dateConfirmed:boolean;duplicateConfirmed:boolean;
  issues:string[];
}
export interface AffairsInterpretation {
  domain:'affairs';message:string;items:AffairsDraft[];options:AffairsAgentOptions;unresolvedSegments:string[];duplicates:AffairsTaskDuplicate[];
}
export type AffairsConfirmation=
 | {kind:'mainline';requestId:string;payload:MainlineMetadata}
 | {kind:'project';requestId:string;payload:ProjectMetadata}
 | {kind:'task';requestId:string;payload:TaskMetadata}
 | {kind:'capture';requestId:string;payload:{content:string}}
 | {kind:'reuse_mainline'|'reuse_project';requestId:string;objectId:string};
export interface AffairsConfirmationResult {status:'success'|'error'|'uncertain';message:string;receipt:AffairsReceipt|null;objectId:string|null;reused:boolean;}
