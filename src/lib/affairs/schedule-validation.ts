const minute=/^([01]\d|2[0-3]):[0-5]\d$/;
export function scheduleDate(value:string):boolean {
 if(!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
 const parsed=new Date(value+"T00:00:00Z");
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
export function normalizeScheduleTime(value:unknown):string|null {
 if(value===null) return null;
 if(typeof value!=="string") throw new Error("missing_or_invalid_schedule_time");
 const text=value.endsWith(":00")&&value.length===8?value.slice(0,5):value;
 if(!minute.test(text)) throw new Error("invalid_schedule_time");
 return text;
}
export function validateScheduleMetadata(input:{due_date:string|null;planned_start_date?:string|null;planned_time?:string|null}):Record<string,string> {
 const errors:Record<string,string>={};
 for(const key of ["due_date","planned_start_date"] as const) {
  const value=input[key];
  if(value!=null&&!scheduleDate(value)) errors[key]="日期无效";
 }
 if(input.planned_start_date&&input.due_date&&input.planned_start_date>input.due_date) errors.planned_start_date="开始日期不能晚于截止日期";
 if(input.planned_time!=null&&(!minute.test(input.planned_time)||!input.due_date)) errors.planned_time="时间需为00:00–23:59，且必须有截止日期";
 return errors;
}
