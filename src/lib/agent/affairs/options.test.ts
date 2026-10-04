// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {getAgentAffairsOptions,getAgentTaskDuplicates} from '@/lib/affairs/service';
import type {AffairsQueryClient} from '@/lib/affairs/queries';
describe('minimal real affairs options',()=>{
  it('starts only mainline and project reads in parallel',async()=>{
    const started:string[]=[];const pending:Array<(value:unknown)=>void>=[];
    const from=(table:string)=>{started.push(table);const value=new Promise(resolve=>pending.push(resolve));const chain={select:()=>chain,order:()=>chain,range:()=>value};return chain;};
    const result=getAgentAffairsOptions({from} as unknown as AffairsQueryClient,new Date('2026-10-04T00:00:00Z'));
    await Promise.resolve();expect(started).toEqual(['affairs_mainlines','vw_affairs_project_progress']);
    pending.forEach(resolve=>resolve({data:[],error:null}));
    expect(await result).toEqual({mainlines:[],projects:[],serverNowISO:'2026-10-04T00:00:00.000Z'});
  });
  it('reads only exact duplicate titles, not full task descriptions',async()=>{
    const select=vi.fn();const include=vi.fn();const chain={select:(v:string)=>{select(v);return chain;},in:(...v:unknown[])=>{include(...v);return chain;},order:()=>chain,range:async()=>({data:[{id:'task-id',title:'面试',status:'todo',project_id:null}],error:null})};
    const client={from:vi.fn(()=>chain)};
    expect(await getAgentTaskDuplicates(client as unknown as AffairsQueryClient,['面试'])).toEqual([{id:'task-id',title:'面试',status:'todo',projectId:null}]);
    expect(select).toHaveBeenCalledWith('id,title,status,project_id');expect(include).toHaveBeenCalledWith('title',['面试']);
    expect(client.from).toHaveBeenCalledWith('affairs_tasks');
  });
  it('rejects over 20 titles before any database access',async()=>{
    const client={from:vi.fn()};await expect(getAgentTaskDuplicates(client as unknown as AffairsQueryClient,Array.from({length:21},(_,i)=>String(i)))).rejects.toThrow();expect(client.from).not.toHaveBeenCalled();
  });
});
