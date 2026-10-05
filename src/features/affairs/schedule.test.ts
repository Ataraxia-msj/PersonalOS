import {describe,it,expect} from "vitest";
import {buildMonthCalendar} from "./schedule";
import type {AffairsProject,AffairsTask} from "./types";
export const project=(overrides:Partial<AffairsProject>={}):AffairsProject=>({id:"p",name:"Project",status:"active",plannedStartDate:"2026-10-01",dueDate:"2026-10-12",plannedTime:null,...overrides} as AffairsProject);
export const task=(overrides:Partial<AffairsTask>={}):AffairsTask=>({id:"t",title:"Interview",status:"todo",plannedStartDate:null,dueDate:"2026-10-08",plannedTime:"10:30",projectId:null,...overrides} as AffairsTask);
describe("pure month calendar",()=>{
 it("covers whole Monday weeks without timezone shifting dates",()=>{
  const model=buildMonthCalendar([],[],"2026-10","2026-10-05");
  expect(model.weeks).toHaveLength(5);
  expect(model.weeks[0].days[0].date).toBe("2026-09-28");
  expect(model.weeks[4].days[6].date).toBe("2026-11-01");
  expect(buildMonthCalendar([],[],"2021-02","2021-02-01").weeks).toHaveLength(4);
  expect(buildMonthCalendar([],[],"2026-03","2026-03-01").weeks).toHaveLength(6);
 });
 it("splits an inclusive span at week boundaries, never past its last day",()=>{
  const model=buildMonthCalendar([project()],[],"2026-10","2026-10-05");
  expect(model.weeks.flatMap(w=>w.segments).map(s=>[s.startColumn,s.span,s.continuesBefore,s.continuesAfter])).toEqual([[3,4,false,true],[0,7,true,true],[0,1,true,false]]);
 });
 it("keeps ranges, points and unarranged separate without parent date inference",()=>{
  const model=buildMonthCalendar([project({plannedStartDate:null,dueDate:null})],[task(),task({id:"s",plannedStartDate:"2026-10-07",dueDate:null,plannedTime:null}),task({id:"u",dueDate:null,plannedTime:null})],"2026-10","2026-10-05");
  expect(model.unscheduled.map(x=>x.key)).toEqual(["project:p","task:u"]);
  expect(model.weeks[1].days[3].items[0]).toMatchObject({key:"task:t",time:"10:30"});
  expect(model.weeks.flatMap(w=>w.segments)).toHaveLength(0);
 });
 it("uses stable nonoverlapping lanes and resource keys irrespective of input order",()=>{
  const ps=[project(),project({id:"q",plannedStartDate:"2026-10-05",dueDate:"2026-10-20"}),project({id:"r",plannedStartDate:"2026-10-08",dueDate:"2026-10-25"})];
  const ts=[task({id:"p",plannedStartDate:"2026-10-01",dueDate:"2026-10-12",plannedTime:null})];
  const a=buildMonthCalendar(ps,ts,"2026-10","2026-10-05");
  expect(a).toEqual(buildMonthCalendar([...ps].reverse(),ts,"2026-10","2026-10-05"));
  for(const w of a.weeks) for(const s of w.segments) for(const other of w.segments) if(s.item.key!==other.item.key&&s.lane===other.lane) expect(s.startColumn+s.span<=other.startColumn||other.startColumn+other.span<=s.startColumn).toBe(true);
  expect(new Set(a.weeks[1].segments.map(s=>s.item.key)).size).toBe(4);
 });
 it("hides only terminal states, keeps paused/waiting, and sorts actual times",()=>{
  const model=buildMonthCalendar([project({status:"archived"}),project({id:"paused",status:"paused"})],[task({status:"done"}),task({id:"waiting",status:"waiting",plannedTime:"00:00"}),task({id:"last",plannedTime:"23:59"}),task({id:"no",plannedTime:null})],"2026-10","2026-10-05");
  expect(model.weeks[1].days[3].items.map(i=>i.id)).toEqual(["waiting","last","no"]);
  expect(model.weeks[0].segments[0].item.id).toBe("paused");
 });
 it("supports leap days, single-day spans and cross-year clipping",()=>{
  expect(buildMonthCalendar([project({plannedStartDate:"2024-02-29",dueDate:"2024-02-29"})],[],"2024-02","2024-02-29").weeks.flatMap(w=>w.segments).map(s=>s.span)).toEqual([1]);
  expect(buildMonthCalendar([project({plannedStartDate:"2025-12-30",dueDate:"2026-01-02"})],[],"2026-01","2026-01-01").weeks[0].segments[0].span).toBe(4);
 });
});
