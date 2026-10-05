"use client";
import Link from "next/link";
import {useEffect,useMemo,useRef,useState} from "react";
import {useRouter} from 'next/navigation';
import {IconChevronLeft,IconChevronRight} from '@tabler/icons-react';
import type {AffairsDashboardData,AffairsTaskScope} from "../types";
import {summarizeWorkbench} from "@/lib/affairs/workbench";
import {WorkbenchSummary} from "./workbench-summary";
import {MainlineOutline} from "./mainline-outline";
import {TaskList} from "./task-list";
import {ContributionHeatmap} from "./contribution-heatmap";
import type {AffairsAction} from "./action-form";
import {canLeaveAffairsForm} from "./guarded-panel";
import {MonthCalendar} from './month-calendar';
import {buildMonthCalendar} from '../schedule';
import {parseCalendarLocation,shiftCalendarMonth,type CalendarLocation} from '../calendar-location';
import styles from "./affairs.module.css";
export function ProgressDashboard({data,action,initialLocation}:{data:AffairsDashboardData;action:AffairsAction;initialLocation?:CalendarLocation}) {
 const [history,setHistory]=useState(false);const [scope,setScope]=useState<AffairsTaskScope>({kind:'all'});const root=useRef<HTMLDivElement>(null);const changeScope=(value:AffairsTaskScope)=>{if(canLeaveAffairsForm(root.current))setScope(value);};
 const router=useRouter();
 const [location,setLocation]=useState<CalendarLocation>(initialLocation??{view:'list',month:data.today.slice(0,7)});
 const model=useMemo(()=>location.view==='calendar'?buildMonthCalendar(data.projects,data.tasks,location.month,data.today):null,[data.projects,data.tasks,data.today,location.view,location.month]);
 useEffect(()=>{
  // Layout's capture-phase navigation guard rejects unsafe history changes first.
  const pop=()=>setLocation(parseCalendarLocation(new URLSearchParams(window.location.search),data.today));
  window.addEventListener('popstate',pop);
  return ()=>window.removeEventListener('popstate',pop);
 },[data.today]);
 const navigate=(next:CalendarLocation)=>{
  if(!canLeaveAffairsForm(document.body)||(next.view===location.view&&next.month===location.month))return;
  const url=new URL(window.location.href);url.searchParams.set('view',next.view);url.searchParams.set('month',next.month);
  window.history.pushState({...window.history.state},'',url.pathname+url.search+url.hash);setLocation(next);
 };
 const create=(date:string)=>{if(canLeaveAffairsForm(document.body))router.push('/affairs/tasks/new?dueDate='+date);};
 return <div ref={root}>
  <WorkbenchSummary summary={summarizeWorkbench(data.tasks,data.projects,data.balance,data.serverNowISO)}/>
  <ContributionHeatmap rows={data.contributions} today={data.today} progress={data.progress}/>
  <div className={styles.calendarToolbar}>
   <div className={styles.viewSwitch} aria-label="工作台视图">
    <button type="button" aria-pressed={location.view==='list'} onClick={()=>navigate({...location,view:'list'})}>清单</button>
    <button type="button" aria-pressed={location.view==='calendar'} onClick={()=>navigate({...location,view:'calendar'})}>日历</button>
   </div>
   {location.view==='calendar'?<div className={styles.monthNavigation}>
    <strong>{Number(location.month.slice(0,4))}年{Number(location.month.slice(5))}月</strong>
    <button type="button" aria-label="上个月" disabled={location.month==='1000-01'} onClick={()=>navigate({...location,month:shiftCalendarMonth(location.month,-1)})}><IconChevronLeft size={18} aria-hidden="true"/></button>
    <button type="button" onClick={()=>navigate({...location,month:data.today.slice(0,7)})}>今天</button>
    <button type="button" aria-label="下个月" disabled={location.month==='9999-12'} onClick={()=>navigate({...location,month:shiftCalendarMonth(location.month,1)})}><IconChevronRight size={18} aria-hidden="true"/></button>
   </div>:null}
  </div>
  {model?<MonthCalendar model={model} tasks={data.tasks} projects={data.projects} balance={data.balance} action={action} onCreateTask={create}/>:<>
   <section className={styles.section}><header className={styles.sectionHeader}><h2>主线与项目</h2><label className={styles.checkLabel}><input type="checkbox" checked={history} onChange={e=>{if(canLeaveAffairsForm(root.current))setHistory(e.target.checked);}}/>显示归档</label></header><MainlineOutline data={data} action={action} history={history} onScope={id=>changeScope(id?{kind:"project",id}:{kind:"all"})}/>{!data.mainlines.length&&!data.projects.length?<div className={styles.empty}>还没有主线或项目。<div className={styles.rowActions}><Link href="/affairs/mainlines/new">新建主线</Link><Link href="/affairs/projects/new">新建项目</Link></div></div>:null}</section>
   <div className={styles.filters}><label className={styles.projectSelect}>行动范围<select value={scope.kind==='all'?'all':scope.kind==='independent'?'independent':scope.kind+':'+scope.id} onChange={e=>{const v=e.target.value;changeScope(v==='all'?{kind:'all'}:v==='independent'?{kind:'independent'}:v.startsWith('mainline:')?{kind:'mainline',id:v.slice(9)}:{kind:'project',id:v.slice(8)});}}><option value="all">全部行动</option><option value="independent">独立行动</option>{data.mainlines.map(m=><option key={m.id} value={'mainline:'+m.id}>{m.name}</option>)}{data.projects.map(p=><option key={p.id} value={'project:'+p.id}>{p.name}</option>)}</select></label></div>
   <TaskList tasks={data.tasks} projects={data.projects} balance={data.balance} action={action} scope={scope}/>
  </>}
 </div>;
}
