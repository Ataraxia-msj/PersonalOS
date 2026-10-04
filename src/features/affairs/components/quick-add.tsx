"use client";
import {useRef,useState} from 'react';
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
 const [open,setOpen]=useState(false),[kind,setKind]=useState<Kind>('capture'),[options,setOptions]=useState<QuickAddLoadState|null>(null),[loading,setLoading]=useState(false);const root=useRef<HTMLDivElement>(null);
 async function load(){setLoading(true);try{setOptions(await optionsAction());}catch{setOptions({status:'error',message:'暂时无法加载选项，请重试。'});}finally{setLoading(false);}}
 function change(next:Kind){if(!canLeaveAffairsForm(root.current)) return;setKind(next);if(next!=='capture'&&!options&&!loading) void load();}
 const data=options?.status==='ready'?options.data:null;
 return <><button className={styles.primaryButton} type="button" onClick={()=>{setKind('capture');setOpen(true);}} aria-label="新增">＋ 新增</button><GuardedPanel open={open} title="新增" onClose={()=>setOpen(false)}><div ref={root}><div className={styles.filters}>{([['capture','快速收集'],['task','行动'],['project','项目'],['mainline','主线'],['progress','进展']] as const).map(([key,label])=><button key={key} type="button" className={kind===key?styles.selectedFilter:styles.filter} onClick={()=>change(key)}>{label}</button>)}</div>{kind==='capture'?<CaptureForm action={action}/>:loading?<p role="status">正在加载…</p>:options?.status==='error'?<div role="alert"><p>{options.message}</p><button type="button" onClick={()=>void load()}>重试</button></div>:data?kind==='task'?<ActionForm key="task" action={action} operation="create_affairs_task" submitLabel="保存行动" resetOnSuccess receiptDisplay="none"><TaskFields projects={data.projects}/></ActionForm>:kind==='project'?<ActionForm key="project" action={action} operation="create_affairs_project" submitLabel="保存项目" resetOnSuccess receiptDisplay="none"><ProjectFields mainlines={data.mainlines}/></ActionForm>:kind==='mainline'?<MainlineForm data={{...data,resource:'mainline',initialValues:null}} action={action} mode="create" embedded/>:<ProgressEntryForm {...data} action={action} embedded/>:null}</div></GuardedPanel></>;
}
