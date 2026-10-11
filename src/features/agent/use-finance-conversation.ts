"use client";
import {useEffect,useRef,useState} from 'react';
import type {getAgentIdentityAction,confirmAgentTransactionAction} from '@/app/agent-actions';
import type {AgentFinanceOptions,AgentConfirmationResult} from '@/lib/agent/types';
import type {AffairsInterpretation} from '@/lib/agent/affairs/types';
import type {AgentTurnResult,FinanceConversation,FinanceTurn,FinanceTurnInput} from '@/lib/agent/conversation/types';
import {editable,protectedConversation,setFinanceSubmission} from '@/lib/agent/conversation/state';
import {validateConversation} from '@/lib/agent/conversation/validation';
import {clearSubmissionProtection,readSubmissionProtection,writeSubmissionProtection,type SubmissionMarker} from './submission-protection';

export interface AgentConversationMessage {id:string;role:'user'|'assistant';text:string;error?:boolean;interpretation?:AffairsInterpretation}
interface Props {
 ownerId:string;turnAction:(input:FinanceTurnInput)=>Promise<AgentTurnResult>;
 identityAction:typeof getAgentIdentityAction;confirmAction:typeof confirmAgentTransactionAction;
 onProtectionChange?:(blocked:boolean)=>void;externalBlocked?:boolean;
}
export function useFinanceConversation({ownerId,turnAction,identityAction,confirmAction,onProtectionChange,externalBlocked=false}:Props) {
 const [state,setState]=useState<FinanceConversation|null>(null),[options,setOptions]=useState<AgentFinanceOptions|null>(null);
 const [messages,setMessages]=useState<AgentConversationMessage[]>([]),[pending,setPending]=useState(true);
 const [restoredMarker,setRestoredMarker]=useState<SubmissionMarker|null>(null),[protectionFault,setProtectionFault]=useState(false);
 const [initialized,setInitialized]=useState(false);
 const current=useRef<FinanceConversation|null>(null),busy=useRef(false),protectedRef=useRef(true),epoch=useRef(0),mounted=useRef(false);
 const owner=useRef(ownerId),external=useRef(externalBlocked),protectionCallback=useRef(onProtectionChange);
 owner.current=ownerId;external.current=externalBlocked;protectionCallback.current=onProtectionChange;
 const blocked=!initialized||protectionFault||Boolean(restoredMarker)||Boolean(state&&protectedConversation(state));
 function update(next:FinanceConversation|null){current.current=next;setState(next);}
 function message(text:string,error=false){setMessages(m=>[...m,{id:crypto.randomUUID(),role:'assistant',text,error}]);}
 function protect(value:boolean){protectedRef.current=value;protectionCallback.current?.(value);}
 function changedIdentity(){epoch.current++;update(null);setOptions(null);setMessages([{id:crypto.randomUUID(),role:'assistant',text:'登录用户已改变或失效，请刷新页面后重新录入。',error:true}]);setProtectionFault(true);protect(true);}
 useEffect(()=>{
  mounted.current=true;const lifecycleEpoch=++epoch.current;busy.current=false;current.current=null;setState(null);setOptions(null);setMessages([]);setRestoredMarker(null);setProtectionFault(false);
  let blocked=false;
  try{const marker=readSubmissionProtection(sessionStorage,ownerId);setRestoredMarker(marker);blocked=Boolean(marker);}catch{setProtectionFault(true);blocked=true;}
  protectedRef.current=blocked;protectionCallback.current?.(blocked);setInitialized(true);setPending(false);
  return ()=>{mounted.current=false;epoch.current=lifecycleEpoch+1;};
 },[ownerId]);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{if(busy.current||protectedRef.current||current.current?.items.some(editable)){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);
 },[]);
 const alive=(token:number,expectedOwner:string)=>mounted.current&&epoch.current===token&&owner.current===expectedOwner;
 async function sendTurn(turn:FinanceTurn):Promise<void> {
  if(busy.current||protectedRef.current||external.current||turn.kind==='text'&&(!turn.rawText.trim()||[...turn.rawText].length>4000))return;
  busy.current=true;setPending(true);
  const token=epoch.current,expectedOwner=ownerId,base=current.current?.revision??0,turnId=crypto.randomUUID();
  const input:FinanceTurnInput={ownerId:expectedOwner,state:current.current,turnId,baseRevision:base,turn};
  if(turn.kind==='text')setMessages(m=>[...m,{id:`user-${turnId}`,role:'user',text:turn.rawText}]);
  try{
   const result=await turnAction(input);if(!alive(token,expectedOwner))return;
   if(result.status==='error'&&result.identityChanged){changedIdentity();return;}
   if(result.turnId!==turnId||result.baseRevision!==base||(current.current?.revision??0)!==base){message('收到过期响应，当前预览没有改变。');return;}
   if(result.status==='error'){message(result.message,true);return;}
   if(result.ownerId!==expectedOwner){changedIdentity();return;}
   if(result.domain==='finance'){
    validateConversation(result.state);if(result.state.ownerId!==expectedOwner)throw new Error('invalid response');
    update(result.state);setOptions(result.options);message(result.message);
   }else setMessages(m=>[...m,{id:`assistant-${turnId}`,role:'assistant',text:result.message,interpretation:result.interpretation}]);
  }catch{if(alive(token,expectedOwner))message('暂时无法更新预览，当前草稿保留。请稍后重试。',true);}
  finally{if(alive(token,expectedOwner)){busy.current=false;setPending(false);}}
 }
 async function confirm(draftId:string):Promise<void> {
  const item=current.current?.items.find(i=>i.draft.draftId===draftId);
  if(busy.current||protectedRef.current||external.current||!item||item.lifecycle!=='ready')return;
  busy.current=true;setPending(true);protect(true);
  const token=epoch.current,expectedOwner=ownerId,original=current.current!;
  let marker:SubmissionMarker|null=null,started=false;
  try{
   const identity=await identityAction();if(!alive(token,expectedOwner))return;
   if(identity.status!=='success'){message(identity.message,true);return;}
   if(identity.ownerId!==expectedOwner){changedIdentity();return;}
   marker={ownerId:expectedOwner,batchId:original.batchId,draftId,requestId:item.draft.requestId,type:item.draft.type,submittedAt:new Date().toISOString(),status:'saving'};
   writeSubmissionProtection(sessionStorage,marker);update(setFinanceSubmission(original,draftId,{kind:'start'}));started=true;
   let result:AgentConfirmationResult;
   try{result=await confirmAction(structuredClone(item.draft),expectedOwner);}catch{result={status:'uncertain',entryId:null,message:'尚未确认保存结果，请核对交易记录，不要重复提交。'};}
   if(!alive(token,expectedOwner))return;
   const next=setFinanceSubmission(current.current!,draftId,{kind:'result',result});update(next);
   if(next.items.find(i=>i.draft.draftId===draftId)?.lifecycle==='uncertain'){
    marker={...marker,status:'uncertain'};setRestoredMarker(marker);try{writeSubmissionProtection(sessionStorage,marker);}catch{setProtectionFault(true);}protect(true);
   }else{
    try{clearSubmissionProtection(sessionStorage,expectedOwner);protect(false);}catch{setRestoredMarker(marker);setProtectionFault(true);protect(true);message('保存结果已收到，但提交保护未清理。请核对后清理标记，不要重复提交。',true);}
   }
  }catch{
   if(alive(token,expectedOwner)){
    if(started){update(setFinanceSubmission(current.current!,draftId,{kind:'result',result:{status:'uncertain',entryId:null,message:'保存回执无法确认，请先核对交易记录。'}}));setRestoredMarker(marker);setProtectionFault(true);protect(true);}
    else message('无法建立安全提交保护，本次没有发起写入。请检查浏览器存储后重试。',true);
   }
  }finally{
   if(alive(token,expectedOwner)){busy.current=false;setPending(false);if(!started&&!protectedConversation(current.current??original)&&!protectionFault)protect(false);}
  }
 }
 async function acknowledgeCheckedResult(checked:boolean):Promise<void> {
  if(!checked||busy.current)return;
  busy.current=true;setPending(true);const token=epoch.current,expectedOwner=ownerId;
  try{
   const identity=await identityAction();if(!alive(token,expectedOwner))return;
   if(identity.status!=='success'){message(identity.message,true);return;}if(identity.ownerId!==expectedOwner){changedIdentity();return;}
   clearSubmissionProtection(sessionStorage,expectedOwner);
   if(current.current){const next=structuredClone(current.current);for(const item of next.items)if(item.lifecycle==='uncertain')item.lifecycle='discarded';next.revision++;update(next);}
   setRestoredMarker(null);setProtectionFault(false);protect(false);message('已结束待核对保护，没有重新提交任何交易。');
  }catch{if(alive(token,expectedOwner))message('保护信息仍未清理，请稍后再次核对处理。',true);}
  finally{if(alive(token,expectedOwner)){busy.current=false;setPending(false);}}
 }
 return {state,options,messages,pending,blocked,restoredMarker,sendTurn,confirm,acknowledgeCheckedResult,protectionFault};
}
