'use client';
import type {AffairsAgentOptions,AffairsDraft,AffairsTaskDuplicate} from '@/lib/agent/affairs/types';
import type {AffairsQueueRow} from './affairs-queue';
import styles from './agent-workspace.module.css';
export const affairsLabels={mainline:'主线',project:'项目',task:'行动',capture:'收集内容'};
const rowLabels={pending:'待保存',saving:'保存中',success:'已保存',reused:'已复用',error:'明确失败',unknown:'结果未知',blocked:'等待父级'};
export function AffairsPreviewCard({draft,index,options,items,locked=false,row,duplicates=[],onChange}:{draft:AffairsDraft;index:number;options:AffairsAgentOptions;items:AffairsDraft[];locked?:boolean;row?:AffairsQueueRow;duplicates?:AffairsTaskDuplicate[];onChange:(patch:Partial<AffairsDraft>)=>void}){
 const candidates=draft.type==='mainline'?options.mainlines:draft.type==='project'?options.projects:[];
 const eligible=candidates.filter(x=>x.status!=='archived'&&x.status!=='completed');
 const parentKind=draft.type==='project'?'mainline':draft.type==='task'?'project':null;
 const parents=parentKind==='mainline'?options.mainlines:parentKind==='project'?options.projects:[];
 const result=row?.result;
 const link=draft.type==='mainline'?'/affairs':draft.type==='capture'?'/affairs/inbox':draft.type==='project'?`/affairs/projects/${result?.objectId}`:`/affairs/tasks/${result?.objectId}/edit`;
 return <article aria-label={`事务预览 ${index+1}`} className={styles.affairsCard}>
  <div className={styles.affairsCardHeader}><strong>{index+1} · {affairsLabels[draft.type]}</strong><span>{row?rowLabels[row.status]:draft.mode==='skip'?'已跳过':draft.issues.length?'需要补充':'可保存'}</span></div>
  <small className={styles.affairsSource}>原文：{draft.sourceText}</small>
  <fieldset disabled={locked} className={styles.affairsFields}>
   <div className={styles.affairsFieldsGrid}>
    <label>类型<select value={draft.type} onChange={e=>onChange({type:e.target.value as AffairsDraft['type'],parentId:null,parentDraftId:null,mode:'create',reuseId:null,isCore:false})}>{Object.entries(affairsLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
    <label>处理方式<select value={draft.mode} onChange={e=>onChange({mode:e.target.value as AffairsDraft['mode'],matchConfirmed:false})}><option value="create">新建</option>{eligible.length>0?<option value="reuse">复用已有</option>:null}<option value="skip">跳过</option></select></label>
   </div>
   {draft.mode==='reuse'?<>
    <label>复用目标<select value={draft.reuseId??''} onChange={e=>onChange({reuseId:e.target.value||null,matchConfirmed:false})}><option value="">选择已有{affairsLabels[draft.type]}</option>{eligible.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label className={styles.affairsCheckbox}><input type="checkbox" checked={draft.matchConfirmed} onChange={e=>onChange({matchConfirmed:e.target.checked})}/>确认复用已有记录（不修改原记录）</label>
   </>:draft.mode==='create'?<>
    {draft.type!=='capture'?<label>名称<input value={draft.name??''} maxLength={200} onChange={e=>onChange({name:e.target.value,duplicateConfirmed:false})}/></label>:null}
    {draft.type==='project'?<label>项目成果<textarea value={draft.outcome??''} onChange={e=>onChange({outcome:e.target.value})} placeholder="项目做完后具体得到什么？" rows={2}/></label>:null}
    {parentKind?<label>归属<select value={draft.parentDraftId?`draft:${draft.parentDraftId}`:draft.parentId??''} onChange={e=>onChange({parentDraftId:e.target.value.startsWith('draft:')?e.target.value.slice(6):null,parentId:e.target.value.startsWith('draft:')?null:e.target.value||null,duplicateConfirmed:false})}><option value="">{draft.type==='task'?'独立行动 / 未关联项目':'未关联主线'}</option>{parents.filter(p=>p.status!=='archived'&&p.status!=='completed').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}{items.filter(i=>i.type===parentKind&&i.draftId!==draft.draftId&&i.mode!=='skip').map(i=><option key={i.draftId} value={`draft:${i.draftId}`}>本批：{i.name||'未命名'}</option>)}</select></label>:null}
    {draft.type==='project'||draft.type==='task'?<>
     <div className={styles.affairsFieldsGrid}><label>计划日期<input type="date" value={draft.dueDate??''} onChange={e=>onChange({dueDate:e.target.value||null,plannedTime:e.target.value?draft.plannedTime:null,dateConfirmed:true})}/></label><label>计划时间（上海）<input type="time" value={draft.plannedTime??''} disabled={!draft.dueDate||locked} onChange={e=>onChange({plannedTime:e.target.value||null})}/></label></div>
     {draft.yearInferred&&draft.dueDate?<label className={styles.affairsCheckbox}><input type="checkbox" checked={draft.dateConfirmed} onChange={e=>onChange({dateConfirmed:e.target.checked})}/>确认年份为 {draft.dueDate.slice(0,4)}（原文未明确年份）</label>:null}
     {draft.plannedTime?<small>保存到截止日期字段；具体时间保留在说明中，不提供到点提醒。</small>:null}
    </>:null}
    <label>{draft.type==='capture'?'收集内容':'说明'}<textarea value={draft.description??(draft.type==='capture'?draft.sourceText:'')} rows={2} onChange={e=>onChange({description:e.target.value})}/></label>
    {draft.type==='task'?<>
     <label className={styles.affairsCheckbox}><input type="checkbox" checked={draft.isCore} onChange={e=>onChange({isCore:e.target.checked})}/>设为核心行动</label>
     {draft.isCore?<><label>核心目标<textarea value={draft.coreReason??''} onChange={e=>onChange({coreReason:e.target.value})}/></label><label>完成条件<textarea value={draft.completionCriteria??''} onChange={e=>onChange({completionCriteria:e.target.value})}/></label></>:null}
     {duplicates.length?<div className={styles.unresolved}><p>发现同名行动（{duplicates.length} 条），可能重复。</p><label className={styles.affairsCheckbox}><input type="checkbox" checked={draft.duplicateConfirmed} onChange={e=>onChange({duplicateConfirmed:e.target.checked})}/>仍然新建此行动</label></div>:null}
    </>:null}
   </>:null}
  </fieldset>
  {draft.mode!=='skip'&&draft.issues.length&&!row?<ul className={styles.affairsIssues}>{draft.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:null}
  {result?<p role={row?.status==='unknown'||row?.status==='error'?'alert':'status'} className={styles.confirmationMessage}>{result.message}</p>:null}
  {(row?.status==='success'||row?.status==='reused')&&result?.objectId?<a className={styles.replyAction} href={link}>查看记录</a>:null}
 </article>;
}
