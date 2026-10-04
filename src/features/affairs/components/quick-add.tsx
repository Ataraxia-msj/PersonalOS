"use client";
import {useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import type {QuickAddLoadState} from '../types';
import {ActionForm,type AffairsAction} from './action-form';
import {CaptureForm} from './capture-form';
import {TaskFields,ProjectFields} from './entity-fields';
import {MainlineForm} from './mainline-form';
import {ProgressEntryForm} from './progress-entry-form';
import {GuardedPanel,canLeaveAffairsForm} from './guarded-panel';
import styles from './affairs.module.css';
type Kind='capture'|'task'|'project'|'mainline'|'progress';
export function QuickAdd({action,optionsAction}:{action:AffairsAction;optionsAction:()=>Promise<QuickAddLoadState>}) {
 const pathname=usePathname();
 const [open,setOpen]=useState(false),[kind,setKind]=useState<Kind>('capture');
 const [options,setOptions]=useState<QuickAddLoadState|null>(null),[loading,setLoading]=useState(false);
 const root=useRef<HTMLDivElement>(null),stale=useRef(true);
 async function load(){
  setLoading(true);
  try{const result=await optionsAction();setOptions(result);stale.current=result.status!=='ready';}
  catch{setOptions({status:'error',message:'暂时无法加载选项，请重试。'});}
  finally{setLoading(false);}
 }
 function change(next:Kind){
  if(!canLeaveAffairsForm(root.current))return;
  setKind(next);
  if(next!=='capture'&&(!options||stale.current)&&!loading)void load();
 }
 const saved=()=>{stale.current=true;};
 const data=options?.status==='ready'?options.data:null;
 const projectId=pathname?.match(/^\/affairs\/projects\/([^/]+)$/)?.[1];
 const contextualProject=data?.projects.find(p=>p.id===projectId&&!['archived','completed'].includes(p.status));
 return <>
  <button className={styles.primaryButton} type="button" onClick={()=>{setKind('capture');setOptions(null);stale.current=true;setOpen(true);}} aria-label="新增">＋ 新增</button>
  <GuardedPanel open={open} title="新增" onClose={()=>setOpen(false)}><div ref={root}>
   <div className={styles.filters}>{([['capture','快速收集'],['task','行动'],['project','项目'],['mainline','主线'],['progress','进展']] as const).map(([key,label])=><button key={key} type="button" className={kind===key?styles.selectedFilter:styles.filter} onClick={()=>change(key)}>{label}</button>)}</div>
   {kind==='capture'?<CaptureForm action={action} onSaved={saved}/>:loading?<p role="status">正在加载…</p>:options?.status==='error'?<div role="alert"><p>{options.message}</p><button type="button" onClick={()=>void load()}>重试</button></div>:data?
    kind==='task'?<>{projectId&&projectId!=='new'&&!contextualProject?<p role="alert">当前项目不可用于新增行动，请重新选择所属项目。</p>:null}<ActionForm key="task" action={action} operation="create_affairs_task" submitLabel="保存行动" resetOnSuccess receiptDisplay="none" onState={s=>{if(s.status==='success'&&s.receipt)saved();}}><TaskFields projects={data.projects} initialValues={{projectId:contextualProject?.id??null}}/></ActionForm></>:
    kind==='project'?<ActionForm key="project" action={action} operation="create_affairs_project" submitLabel="保存项目" resetOnSuccess receiptDisplay="none" onState={s=>{if(s.status==='success'&&s.receipt)saved();}}><ProjectFields mainlines={data.mainlines}/></ActionForm>:
    kind==='mainline'?<MainlineForm data={{...data,resource:'mainline',initialValues:null}} action={action} mode="create" embedded onSaved={saved}/>:
    <ProgressEntryForm {...data} action={action} embedded onSaved={saved}/>:null}
  </div></GuardedPanel>
 </>;
}
