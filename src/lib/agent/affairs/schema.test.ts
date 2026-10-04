// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {parseAffairsInterpretation} from './schema';
const item={type:'task',sourceText:'10月8日面试',name:'面试',description:null,outcome:null,dueDate:'2026-10-08',plannedTime:'10:30',yearInferred:true,isCore:false,coreReason:null,completionCriteria:null,parentId:null,parentIndex:null,existingId:null};
const result={message:'识别到行动',items:[item],unresolvedSegments:[]};
describe('affairs structured interpretation',()=>{
  it('retains future date and explicit clock time without inventing core eligibility',()=>expect(parseAffairsInterpretation(result).items[0]).toEqual(item));
  it.each([{...item,type:'complete'}, {...item,operation:'record_affairs_penalty'}, {...item,parentIndex:-1}, {...item,isCore:'true'}])('rejects unsafe item %j',v=>expect(()=>parseAffairsInterpretation({...result,items:[v]})).toThrow());
  it('rejects more than 20 items rather than truncating',()=>expect(()=>parseAffairsInterpretation({...result,items:Array(21).fill(item)})).toThrow());
});
