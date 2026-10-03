import type {DailyContributionRow} from '@/lib/affairs/types';import {validDate,safeInteger} from '@/lib/affairs/validation';
export interface ContributionDay {date:string;weekday:number;count:number;isFuture:boolean;isToday:boolean}
export interface ContributionWeek {startDate:string;days:ContributionDay[]}
export function contributionIntensity(count:number):number{return count===0?0:count===1?1:count<=3?2:count<=6?3:4;}
export function buildContributionGrid(rows:DailyContributionRow[],today:string):ContributionWeek[]{
 if(!validDate(today))throw new Error('invalid_date');const monday=new Date(today+'T00:00:00Z');monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7-25*7);
 const counts=new Map<string,number>();for(const row of rows){const count=safeInteger(row.contribution_count);if(!validDate(row.business_date)||count<0)throw new Error('invalid_contribution');counts.set(row.business_date,count);}
 return Array.from({length:26},(_,week)=>{const start=new Date(monday);start.setUTCDate(start.getUTCDate()+week*7);return {startDate:start.toISOString().slice(0,10),days:Array.from({length:7},(_,weekday)=>{const d=new Date(start);d.setUTCDate(d.getUTCDate()+weekday);const date=d.toISOString().slice(0,10);return {date,weekday,count:date>today?0:counts.get(date)??0,isFuture:date>today,isToday:date===today};})};});
}
