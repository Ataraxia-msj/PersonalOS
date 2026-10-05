import type {AffairsProject,AffairsMainline} from '@/features/affairs/types';
import {scheduleDate} from './schedule-validation';
export function creationDate(value:string|undefined):{date:string|null;error:string|null} {
 if(value===undefined)return {date:null,error:null};
 return scheduleDate(value)?{date:value,error:null}:{date:null,error:'日期参数无效，请重新选择。'};
}
export function creationContext(resource:'task'|'project',id:string|undefined,projects:AffairsProject[],mainlines:AffairsMainline[]) {
 if(!id)return {id:null,error:null};
 const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)&&(resource==='task'?projects.some(p=>p.id===id&&!['archived','completed'].includes(p.status)):mainlines.some(m=>m.id===id&&m.status!=='archived'));
 return valid?{id,error:null}:{id:null,error:'原归属不可用，请重新选择。'};
}
