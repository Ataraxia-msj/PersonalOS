import {expect,it,vi} from 'vitest';
import {getAffairsInboxEntries,getAffairsInboxPendingCount,getAffairsResourceInboxSource} from './inbox-queries';
import type {AffairsQueryClient} from './queries';
function client(count:number|null=3,error:unknown=null) {
 const calls:unknown[][]=[];const chain={select:(...x:unknown[])=>{calls.push(['select',...x]);return chain;},eq:(...x:unknown[])=>{calls.push(['eq',...x]);return chain;},order:(...x:unknown[])=>{calls.push(['order',...x]);return chain;},limit:()=>chain,maybeSingle:async()=>({data:null,error}),range:vi.fn(async(start:number)=>({data:start===0?Array(500).fill({id:'i'}):[{id:'last'}],error})),then:(resolve:(r:unknown)=>unknown)=>Promise.resolve({count,error}).then(resolve)};
 const from=vi.fn(()=>chain);return {c:{from} as unknown as AffairsQueryClient,chain,calls,from};
}
it('reads the entire status-filtered list in deterministic 500-row pages',async()=>{
 const x=client();expect(await getAffairsInboxEntries(x.c,'pending')).toHaveLength(501);
 expect(x.from).toHaveBeenCalledWith('affairs_inbox_entries');expect(x.calls).toContainEqual(['eq','status','pending']);expect(x.calls).toContainEqual(['order','id']);expect(x.chain.range).toHaveBeenLastCalledWith(500,999);
});
it('uses exact HEAD pending count and never fakes null/error as zero',async()=>{
 const x=client(3);expect(await getAffairsInboxPendingCount(x.c)).toBe(3);expect(x.calls).toContainEqual(['select','id',{count:'exact',head:true}]);
 await expect(getAffairsInboxPendingCount(client(null).c)).rejects.toThrow();await expect(getAffairsInboxPendingCount(client(null,{message:'missing table',code:'42P01'}).c)).rejects.toThrow('42P01');
});
it('does not touch the new table for an existing object with no inbox source',async()=>{
 const x=client();expect(await getAffairsResourceInboxSource(x.c,'task','a0000000-0000-0000-0000-000000000001')).toBeNull();expect(x.from).toHaveBeenCalledTimes(1);expect(x.from).toHaveBeenCalledWith('affairs_commands');
});
