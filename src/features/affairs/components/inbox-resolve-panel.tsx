"use client";
import {useRef,useState} from 'react';
import Link from 'next/link';
import type {AffairsInboxEntry,AffairsInboxData} from '../types';
import {ActionForm,type AffairsAction} from './action-form';
import {TaskFields,ProjectFields} from './entity-fields';
import {canLeaveAffairsForm} from './guarded-panel';
import styles from './affairs.module.css';
export function InboxResolvePanel({entry,data,action,onSaved}:{entry:AffairsInboxEntry;data:AffairsInboxData;action:AffairsAction;onSaved:()=>void}) {
 const [target,setTarget]=useState<'task'|'project'>('task'),[mode,setMode]=useState<'resolve'|'edit'|'discard'>('resolve');const root=useRef<HTMLDivElement>(null);
 const done=(s:Parameters<NonNullable<React.ComponentProps<typeof ActionForm>['onState']>>[0])=>{if(s.status==='success'&&s.receipt)onSaved();};
 const task=data.tasks.find(t=>t.id===entry.resolvedTaskId),project=data.projects.find(p=>p.id===entry.resolvedProjectId);
 return <div ref={root} className={styles.resolvePane}><header className={styles.sectionHeader}><h2>{entry.status==='pending'?'整理':'原始记录'}</h2>{entry.status==='pending'?<div className={styles.rowActions}>{(['resolve','edit','discard'] as const).map(k=><button type="button" className={styles.textButton} key={k} onClick={()=>{if(canLeaveAffairsForm(root.current))setMode(k);}}>{k==='resolve'?'整理':k==='edit'?'编辑原文':'丢弃'}</button>)}</div>:null}</header>
 <div className={styles.originalText}>{entry.content}</div>
 {entry.status==='resolved'?<div className={styles.sourceLinks}>{task?<Link href={'/affairs/tasks/'+task.id+'/edit'}>{task.title}</Link>:project?<Link href={'/affairs/projects/'+project.id}>{project.name}</Link>:<span>目标暂不可用</span>}</div>:entry.status==='discarded'?<ActionForm operation="restore_affairs_inbox_entry" identity={entry} action={action} submitLabel="恢复到待整理" receiptDisplay="none" onState={done}/>:mode==='edit'?<ActionForm operation="update_affairs_inbox_entry" key="edit" identity={entry} action={action} submitLabel="保存原文" receiptDisplay="none" onState={done}><label>原文<textarea name="content" required defaultValue={entry.content}/></label></ActionForm>:mode==='discard'?<ActionForm operation="discard_affairs_inbox_entry" key="discard" identity={entry} action={action} submitLabel="确认丢弃" receiptDisplay="none" onState={done}><p>移至已丢弃，之后可以恢复。</p></ActionForm>:<><div className={styles.filters}>{(['task','project'] as const).map(k=><button key={k} type="button" aria-pressed={target===k} className={target===k?styles.selectedFilter:styles.filter} onClick={()=>{if(canLeaveAffairsForm(root.current))setTarget(k);}}>{k==='task'?'行动':'项目'}</button>)}</div><ActionForm key={target} action={action} operation="resolve_affairs_inbox_entry" identity={entry} receiptDisplay="none" submitLabel={target==='task'?'创建行动':'创建项目'} onState={done}><input type="hidden" name="target" value={target}/>{target==='task'?<TaskFields titleLabel="标题" projects={data.projects} initialValues={{title:entry.content}}/>:<ProjectFields mainlines={data.mainlines} initialValues={{name:entry.content}}/>}</ActionForm></>}
 </div>;
}
