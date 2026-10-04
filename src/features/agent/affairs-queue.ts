import {validateAffairsDrafts,toAffairsConfirmation} from '@/lib/agent/affairs/preview';
import type {AffairsAgentOptions,AffairsDraft,AffairsConfirmation,AffairsConfirmationResult} from '@/lib/agent/affairs/types';
export type AffairsRowStatus='pending'|'saving'|'success'|'reused'|'error'|'unknown'|'blocked';
export interface AffairsQueueRow {draft:AffairsDraft;status:AffairsRowStatus;command:AffairsConfirmation|null;result:AffairsConfirmationResult|null;}
export type AffairsConfirmAction=(command:AffairsConfirmation)=>Promise<AffairsConfirmationResult>;
export class AffairsQueue {
 readonly rows:AffairsQueueRow[];
 busy=false;
 constructor(items:AffairsDraft[],options:AffairsAgentOptions){
  const checked=validateAffairsDrafts(items,options);
  if(!checked.order.length||checked.items.some(i=>i.mode!=='skip'&&i.issues.length))throw new Error('invalid_batch');
  const selected=checked.items.filter(i=>i.mode!=='skip');
  // Validate final description size before any RPC, including children whose IDs are not resolved yet.
  selected.forEach(i=>toAffairsConfirmation(i,i.parentDraftId?'00000000-0000-4000-8000-000000000001':null));
  this.rows=checked.order.map(id=>({draft:structuredClone(selected.find(i=>i.draftId===id)!),status:'pending',command:null,result:null}));
 }
 get complete(){return this.rows.every(r=>r.status==='success'||r.status==='reused');}
 get uncertain(){return this.rows.some(r=>r.status==='unknown');}
 get canEditRemaining(){return !this.busy&&!this.uncertain&&!this.complete;}
 async run(confirm:AffairsConfirmAction,onChange:()=>void=()=>{}){
  if(this.busy||this.complete)return;
  this.busy=true;onChange();
  try{
   for(const row of this.rows){
    if(row.status==='success'||row.status==='reused')continue;
    const wasUnknown=row.status==='unknown';
    const parent=this.rows.find(r=>r.draft.draftId===row.draft.parentDraftId);
    if(parent&&parent.status!=='success'&&parent.status!=='reused'){row.status='blocked';onChange();break;}
    row.command??=toAffairsConfirmation(row.draft,parent?.result?.objectId??null);
    row.status='saving';onChange();
    let result:AffairsConfirmationResult;
    try{result=await confirm(structuredClone(row.command));}catch{result={status:'uncertain',message:'结果未知。请保留页面并用原请求重试核对。',receipt:null,objectId:null,reused:false};}
    // A rejection during retry cannot disprove the earlier unknown attempt.
    if(wasUnknown&&result.status!=='success')result={...result,status:'uncertain',objectId:null,receipt:null};
    if(result.status==='success'&&!result.objectId)result={...result,status:'uncertain',message:'保存回执缺少标识，请保留原请求重试。'};
    row.result=result;row.status=result.status==='success'?(result.reused?'reused':'success'):result.status==='uncertain'?'unknown':'error';onChange();
    if(result.status!=='success')break;
   }
  }finally{this.busy=false;onChange();}
 }
}
