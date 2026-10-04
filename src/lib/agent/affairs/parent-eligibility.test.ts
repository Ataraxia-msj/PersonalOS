// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {getAgentProjectParentEligibility} from '@/lib/affairs/service';
import type {AffairsQueryClient} from '@/lib/affairs/queries';
import {ids} from './test-fixtures';
function client(results:unknown[]){const q={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn()};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);results.forEach(result=>q.maybeSingle.mockResolvedValueOnce(result));return {from:vi.fn(()=>q)};}
it('checks owner-visible request first and never rejects a recorded replay for parent state',async()=>{
 const c=client([{data:{request_id:ids.project},error:null}]);
 expect(await getAgentProjectParentEligibility(c as unknown as AffairsQueryClient,ids.project,ids.mainline)).toBe('replay');expect(c.from).toHaveBeenCalledTimes(1);expect(c.from).toHaveBeenCalledWith('affairs_commands');
});
it.each(['archived',null,'active','paused'])('only permits new project under currently usable mainline %s',async status=>{
 const c=client([{data:null,error:null},{data:status?{status}:null,error:null}]);
 expect(await getAgentProjectParentEligibility(c as unknown as AffairsQueryClient,ids.project,ids.mainline)).toBe(status==='active'||status==='paused'?'eligible':'invalid');
 expect(c.from).toHaveBeenCalledWith('affairs_mainlines');
});
