import {expect,it,vi} from 'vitest';
import {createAffairsServices} from './service';
import type {AffairsQueryClient} from './queries';
it('loads all inbox resources in parallel with one client',async()=>{
 const started:string[]=[];const releases:Array<()=>void>=[];
 const factory=vi.fn(async()=>({from:(name:string)=>{
  started.push(name);const wait=new Promise<void>(resolve=>releases.push(resolve));
  const chain={select:()=>chain,order:()=>chain,eq:()=>chain,range:async()=>{await wait;return {data:[],error:null};}};return chain;
 }} as unknown as AffairsQueryClient));
 const promise=createAffairsServices(factory).getAffairsInboxData();await Promise.resolve();
 expect(started).toHaveLength(4);expect(new Set(started)).toEqual(new Set(['affairs_inbox_entries','affairs_mainlines','vw_affairs_project_progress','affairs_tasks']));releases.forEach(r=>r());expect((await promise).entries).toEqual([]);expect(factory).toHaveBeenCalledTimes(1);
});
it('contains navigation count failure without breaking existing services',async()=>{
 const chain={select:()=>chain,eq:()=>Promise.resolve({count:null,error:{message:'missing table',code:'42P01'}})};
 const factory=async()=>({from:()=>chain} as unknown as AffairsQueryClient);
 expect(await createAffairsServices(factory).getAffairsNavigationData()).toEqual({pendingCount:null,unavailable:true});
});
