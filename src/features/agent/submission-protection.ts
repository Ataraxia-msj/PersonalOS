import {reconciliationUuid} from '@/lib/finance/reconciliation-validation';
import type {AgentTransactionDraft} from '@/lib/agent/types';

export interface SubmissionMarker {
 ownerId:string;batchId:string;draftId:string;requestId:string|null;submittedAt:string;
 type:AgentTransactionDraft['type'];status:'saving'|'uncertain';
}
const key=(ownerId:string)=>`personal-os:agent:finance-submission:${ownerId}`;
function validate(value:unknown,ownerId:string):asserts value is SubmissionMarker {
 if(typeof value!=='object'||!value||Array.isArray(value))throw new Error('提交保护信息无法读取，请先核对交易记录。');
 const v=value as Record<string,unknown>,keys=['ownerId','batchId','draftId','requestId','submittedAt','type','status'];
 if(Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k))||v.ownerId!==ownerId||['ownerId','batchId','draftId'].some(k=>typeof v[k]!=='string'||!reconciliationUuid.test(v[k] as string))||(v.requestId!==null&&(typeof v.requestId!=='string'||!reconciliationUuid.test(v.requestId)))||typeof v.submittedAt!=='string'||v.submittedAt.length>32||!Number.isFinite(Date.parse(v.submittedAt))||!['expense','income','transfer'].includes(String(v.type))||!['saving','uncertain'].includes(String(v.status)))throw new Error('提交保护信息无法读取，请先核对交易记录。');
}
export function readSubmissionProtection(storage:Storage,ownerId:string):SubmissionMarker|null {
 try{const text=storage.getItem(key(ownerId));if(text===null)return null;if(text.length>1000)throw new Error();const value:unknown=JSON.parse(text);validate(value,ownerId);return value;}
 catch{throw new Error('提交保护信息无法读取，请先核对交易记录。');}
}
export function writeSubmissionProtection(storage:Storage,marker:SubmissionMarker):void {
 validate(marker,marker.ownerId);
 try{storage.setItem(key(marker.ownerId),JSON.stringify(marker));}catch{throw new Error('无法保存提交保护信息，本次没有发起写入。');}
}
export function clearSubmissionProtection(storage:Storage,ownerId:string):void {
 try{storage.removeItem(key(ownerId));}catch{throw new Error('无法清理提交保护，请核对后再次清理；不要重复提交。');}
}
