export interface CalendarLocation {view:"list"|"calendar";month:string;}
export function validCalendarMonth(value:string):boolean {return /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);}
export function parseCalendarLocation(params:URLSearchParams,today:string):CalendarLocation {
 const views=params.getAll("view"),months=params.getAll("month");
 return {view:views.length===1&&views[0]==="calendar"?"calendar":"list",month:months.length===1&&validCalendarMonth(months[0])?months[0]:today.slice(0,7)};
}
export function shiftCalendarMonth(month:string,delta:-1|1):string {
 if(!validCalendarMonth(month)) throw new Error("invalid_calendar_month");
 const total=Number(month.slice(0,4))*12+Number(month.slice(5))-1+delta;
 const year=Math.floor(total/12),m=total%12+1;
 if(year<1000||year>9999) throw new Error("calendar_month_out_of_range");
 return year+"-"+String(m).padStart(2,"0");
}
