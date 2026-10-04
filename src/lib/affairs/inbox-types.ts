import type {MutableRow,AffairsRpcReceiptRow,AffairsReceipt,TaskMetadata,ProjectMetadata} from './types';
export type InboxStatus='pending'|'resolved'|'discarded';
export type InboxTarget='task'|'project';
export interface InboxEntryRow extends MutableRow {
 content:string;status:InboxStatus;resolved_task_id:string|null;resolved_project_id:string|null;resolved_at:string|null;discarded_at:string|null;
}
export interface InboxRpcArgsMap {
 create_affairs_inbox_entry:{p_request_id:string;p_content:string};
 update_affairs_inbox_entry:{p_request_id:string;p_inbox_id:string;p_expected_revision:string;p_content:string};
 discard_affairs_inbox_entry:{p_request_id:string;p_inbox_id:string;p_expected_revision:string};
 restore_affairs_inbox_entry:{p_request_id:string;p_inbox_id:string;p_expected_revision:string};
 resolve_affairs_inbox_entry:{p_request_id:string;p_inbox_id:string;p_expected_revision:string;p_target:InboxTarget;p_payload:TaskMetadata|ProjectMetadata};
}
export type InboxOperation=keyof InboxRpcArgsMap;
export type InboxCommand={ [K in InboxOperation]:{operation:K;args:InboxRpcArgsMap[K]} }[InboxOperation];
export interface InboxResolveReceiptRow extends AffairsRpcReceiptRow {resolved_resource:InboxTarget;resolved_object_id:string;resolved_object_revision:string|number;}
export interface InboxResolveReceipt extends AffairsReceipt {resolvedResource:InboxTarget;resolvedObjectId:string;resolvedObjectRevision:string;}
export function isInboxOperation(v:unknown):v is InboxOperation {return typeof v==='string' && ['create_affairs_inbox_entry','update_affairs_inbox_entry','discard_affairs_inbox_entry','restore_affairs_inbox_entry','resolve_affairs_inbox_entry'].includes(v);}
