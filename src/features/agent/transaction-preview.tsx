"use client";
import {useRef,useState,useTransition} from 'react';
import {confirmAgentTransactionAction} from '@/app/agent-actions';
import type {AgentConfirmationResult,AgentTransactionDraft} from '@/lib/agent/types';
import type {FinanceField} from '@/lib/agent/conversation/types';
import styles from './agent-workspace.module.css';

interface BaseProps {draft:AgentTransactionDraft;index:number}
interface ControlledPreview {result:AgentConfirmationResult|null;isPending:boolean;disabled:boolean;onConfirm:()=>void;onEdit?:(field:FinanceField)=>void}
type Props=BaseProps & ({controlled:ControlledPreview;confirmAction?:never}|{controlled?:never;confirmAction?:(draft:AgentTransactionDraft)=>Promise<AgentConfirmationResult>});
const labels={expense:'支出',income:'收入',transfer:'转账'};
const purposes={general:'普通转账',saving:'储蓄',investment:'投资',debt:'还款'};
const amountLabel=(amount:number|null)=>amount===null?'待补充':`¥${amount.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export function TransactionPreview(props:Props) {
 return props.controlled?<TransactionPreviewCard {...props} control={props.controlled} showIssues={false}/>:<LegacyTransactionPreview {...props}/>;
}
// Compatibility wrapper: only non-conversation callers own a local submission result.
function LegacyTransactionPreview({draft,index,confirmAction=confirmAgentTransactionAction}:BaseProps & {confirmAction?:(draft:AgentTransactionDraft)=>Promise<AgentConfirmationResult>}) {
 const [result,setResult]=useState<AgentConfirmationResult|null>(null),[pending,startTransition]=useTransition(),locked=useRef(false);
 function confirm(){
  if(locked.current||result&&result.status!=='error')return;
  locked.current=true;
  startTransition(async()=>{
   try{const response=await confirmAction(draft);setResult(response);if(response.status==='error')locked.current=false;}
   catch{setResult({status:'uncertain',entryId:null,message:'尚未确认保存结果。请先核对交易记录，不要重复提交。'});}
  });
 }
 return <TransactionPreviewCard draft={draft} index={index} control={{result,isPending:pending,disabled:false,onConfirm:confirm}} showIssues/>;
}
function TransactionPreviewCard({draft,index,control,showIssues}:BaseProps & {control:ControlledPreview;showIssues:boolean}) {
 const {result,isPending,disabled,onEdit}=control;
 const committed=result?.status==='success'||result?.status==='warning',uncertain=result?.status==='uncertain';
 const readonly=isPending||disabled||committed||uncertain;
 const edit=(field:FinanceField,text:string,aria:string)=>onEdit&&!readonly?<button className={styles.fieldButton} type="button" aria-label={aria} onClick={()=>onEdit(field)}>{text}</button>:text;
 const account=draft.type==='transfer'?`${draft.fromAccountName??'待补充'} → ${draft.toAccountName??'待补充'}`:draft.accountName??'待补充';
 return <article aria-label={`交易预览 ${index+1}`} className={styles.previewCard}>
  <header className={styles.previewHeader}><div><span className={styles.previewType}>#{index+1} · {labels[draft.type]}</span>
   <span className={draft.status==='ready'?styles.previewReady:styles.previewNeedsInput}>{committed?'已记录':uncertain?'结果待核对':isPending?'正在提交':result?.status==='error'?'确认失败':draft.status==='ready'?'准备确认':showIssues?'需要补充':'待补充'}</span></div>
   <strong className={styles.previewAmount}>{edit('amount',amountLabel(draft.amount),'修改金额')}</strong></header>
  <p className={styles.previewDescription}>{edit('description',draft.description??draft.sourceText,'修改描述')}</p>
  <dl className={styles.previewGrid}>
   <div><dt>日期 / 时间</dt><dd>{edit('occurredAt',draft.occurredAt?.replace('T',' ')??'待补充','修改日期 / 时间')}</dd></div>
   <div><dt>{draft.type==='transfer'?'账户流向':'账户'}</dt><dd>{edit(draft.type==='transfer'?'fromAccountId':'accountId',account,'修改账户')}</dd></div>
   <div><dt>{draft.type==='transfer'?'用途':'分类'}</dt><dd>{edit(draft.type==='transfer'?'purpose':'categoryId',draft.type==='transfer'?(draft.purpose?purposes[draft.purpose]:'待补充'):draft.categoryName??'待补充',draft.type==='transfer'?'修改用途':'修改分类')}</dd></div>
   {draft.type!=='income'?<div><dt>预算</dt><dd>{edit('budgetBucketId',draft.excludeFromBudget?'不计入预算':draft.budgetBucketName??'未指定','修改预算')}</dd></div>:null}
  </dl>
  {showIssues&&draft.issues.length?<ul className={styles.previewIssues}>{draft.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:null}
  {result?<p className={`${styles.confirmationMessage} ${styles[`confirmation_${result.status}`]}`} role={result.status==='error'||uncertain?'alert':'status'}>{result.message}</p>:null}
  {draft.status==='ready'?<button type="button" className={styles.confirmButton} aria-label={isPending?'正在提交':committed?'已记录':uncertain?'请先核对':'确认并记录'} disabled={readonly} onClick={control.onConfirm}>{isPending?'正在提交…':committed?'已记录':uncertain?'请先核对交易记录':'确认并记录'}</button>:null}
 </article>;
}
