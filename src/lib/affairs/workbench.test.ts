import {expect,it} from 'vitest';
import {summarizeWorkbench,buildAffairsOutline} from './workbench';
import type {AffairsTask,AffairsProject,AffairsMainline} from '@/features/affairs/types';
it('uses all unfinished tasks, active projects, Shanghai completion window and genuine balance',()=>{
 const tasks=[{id:'a',status:'todo'},{id:'b',status:'waiting'},{id:'c',status:'in_progress'},{id:'d',status:'todo'}, {id:'e',status:'done',completedAt:'2026-09-27T16:00:00Z'},{id:'f',status:'done',completedAt:'2026-10-04T00:00:00Z'},{id:'g',status:'done',completedAt:'2026-09-27T15:59:59Z'},{id:'h',status:'todo',completedAt:'2026-10-03T00:00:00Z'},{id:'i',status:'done',completedAt:'2026-10-04T12:00:00Z'}] as AffairsTask[];
 expect(summarizeWorkbench(tasks,[{status:'active'},{status:'paused'},{status:'completed'}] as AffairsProject[],-1,'2026-10-04T01:00:00Z')).toEqual({pendingTaskCount:5,activeProjectCount:1,completedLastSevenDays:2,balance:-1});
});
it('includes non-focused projects and independent projects with all their actions',()=>{
 const ml=[{id:'m',focusProjectId:'p1'}] as AffairsMainline[];const pr=[{id:'p1',mainlineId:'m'},{id:'p2',mainlineId:'m'},{id:'p3',mainlineId:null}] as AffairsProject[];const ta=[{id:'t',projectId:'p2'}] as AffairsTask[];
 const result=buildAffairsOutline(ml,pr,ta);expect(result.mainlines[0].projects).toHaveLength(2);expect(result.mainlines[0].projects[1].tasks[0].id).toBe('t');expect(result.independentProjects[0].project.id).toBe('p3');
});
