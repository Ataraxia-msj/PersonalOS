'use client';
import {useEffect,useRef,useState} from 'react';
import {confirmAgentAffairsAction,checkAgentAffairsDuplicatesAction} from '@/app/agent-affairs-actions';
import {validateAffairsDrafts} from '@/lib/agent/affairs/preview';
import type {AffairsDraft,AffairsInterpretation,AffairsTaskDuplicate} from '@/lib/agent/affairs/types';
import {AffairsQueue,type AffairsConfirmAction,type AffairsQueueRow} from './affairs-queue';
import {AffairsPreviewCard} from './affairs-preview-card';
import styles from './agent-workspace.module.css';

type DuplicateAction=(titles:string[])=>Promise<{status:'success';items:AffairsTaskDuplicate[]}|{status:'error';message:string}>;
const signatureOf=(items:AffairsDraft[])=>JSON.stringify(items.filter(i=>i.type==='task'&&i.mode==='create').map(i=>[i.name?.trim(),i.parentId,i.parentDraftId]));
export function AffairsPreview({interpretation,onProtectionChange,externalBlocked=false,confirmAction=confirmAgentAffairsAction,duplicateAction=checkAgentAffairsDuplicatesAction}:{interpretation:AffairsInterpretation;onProtectionChange?:(protectedPreview:boolean)=>void;externalBlocked?:boolean;confirmAction?:AffairsConfirmAction;duplicateAction?:DuplicateAction}){
 // Initial identity belongs to this preview, not changing server props or screen size.
 const [initial]=useState(()=>interpretation);
 const [items,setItems]=useState(()=>initial.items);
 const [queue,setQueue]=useState<AffairsQueue|null>(null);
 const [rows,setRows]=useState<AffairsQueueRow[]>([]);
 const [savedRows,setSavedRows]=useState<AffairsQueueRow[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [duplicateState,setDuplicateState]=useState(()=>({signature:signatureOf(initial.items),status:'ready' as 'ready'|'error',items:initial.duplicates}));
 const [lookupEpoch,setLookupEpoch]=useState(0);
 const generation=useRef(0),runLock=useRef(false),queueRef=useRef<AffairsQueue|null>(null);
 const protectionCallback=useRef(onProtectionChange);protectionCallback.current=onProtectionChange;
 const signature=signatureOf(items);
 const duplicatePending=!queue&&signature!==duplicateState.signature;
 useEffect(()=>{
  if(queue||signature===duplicateState.signature&&duplicateState.status==='ready')return;
  const sequence=++generation.current;
  let cancelled=false;
  const titles=[...new Set(items.filter(i=>i.type==='task'&&i.mode==='create'&&i.name?.trim()&&[...i.name.trim()].length<=200).map(i=>i.name!.trim()))];
  const timer=setTimeout(()=>{
   duplicateAction(titles).then(result=>{
    if(cancelled||sequence!==generation.current)return;
    setDuplicateState({signature,status:result.status==='success'?'ready':'error',items:result.status==='success'?result.items:[]});
   }).catch(()=>{if(!cancelled&&sequence===generation.current)setDuplicateState({signature,status:'error',items:[]});});
  },250);
  return ()=>{clearTimeout(timer);cancelled=true;};
  // The signature includes every field relevant to exact-title duplicate checks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[signature,queue,lookupEpoch,duplicateAction]);
 const checked=validateAffairsDrafts(items,initial.options);
 const duplicates=signature===duplicateState.signature?duplicateState.items:[];
 const validated=checked.items.map(item=>({...item,issues:[...item.issues,...(item.mode==='create'&&item.type==='task'&&duplicates.some(d=>d.title===item.name?.trim())&&!item.duplicateConfirmed?['请确认同名行动仍然新建，或跳过']:[])]}));
 const selected=validated.filter(i=>i.mode!=='skip');
 const unknown=rows.some(r=>r.status==='unknown');
 const complete=!!queue&&queue.complete;
 const protectedPreview=busy||unknown||!!queue&&!complete;
 const dirty=selected.length>0&&!complete;
 useEffect(()=>{protectionCallback.current?.(protectedPreview);},[protectedPreview]);
 useEffect(()=>()=>{protectionCallback.current?.(false);},[]);
 useEffect(()=>{
  if(!dirty&&!protectedPreview)return;
  const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  const click=(event:MouseEvent)=>{
   const anchor=(event.target as Element)?.closest('a[href]');
   if(!anchor||anchor.getAttribute('href')?.startsWith('#'))return;
   if(protectedPreview||!window.confirm('放弃尚未保存的事务预览？')){event.preventDefault();event.stopPropagation();}
  };
  window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);
  return ()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);};
 },[dirty,protectedPreview]);
 const canSave=selected.length>0&&!validated.some(i=>i.mode!=='skip'&&i.issues.length)&&!duplicatePending&&duplicateState.status==='ready';
 function change(id:string,patch:Partial<AffairsDraft>){if(queueRef.current||externalBlocked)return;setError('');setItems(current=>current.map(i=>i.draftId===id?{...i,...patch}:i));}
 function addProject(){
  if(queueRef.current||externalBlocked||items.length>=20)return;
  const rawText=initial.items[0]?.rawText??'';
  const next:AffairsDraft={type:'project',sourceText:rawText,rawText,name:'',description:null,outcome:null,dueDate:null,plannedTime:null,yearInferred:false,isCore:false,coreReason:null,completionCriteria:null,parentId:null,parentIndex:null,existingId:null,draftId:crypto.randomUUID(),requestId:crypto.randomUUID(),parentDraftId:null,mode:'create',reuseId:null,matchConfirmed:false,dateConfirmed:false,duplicateConfirmed:false,issues:[]};
  setItems(current=>[...current,next]);
 }
 async function save(){
  if(runLock.current||externalBlocked)return;
  let active=queueRef.current;
  if(!active){
   if(!canSave)return;
   try{active=new AffairsQueue(validated,initial.options);}catch{setError('预览尚不完整，或说明过长，请检查后再保存。');return;}
   queueRef.current=active;setQueue(active);
  }
  runLock.current=true;setBusy(true);protectionCallback.current?.(true);
  try{await active.run(confirmAction,()=>{setRows(active!.rows.map(r=>({...r})));});}
  finally{runLock.current=false;setBusy(false);}
 }
 function editRemaining(){
  const active=queueRef.current;if(!active?.canEditRemaining||externalBlocked)return;
  const completed=active.rows.filter(r=>r.status==='success'||r.status==='reused');
  const successes=new Map(completed.map(r=>[r.draft.draftId,r.result!.objectId]));
  setSavedRows(current=>[...current,...completed]);
  setItems(active.rows.filter(r=>r.status!=='success'&&r.status!=='reused').map(r=>({...r.draft,requestId:crypto.randomUUID(),draftId:crypto.randomUUID(),parentDraftId:r.draft.parentDraftId&&successes.has(r.draft.parentDraftId)?null:r.draft.parentDraftId,parentId:r.draft.parentDraftId&&successes.has(r.draft.parentDraftId)?successes.get(r.draft.parentDraftId)!:r.draft.parentId,duplicateConfirmed:false})));
  // Rewrite references to the new draft IDs, keeping remaining dependencies intact.
  setItems(current=>{const byOld=new Map(active.rows.filter(r=>r.status!=='success'&&r.status!=='reused').map((r,i)=>[r.draft.draftId,current[i].draftId]));return current.map(i=>({...i,parentDraftId:i.parentDraftId?byOld.get(i.parentDraftId)??i.parentDraftId:null}));});
  queueRef.current=null;setQueue(null);setRows([]);setError('原批次已结束：已保存项保留，仅未保存项生成新预览。');
 }
 const visibleRows:Array<{draft:AffairsDraft;row?:AffairsQueueRow}>=queue?(rows.length?rows:queue.rows).map(row=>({draft:row.draft,row})):validated.map(draft=>({draft}));
 return <section aria-label="事务预览" data-affairs-dirty={dirty?'true':'false'} data-affairs-pending={busy?'true':'false'} data-affairs-unresolved={unknown?'true':'false'}>
  {savedRows.map((row,index)=><AffairsPreviewCard key={row.draft.draftId} draft={row.draft} index={index} options={initial.options} items={[]} locked row={row} onChange={()=>{}}/>)}
  <div className={styles.previewList}>{visibleRows.map((entry,index)=><AffairsPreviewCard key={entry.draft.draftId} draft={entry.draft} index={savedRows.length+index} options={initial.options} items={items} locked={!!queue||externalBlocked} row={entry.row} duplicates={duplicates.filter(d=>d.title===entry.draft.name?.trim())} onChange={patch=>change(entry.draft.draftId,patch)}/>)}</div>
  {!queue?<div className={styles.affairsActions}><button type="button" onClick={addProject} disabled={items.length>=20||externalBlocked}>添加项目</button><button type="button" className={styles.confirmButton} disabled={!canSave||externalBlocked} onClick={()=>void save()}>确认保存 {selected.length} 项</button></div>:!complete?<div className={styles.affairsActions}><button type="button" className={styles.confirmButton} disabled={busy||externalBlocked} onClick={()=>void save()}>{busy?'正在保存…':'原请求重试 / 继续'}</button>{queue.canEditRemaining?<button type="button" disabled={externalBlocked} onClick={editRemaining}>结束原批次，修改未保存项</button>:null}</div>:null}
  {duplicatePending?<p className={styles.unresolved}>正在核对同名行动…</p>:null}
  {!queue&&duplicateState.status==='error'?<p role="alert" className={styles.unresolved}>同名行动核对失败，暂不能保存。<button type="button" onClick={()=>setLookupEpoch(n=>n+1)}>重新核对</button></p>:null}
  {error?<p role="alert" className={styles.unresolved}>{error}</p>:null}
  {unknown?<p className={styles.unresolved}>请保留当前页面，用原请求重试核对；强制刷新后须先查看记录，不要重新发送。</p>:null}
  {!complete&&selected.length>1?<small className={styles.affairsSource}>逐项保存，不是整批回滚；遇到失败会暂停，已保存项不会重复创建。</small>:null}
 </section>;
}
