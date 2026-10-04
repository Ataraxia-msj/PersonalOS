"use client";
import Link from 'next/link';
import {IconChevronRight} from '@tabler/icons-react';
import type {AffairsDashboardData} from '../types';
import {buildAffairsOutline} from '@/lib/affairs/workbench';
import {formatProgressRate} from '../format';
import {ActionForm,type AffairsAction} from './action-form';
import styles from './affairs.module.css';
export function MainlineOutline({data,action,history,onScope}:{data:AffairsDashboardData;action:AffairsAction;history:boolean;onScope:(id:string|null)=>void}) {
 const tree=buildAffairsOutline(data.mainlines,data.projects,data.tasks);
 const projectNode=({project:p,tasks}:typeof tree.independentProjects[number])=> <details key={p.id} className={styles.outlineProject}>
 <summary><IconChevronRight size={16} className={styles.chevron}/><span>{p.name}</span><span className={styles.muted}>{p.status==='active'?'进行中':p.status==='paused'?'已暂停':p.status==='completed'?'已完成':'已归档'} · {p.progressRate===null?"—":formatProgressRate(p.progressRate)}</span></summary>
 <div className={styles.rowActions}><Link href={'/affairs/projects/'+p.id}>查看项目</Link><button type="button" className={styles.textButton} onClick={()=>onScope(p.id)}>查看此项目行动</button><Link href={'/affairs/tasks/new?projectId='+p.id}>添加行动</Link></div>
 {tasks.length?<ul className={styles.outlineTasks}>{tasks.map(t=><li key={t.id}><Link href={'/affairs/tasks/'+t.id+'/edit'}>{t.title}</Link><small>{t.status==='done'?'已完成':t.status==='cancelled'?'已取消':t.status==='waiting'?'等待':t.status==='in_progress'?'推进中':'待开始'}{t.isCore?' · 核心':''}</small></li>)}</ul>:<p className={styles.muted}>暂无行动。</p>}
 </details>;
 return <div className={styles.outline}>{tree.mainlines.filter(n=>history||n.mainline.status!=='archived').map(({mainline:m,projects})=><section key={m.id} className={styles.outlineMainline}><header className={styles.sectionHeader}><h3>{m.name}</h3><details><summary>管理</summary><Link href={'/affairs/mainlines/'+m.id+'/edit'}>编辑主线</Link><Link href={'/affairs/projects/new?mainlineId='+m.id}>添加项目</Link><ActionForm operation="set_affairs_mainline_focus" identity={m} action={action} submitLabel="切换关注项目" receiptDisplay="none"><label>当前关注<select name="project_id" defaultValue={m.focusProjectId??''}><option value="">不指定</option>{projects.map(({project:p})=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></ActionForm></details></header>{projects.filter(n=>history||n.project.status!=='archived').map(n=><div key={n.project.id}>{n.project.id===m.focusProjectId?<small className={styles.accent}>当前关注</small>:null}{projectNode(n)}</div>)}{!projects.length?<p className={styles.muted}>暂无项目。</p>:null}</section>)}{tree.independentProjects.some(n=>history||n.project.status!=='archived')?<section className={styles.outlineMainline}><h3>独立项目</h3>{tree.independentProjects.filter(n=>history||n.project.status!=='archived').map(projectNode)}</section>:null}</div>;
}
