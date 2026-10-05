import type {ModelAffairsInterpretation,ModelAffairsItem} from './types';
const nullableText={type:['string','null'],maxLength:10000} as const;
const properties={
  type:{type:'string',enum:['mainline','project','task','capture']},sourceText:{type:'string',minLength:1,maxLength:4000},
  name:nullableText,description:nullableText,outcome:nullableText,dueDate:nullableText,plannedTime:nullableText,plannedStartDate:nullableText,
  yearInferred:{type:'boolean'},isCore:{type:'boolean'},coreReason:nullableText,completionCriteria:nullableText,
  parentId:nullableText,parentIndex:{anyOf:[{type:'integer',minimum:0,maximum:19},{type:'null'}]},existingId:nullableText,
};
export const affairsInterpretationJsonSchema={
  type:'object',additionalProperties:false,required:['message','items','unresolvedSegments'],
  properties:{message:{type:'string',maxLength:500},items:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,required:Object.keys(properties),properties}},
    unresolvedSegments:{type:'array',maxItems:20,items:{type:'string',minLength:1,maxLength:4000}}},
};
function record(v:unknown):v is Record<string,unknown>{return typeof v==='object'&&v!==null&&!Array.isArray(v);}
function text(v:unknown,max:number):v is string{return typeof v==='string'&&[...v].length<=max;}
export function parseAffairsInterpretation(v:unknown):ModelAffairsInterpretation {
  if(!record(v)||Object.keys(v).length!==3||!text(v.message,500)||!Array.isArray(v.items)||v.items.length>20||!Array.isArray(v.unresolvedSegments)||v.unresolvedSegments.length>20)throw new Error('invalid_affairs_response');
  if(v.unresolvedSegments.some(s=>!text(s,4000)||!s.trim()))throw new Error('invalid_affairs_response');
  const items=v.items.map((item:unknown)=>{
    if(!record(item)||Object.keys(properties).filter(k=>k!=='plannedStartDate').some(k=>!Object.hasOwn(item,k))||Object.keys(item).some(k=>!Object.hasOwn(properties,k))||!['mainline','project','task','capture'].includes(String(item.type))||!text(item.sourceText,4000)||!item.sourceText.trim())throw new Error('invalid_affairs_item');
    if(Object.hasOwn(item,'plannedStartDate')&&item.plannedStartDate!==null&&!text(item.plannedStartDate,10000))throw new Error('invalid_affairs_item');
    if(typeof item.yearInferred!=='boolean'||typeof item.isCore!=='boolean'||!(item.parentIndex===null||(Number.isInteger(item.parentIndex)&&Number(item.parentIndex)>=0&&Number(item.parentIndex)<20)))throw new Error('invalid_affairs_item');
    for(const key of ['name','description','outcome','dueDate','plannedTime','coreReason','completionCriteria','parentId','existingId'])if(item[key]!==null&&!text(item[key],10000))throw new Error('invalid_affairs_item');
    return item as unknown as ModelAffairsItem;
  });
  return {message:v.message,items,unresolvedSegments:v.unresolvedSegments as string[]};
}
