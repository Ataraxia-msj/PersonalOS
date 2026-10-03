import {describe,it,expect,vi} from 'vitest';
import {createAffairsServices} from './service';
import type {AffairsQueryClient} from './queries';
describe('affairs parallel service',()=>{
 it('creates one client and starts independent reads before resolving any',async()=>{
 const started:string[]=[];const resolves:Array<(v:{data:unknown;error:null})=>void>=[];
 const from=(name:string)=>{started.push(name);const result=new Promise<{data:unknown;error:null}>(resolve=>resolves.push(resolve));const chain={select:()=>chain,order:()=>chain,gte:()=>chain,lte:()=>chain,range:()=>result,maybeSingle:()=>result,then:result.then.bind(result)};return chain;};
 const factory=vi.fn(async()=>({from} as unknown as AffairsQueryClient));const pending=createAffairsServices(factory).getAffairsDashboardData(new Date('2026-10-03T00:00Z'));
 await Promise.resolve();expect(started).toHaveLength(6);expect(new Set(started).size).toBe(6);resolves.forEach((r,i)=>r({data:started[i]==='vw_affairs_coin_balance'?null:[],error:null}));
 expect((await pending).balance).toBe(0);expect(factory).toHaveBeenCalledTimes(1);
 });
});
