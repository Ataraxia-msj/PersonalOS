"use client";
import {useState,type FormEvent} from 'react';
import type {AgentFinanceOptions} from '@/lib/agent/types';
import {fieldChoices} from '@/lib/agent/conversation/questions';
import {parseFieldChanges} from '@/lib/agent/conversation/validation';
import {editable} from '@/lib/agent/conversation/state';
import type {ConversationItem,FieldChange,FinanceConversation,FinanceField,FinanceTurn} from '@/lib/agent/conversation/types';
import {TransactionPreview} from './transaction-preview';
import {ClarificationQuestion} from './clarification-question';
import styles from './agent-workspace.module.css';

interface Props {state:FinanceConversation;options:AgentFinanceOptions;disabled:boolean;onTurn:(turn:FinanceTurn)=>void|Promise<void>;onConfirm:(draftId:string)=>void}
export function FinanceConversationPreview({state,options,disabled,onTurn,onConfirm}:Props) {
 const [editing,setEditing]=useState<{id:string;field:FinanceField}|null>(null);
 return <section aria-label="当前财务预览" className={styles.financePreview}>
  {state.items.filter(i=>i.lifecycle!=='discarded').map(item=><div key={item.draft.draftId}>
   <TransactionPreview draft={item.draft} index={item.ordinal-1} controlled={{result:item.confirmation,isPending:item.lifecycle==='saving',disabled:disabled||!editable(item),onConfirm:()=>onConfirm(item.draft.draftId),onEdit:field=>setEditing({id:item.draft.draftId,field})}}/>
   {editable(item)?<div className={styles.draftMeta}>{item.timeAssumption?<span>{item.timeAssumption==='recorded_now'?'默认记录时间':'未指定时刻'}</span>:null}{item.origins.categoryId==='suggested'&&item.draft.categoryId?<span>分类：建议</span>:null}<button type="button" disabled={disabled} onClick={()=>onTurn({kind:'discard',draftId:item.draft.draftId})}>取消此笔</button></div>:null}
   {editing?.id===item.draft.draftId&&editable(item)?<DraftEditor key={`${item.draft.draftId}:${state.revision}`} item={item} state={state} options={options} disabled={disabled} focusField={editing.field} onCancel={()=>setEditing(null)} onSave={async changes=>{await onTurn({kind:'edit',draftId:item.draft.draftId,changes});setEditing(null);}}/>:null}
  </div>)}
  {state.pendingQuestion?<ClarificationQuestion question={state.pendingQuestion} disabled={disabled} onSelect={onTurn}/>:null}
 </section>;
}
function DraftEditor({item,state,options,disabled,focusField,onSave,onCancel}:{item:ConversationItem;state:FinanceConversation;options:AgentFinanceOptions;disabled:boolean;focusField:FinanceField;onSave:(changes:FieldChange[])=>Promise<void>;onCancel:()=>void}) {
 const draft=item.draft;
 const [values,setValues]=useState(()=>({...draft,amount:draft.amount===null?'':String(draft.amount),budgetBucketId:item.budgetChoice??''}));
 const [error,setError]=useState('');
 const set=(field:string,value:string|boolean)=>setValues(v=>({...v,[field]:value}));
 const fields:Array<[FinanceField,string,'number'|'datetime-local'|'text'|'select']>=[['amount','金额','number'],['occurredAt','日期 / 时间','datetime-local'],['description','描述','text']];
 if(draft.type==='transfer')fields.push(['purpose','用途','select'],['fromAccountId','转出账户','select'],['toAccountId','转入账户','select']);
 else fields.push(['accountId','账户','select'],['categoryId','分类','select']);
 if(draft.type!=='income')fields.push(['budgetBucketId','预算分类','select']);
 async function submit(event:FormEvent){
  event.preventDefault();if(disabled)return;
  const changes:FieldChange[]=[];
  for(const [field] of fields){let value:string|number|null=values[field] as string|null;
   if(field==='amount')value=values.amount.trim()===''?null:Number(values.amount);
   else if(field.endsWith('Id')||field==='purpose')value=value||null;
   const before=field==='budgetBucketId'?item.budgetChoice:draft[field];
   if(value!==before)changes.push({field,value,origin:'explicit'});
  }
  if(draft.type==='expense'&&values.excludeFromBudget!==draft.excludeFromBudget)changes.push({field:'excludeFromBudget',value:values.excludeFromBudget,origin:'explicit'});
  try{parseFieldChanges(changes);if(changes.length)await onSave(changes);else onCancel();}catch{setError('请检查金额、日期和字段内容。');}
 }
 return <form aria-label={`修改第 ${item.ordinal} 笔`} className={styles.draftEditor} onSubmit={submit}>
  <fieldset disabled={disabled} className={styles.affairsFields}><div className={styles.affairsFieldsGrid}>{fields.map(([field,label,type])=><label key={field}>{label}
   {type==='select'?<select aria-label={label} autoFocus={focusField===field} disabled={field==='budgetBucketId'&&values.excludeFromBudget} value={String(values[field]??'')} onChange={event=>set(field,event.target.value)}><option value="">{field==='budgetBucketId'?(draft.type==='expense'?'使用分类默认预算':'不指定预算'):'请选择'}</option>{fieldChoices(field,{...state,items:state.items.map(i=>i.draft.draftId===draft.draftId?{...i,draft:{...draft,...values,amount:draft.amount,budgetBucketId:values.budgetBucketId||null}}:i)},options,draft.draftId).map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}</select>:<input aria-label={label} autoFocus={focusField===field} type={type} min={type==='number'?'0.01':undefined} step={type==='number'?'0.01':undefined} maxLength={type==='text'?1000:undefined} value={String(values[field]??'')} onChange={event=>set(field,event.target.value)}/>}
  </label>)}</div>
  {draft.type==='expense'?<label className={styles.affairsCheckbox}><input type="checkbox" checked={values.excludeFromBudget} onChange={event=>set('excludeFromBudget',event.target.checked)}/>不计入预算</label>:null}
  </fieldset>{error?<p role="alert">{error}</p>:null}<div className={styles.affairsActions}><button className={styles.confirmButton} type="submit" disabled={disabled}>更新预览</button><button type="button" disabled={disabled} onClick={onCancel}>取消修改</button></div>
 </form>;
}
