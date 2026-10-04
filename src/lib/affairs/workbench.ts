import type {AffairsTask,AffairsProject,AffairsMainline} from '@/features/affairs/types';
export function summarizeWorkbench(tasks:AffairsTask[],projects:AffairsProject[],balance:number,serverNowISO:string) {
 const now=new Date(serverNowISO).getTime();const localDay=new Date(now+8*3600000).toISOString().slice(0,10);const start=new Date(localDay+'T00:00:00+08:00').getTime()-6*86400000;
 return {pendingTaskCount:tasks.filter(t=>['todo','in_progress','waiting'].includes(t.status)).length,activeProjectCount:projects.filter(p=>p.status==='active').length,completedLastSevenDays:tasks.filter(t=>{const at=t.completedAt?new Date(t.completedAt).getTime():NaN;return t.status==='done'&&at>=start&&at<=now;}).length,balance};
}
export const buildAffairsWorkbenchSummary=summarizeWorkbench;
export function buildAffairsOutline(mainlines:AffairsMainline[],projects:AffairsProject[],tasks:AffairsTask[]) {
 const grouped=new Map<string,AffairsTask[]>();for(const t of tasks){if(t.projectId) grouped.set(t.projectId,[...(grouped.get(t.projectId)??[]),t]);}
 const nodes=projects.map(project=>({project,tasks:grouped.get(project.id)??[]}));const ids=new Set(mainlines.map(m=>m.id));
 return {mainlines:mainlines.map(mainline=>({mainline,projects:nodes.filter(n=>n.project.mainlineId===mainline.id)})),independentProjects:nodes.filter(n=>!n.project.mainlineId||!ids.has(n.project.mainlineId))};
}
