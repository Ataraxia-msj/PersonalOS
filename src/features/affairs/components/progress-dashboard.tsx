"use client";
import Link from "next/link";
import {useRef,useState} from "react";
import type {AffairsDashboardData,AffairsTaskScope} from "../types";
import {summarizeWorkbench} from "@/lib/affairs/workbench";
import {WorkbenchSummary} from "./workbench-summary";
import {MainlineOutline} from "./mainline-outline";
import {TaskList} from "./task-list";
import {ContributionHeatmap} from "./contribution-heatmap";
import type {AffairsAction} from "./action-form";
import {canLeaveAffairsForm} from "./guarded-panel";
import styles from "./affairs.module.css";
export function ProgressDashboard({data,action}:{data:AffairsDashboardData;action:AffairsAction}) {
 const [history,setHistory]=useState(false);const [scope,setScope]=useState<AffairsTaskScope>({kind:'all'});const root=useRef<HTMLDivElement>(null);const changeScope=(value:AffairsTaskScope)=>{if(canLeaveAffairsForm(root.current))setScope(value);};
 return <div ref={root}><WorkbenchSummary summary={summarizeWorkbench(data.tasks,data.projects,data.balance,data.serverNowISO)}/><ContributionHeatmap rows={data.contributions} today={data.today} progress={data.progress}/><section className={styles.section}><header className={styles.sectionHeader}><h2>主线与项目</h2><label className={styles.checkLabel}><input type="checkbox" checked={history} onChange={e=>{if(canLeaveAffairsForm(root.current))setHistory(e.target.checked);}}/>显示归档</label></header><MainlineOutline data={data} action={action} history={history} onScope={id=>changeScope(id?{kind:"project",id}:{kind:"all"})}/>{!data.mainlines.length&&!data.projects.length?<div className={styles.empty}>还没有主线或项目。<div className={styles.rowActions}><Link href="/affairs/mainlines/new">新建主线</Link><Link href="/affairs/projects/new">新建项目</Link></div></div>:null}</section><div className={styles.filters}><label className={styles.projectSelect}>行动范围<select value={scope.kind==='all'?'all':scope.kind==='independent'?'independent':scope.kind+':'+scope.id} onChange={e=>{const v=e.target.value;changeScope(v==='all'?{kind:'all'}:v==='independent'?{kind:'independent'}:v.startsWith('mainline:')?{kind:'mainline',id:v.slice(9)}:{kind:'project',id:v.slice(8)});}}><option value="all">全部行动</option><option value="independent">独立行动</option>{data.mainlines.map(m=><option key={m.id} value={'mainline:'+m.id}>{m.name}</option>)}{data.projects.map(p=><option key={p.id} value={'project:'+p.id}>{p.name}</option>)}</select></label></div><TaskList tasks={data.tasks} projects={data.projects} balance={data.balance} action={action} scope={scope}/></div>;
}
