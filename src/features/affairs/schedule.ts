import type {AffairsProject,AffairsTask} from "./types";
import {validCalendarMonth} from "./calendar-location";
import {validateScheduleMetadata} from "@/lib/affairs/schedule-validation";
const dayMs=86400000;
const stamp=(date:string)=>new Date(date+"T00:00:00Z").getTime();
const dateAt=(time:number)=>{const d=new Date(time);return String(d.getUTCFullYear()).padStart(4,"0")+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0");};
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const pointOrder=(a:CalendarItem,b:CalendarItem)=>compare(a.time??"99:99",b.time??"99:99")||compare(a.resource,b.resource)||compare(a.title,b.title)||compare(a.id,b.id);
export function buildMonthCalendar(projects:AffairsProject[],tasks:AffairsTask[],month:string,today:string):MonthCalendarModel {
 if(!validCalendarMonth(month)) throw new Error("invalid_calendar_month");
 const names=new Map(projects.map(p=>[p.id,p.name]));
 const items:CalendarItem[]=[
  ...projects.filter(p=>p.status==="active"||p.status==="paused").map(p=>({key:"project:"+p.id,id:p.id,resource:"project" as const,title:p.name,projectName:null,startDate:p.plannedStartDate??null,endDate:p.dueDate??null,time:p.plannedTime??null,status:p.status,href:"/affairs/projects/"+p.id})),
  ...tasks.filter(t=>["todo","in_progress","waiting"].includes(t.status)).map(t=>({key:"task:"+t.id,id:t.id,resource:"task" as const,title:t.title,projectName:t.projectId?names.get(t.projectId)??null:null,startDate:t.plannedStartDate??null,endDate:t.dueDate??null,time:t.plannedTime??null,status:t.status,href:"/affairs/tasks/"+t.id+"/edit"}))
 ];
 for(const item of items) if(Object.keys(validateScheduleMetadata({due_date:item.endDate,planned_start_date:item.startDate,planned_time:item.time})).length) throw new Error("invalid_calendar_schedule");
 const first=stamp(month+"-01");
 const next=new Date(first);next.setUTCMonth(next.getUTCMonth()+1);
 const last=next.getTime()-dayMs;
 const gridStart=first-((new Date(first).getUTCDay()+6)%7)*dayMs;
 const gridEnd=last+(6-(new Date(last).getUTCDay()+6)%7)*dayMs;
 const ranges=items.filter(i=>i.startDate&&i.endDate&&stamp(i.startDate)<=gridEnd&&stamp(i.endDate)>=gridStart)
  .sort((a,b)=>compare(a.startDate!,b.startDate!)||compare(a.endDate!,b.endDate!)||compare(a.resource,b.resource)||compare(a.id,b.id));
 const laneEnds:number[]=[],lanes=new Map<string,number>();
 for(const item of ranges) {
  const start=stamp(item.startDate!),end=stamp(item.endDate!);
  let lane=laneEnds.findIndex(v=>v<start);if(lane===-1)lane=laneEnds.length;
  laneEnds[lane]=end;lanes.set(item.key,lane);
 }
 const points=new Map<string,CalendarItem[]>();
 for(const item of items) if(!(item.startDate&&item.endDate)) {
  const date=item.endDate??item.startDate;
  if(date) points.set(date,[...(points.get(date)??[]),item]);
 }
 const weeks:CalendarWeek[]=[];
 for(let start=gridStart;start<=gridEnd;start+=7*dayMs) {
  const end=start+6*dayMs;
  weeks.push({startDate:dateAt(start),days:Array.from({length:7},(_,n)=>{
   const date=dateAt(start+n*dayMs);
   return {date,inMonth:date.slice(0,7)===month,isToday:date===today,items:[...(points.get(date)??[])].sort(pointOrder)};
  }),segments:ranges.filter(i=>stamp(i.startDate!)<=end&&stamp(i.endDate!)>=start).map(item=>{
   const a=stamp(item.startDate!),b=stamp(item.endDate!);
   return {item,startColumn:Math.round((Math.max(a,start)-start)/dayMs),span:Math.round((Math.min(b,end)-Math.max(a,start))/dayMs)+1,lane:lanes.get(item.key)!,continuesBefore:a<start,continuesAfter:b>end};
  })});
 }
 return {month,weeks,unscheduled:items.filter(i=>!i.startDate&&!i.endDate).sort(pointOrder)};
}
export interface CalendarItem {key:string;id:string;resource:"project"|"task";title:string;projectName:string|null;startDate:string|null;endDate:string|null;time:string|null;status:string;href:string;}
export interface CalendarWeek {startDate:string;days:{date:string;inMonth:boolean;isToday:boolean;items:CalendarItem[]}[];segments:{item:CalendarItem;startColumn:number;span:number;lane:number;continuesBefore:boolean;continuesAfter:boolean}[];}
export interface MonthCalendarModel {month:string;weeks:CalendarWeek[];unscheduled:CalendarItem[];}
