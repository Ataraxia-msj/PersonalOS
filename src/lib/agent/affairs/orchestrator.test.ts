// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {interpretAffairsMessage} from './orchestrator';
import {options,model,ids} from './test-fixtures';
import type {AffairsQueryClient} from '@/lib/affairs/queries';
it('previews two appointments and four mainlines without writes or invented projects',async()=>{
 const raw='10月8日早上10点半星璇智能面试；10月18日下午1点国安双选会；核心做的事情是搭建系统、准备国考、找工作、写大论文';
 const rpc=vi.fn(),interpret=vi.fn().mockResolvedValue({message:'请确认',unresolvedSegments:[],items:[
  model({name:'星璇智能面试',sourceText:'10月8日早上10点半星璇智能面试',dueDate:'2026-10-08',plannedTime:'10:30',yearInferred:true}),
  model({name:'国安双选会',sourceText:'10月18日下午1点国安双选会',dueDate:'2026-10-18',plannedTime:'13:00',yearInferred:true}),
  ...['搭建系统','准备国考','找工作','写大论文'].map(name=>model({type:'mainline',sourceText:name,name,existingId:name==='搭建系统'?ids.mainline:null}))]});
 const result=await interpretAffairsMessage(raw,{rpc} as unknown as AffairsQueryClient,new Date(options.serverNowISO),{loadOptions:async()=>options,interpret,duplicates:async()=>[],uuid:randomUUID});
 expect(result.items.map(i=>i.type)).toEqual(['task','task','mainline','mainline','mainline','mainline']);
 expect(result.items[0].plannedTime).toBe('10:30');expect(result.items[1].plannedTime).toBe('13:00');
 expect(result.items[2].matchConfirmed).toBe(false);expect(result.items.every(i=>!i.isCore)).toBe(true);
 expect(rpc).not.toHaveBeenCalled();expect(interpret.mock.calls[0][0]).not.toHaveProperty('tasks');
});
it('rejects invalid input and model reference indexes rather than silently dropping items',async()=>{
 const deps={loadOptions:async()=>options,interpret:async()=>({message:'',unresolvedSegments:[],items:[model({parentIndex:99})]}),duplicates:async()=>[],uuid:randomUUID};
 await expect(interpretAffairsMessage('面试',{} as AffairsQueryClient,new Date(),deps)).rejects.toThrow();
 await expect(interpretAffairsMessage('字'.repeat(4001),{} as AffairsQueryClient,new Date(),deps)).rejects.toThrow();
});
