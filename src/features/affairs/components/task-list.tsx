"use client";
import {useRef,useState} from "react";
import Link from "next/link";
import type {AffairsTask,AffairsProject,AffairsTaskScope} from "../types";
import {ActionRow} from "./action-row";
import {canLeaveAffairsForm} from "./guarded-panel";
import type {AffairsAction} from "./action-form";
import styles from "./affairs.module.css";
export function TaskList({tasks,projects,balance,action,showAll=false,variant='workbench',scope={kind:'all'}}:{
 tasks:AffairsTask[];projects:AffairsProject[];balance:number;action:AffairsAction;
 showAll?:boolean;variant?:'workbench'|'full';scope?:AffairsTaskScope;
}) {
 const [filter,setFilter]=useState('pending');
 const [protectedRows,setProtectedRows]=useState<Map<string,{task:AffairsTask;project:AffairsProject|null}>>(()=>new Map());
 const root=useRef<HTMLElement>(null);
 const full=showAll||variant==='full';
 const byId=new Map(projects.map(p=>[p.id,p]));
 const candidates=new Map(tasks.map(t=>[t.id,t]));
 for(const [id,snapshot] of protectedRows)candidates.set(id,snapshot.task);
 const visible=[...candidates.values()].filter(t=>{
  if(protectedRows.has(t.id))return true;
  const inScope=scope.kind==='all'||(scope.kind==='independent'?!t.projectId:scope.kind==='project'?t.projectId===scope.id:byId.get(t.projectId??'')?.mainlineId===scope.id);
  const pending=['todo','in_progress','waiting'].includes(t.status);
  return inScope&&(filter==='all'||(filter==='pending'?pending:filter==='core'?t.isCore&&pending:t.status===filter));
 });
 return <section className={styles.section} ref={root}>
  <header className={styles.sectionHeader}><h2>行动清单</h2>{full?<Link href="/affairs">返回工作台</Link>:<Link href="/affairs/tasks">查看全部</Link>}</header>
  <div className={styles.filters}>{[['pending','全部未完成'],['core','核心行动'],['waiting','等待'],...(full?[['done','已完成'],['cancelled','已取消'],['all','全部历史']]:[])].map(([key,label])=>
    <button key={key} type="button" className={filter===key?styles.selectedFilter:styles.filter} aria-pressed={filter===key} onClick={()=>{if(canLeaveAffairsForm(root.current)){setProtectedRows(new Map());setFilter(key);}}}>{label}</button>
  )}</div>
  <div className={styles.taskRows}>{visible.map(task=>{
   const project=protectedRows.get(task.id)?.project??byId.get(task.projectId??'')??null;
   return <ActionRow key={task.id} task={task} project={project} balance={balance} action={action} onProtectionChange={active=>setProtectedRows(previous=>{
    if(active===previous.has(task.id))return previous;
    const next=new Map(previous);if(active)next.set(task.id,{task,project});else next.delete(task.id);return next;
   })}/>;
  })}</div>
  {!visible.length?<p className={styles.muted}>暂无符合条件的行动。</p>:null}
 </section>;
}
