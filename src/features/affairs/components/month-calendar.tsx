"use client";
import {useEffect,useRef,useState,type CSSProperties} from "react";
import {IconSquare,IconCircleFilled,IconChevronRight} from "@tabler/icons-react";
import type {MonthCalendarModel,CalendarItem,CalendarWeek} from "../schedule";
import type {AffairsTask,AffairsProject} from "../types";
import type {AffairsAction} from "./action-form";
import {scheduleDate} from "@/lib/affairs/schedule-validation";
import {canLeaveAffairsForm} from "./guarded-panel";
import {TaskCompletionPanel} from "./task-completion-panel";
import {CalendarItemDetails} from "./calendar-item-details";
import styles from "./month-calendar.module.css";
function dayItems(week:CalendarWeek,column:number):CalendarItem[] {
 const all=[...week.days[column].items,...week.segments.filter(s=>column>=s.startColumn&&column<s.startColumn+s.span).map(s=>s.item)];
 return [...new Map(all.map(i=>[i.key,i])).values()].sort((a,b)=>(a.time??"99:99").localeCompare(b.time??"99:99")||a.title.localeCompare(b.title)||a.key.localeCompare(b.key));
}
function tone(item:CalendarItem):number {let hash=0;for(const char of item.key)hash=(hash*31+char.charCodeAt(0))>>>0;return hash%3;}
type Selection={item:CalendarItem;task:AffairsTask|null;project:AffairsProject|null;mode:"details"|"complete"};
export function MonthCalendar({model,tasks,projects,balance,action,onCreateTask}:{model:MonthCalendarModel;tasks:AffairsTask[];projects:AffairsProject[];balance:number;action:AffairsAction;onCreateTask:(date:string)=>void}) {
 const root=useRef<HTMLDivElement>(null);
 const first=model.weeks.flatMap(w=>w.days).find(d=>d.isToday&&d.inMonth)?.date??model.month+"-01";
 const [day,setDay]=useState(first),[expanded,setExpanded]=useState(false),[selection,setSelection]=useState<Selection|null>(null);
 useEffect(()=>{setDay(first);setExpanded(false);},[model.month,first]);
 const guard=()=>canLeaveAffairsForm(root.current);
 const selectDay=(date:string,expand=false)=>{if(guard()){setDay(date);setExpanded(expand);}};
 const open=(item:CalendarItem,mode:"details"|"complete")=>{
  if(!guard())return;
  const task=item.resource==="task"?tasks.find(t=>t.id===item.id)??null:null;
  const project=item.resource==="project"?projects.find(p=>p.id===item.id)??null:null;
  if(mode==="complete"&&!task)return;
  setSelection({item:{...item},task:task?{...task}:null,project:project?{...project}:null,mode});
 };
 const create=(date:string)=>{if(scheduleDate(date)&&guard())onCreateTask(date);};
 const entry=(item:CalendarItem,compact=false)=><div className={styles.entry} key={item.key}>
  {item.resource==="task"?<button type="button" className={styles.check} aria-label={"完成："+item.title} onClick={()=>open(item,"complete")}><IconSquare size={16} aria-hidden="true"/></button>:null}
  <button type="button" className={styles.itemTitle} aria-label={"查看"+(item.resource==="project"?"项目":"行动")+"："+item.title} onClick={()=>open(item,"details")}>
   {item.time?<><IconCircleFilled size={8} aria-hidden="true"/><time>{item.time}</time></>:null}<span>{item.title}</span>
  </button>{!compact&&item.projectName?<small>{item.projectName}</small>:null}
 </div>;
 let selectedItems:CalendarItem[]=[];
 for(const w of model.weeks){const col=w.days.findIndex(d=>d.date===day);if(col!==-1)selectedItems=dayItems(w,col);}
 return <div ref={root} className={styles.calendar} aria-label="月历">
  <div className={styles.weekdayHeader} aria-hidden="true">{["一","二","三","四","五","六","日"].map(d=><span key={d}>{d}</span>)}</div>
  {model.weeks.map(week=>{
   const visible=week.segments.filter(s=>s.lane<3),laneCount=Math.max(0,...visible.map(s=>s.lane+1));
   return <div key={week.startDate} className={styles.week} style={{"--lanes":laneCount,gridTemplateRows:`32px repeat(${laneCount},24px) minmax(52px,auto)`} as CSSProperties}>
    {week.days.map((d,col)=>{
     const hiddenRanges=week.segments.filter(s=>s.lane>=3&&col>=s.startColumn&&col<s.startColumn+s.span).length;
     const extra=Math.max(0,d.items.length-2)+hiddenRanges;
     return <div key={d.date} className={styles.dayContents} style={{gridColumn:col+1}}>
      <button type="button" className={styles.blankDay} style={{gridColumn:col+1}} aria-label={"新增行动："+d.date} disabled={!scheduleDate(d.date)} onClick={()=>create(d.date)}/>
      <button type="button" className={styles.dayNumber} style={{gridColumn:col+1}} data-today={d.isToday} data-outside={!d.inMonth} aria-label={"查看日期："+d.date} aria-pressed={day===d.date} onClick={()=>selectDay(d.date)}>
       {d.date.endsWith("-01")?Number(d.date.slice(5,7))+"月 ":""}{Number(d.date.slice(-2))}
       {d.items.length?<IconCircleFilled size={4} className={styles.pointIndicator} aria-hidden="true"/>:null}
      </button>
      <div className={styles.points} style={{gridColumn:col+1,gridRow:laneCount+2}}>
       {d.items.slice(0,2).map(i=>entry(i,true))}
       {extra?<button className={styles.more} type="button" aria-label={`展开${d.date}的全部安排`} onClick={()=>selectDay(d.date,true)}>+{extra}</button>:null}
      </div>
     </div>;
    })}
    {visible.map(s=><div className={styles.segment} key={s.item.key} data-tone={tone(s.item)} data-before={s.continuesBefore} data-after={s.continuesAfter} style={{gridColumn:`${s.startColumn+1} / span ${s.span}`,gridRow:s.lane+2}}>
     {s.item.resource==="task"?<button type="button" className={styles.check} aria-label={"完成："+s.item.title} onClick={()=>open(s.item,"complete")}><IconSquare size={15} aria-hidden="true"/></button>:null}
     <button type="button" className={styles.rangeTitle} aria-label={"查看"+(s.item.resource==="project"?"项目":"行动")+"："+s.item.title+"（"+s.item.startDate+"至"+s.item.endDate+"）"} onClick={()=>open(s.item,"details")}><span>{s.item.title}</span>{s.continuesAfter?<IconChevronRight size={14} aria-hidden="true"/>:null}</button>
    </div>)}
   </div>;
  })}
  <section aria-label={day+" 的安排"} className={expanded?styles.dayListExpanded:styles.dayList}>
   <header><h3>{day}</h3><button type="button" onClick={()=>create(day)}>新增行动</button>{expanded?<button type="button" onClick={()=>{if(guard())setExpanded(false);}}>收起</button>:null}</header>
   {selectedItems.length?selectedItems.map(i=>entry(i)):<p>暂无安排</p>}
  </section>
  {model.unscheduled.length?<details className={styles.unscheduled}><summary>未安排 · {model.unscheduled.length}</summary>{model.unscheduled.map(i=>entry(i))}</details>:null}
  {selection?.mode==="details"?<CalendarItemDetails key={selection.item.key} {...selection} balance={balance} action={action} onClose={()=>setSelection(null)}/>:null}
  {selection?.mode==="complete"&&selection.task?<TaskCompletionPanel key={selection.item.key} task={selection.task} currentBalance={balance} action={action} initialMode="complete" hideTrigger onClose={()=>setSelection(null)}/>:null}
 </div>;
}
