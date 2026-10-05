import {executeFoundationCommand} from '@/lib/affairs/foundation-mutations';
import {executeInboxCommand} from '@/lib/affairs/inbox-mutations';
import {AffairsDatabaseError} from '@/lib/affairs/mutation-result';
import type {AffairsQueryClient} from '@/lib/affairs/queries';
import {getAgentAffairsOptions,getAgentProjectParentEligibility} from '@/lib/affairs/service';
import {validateAffairsCommand} from '@/lib/affairs/validation';
import type {FoundationCommand,AffairsReceipt} from '@/lib/affairs/types';
import {uuidPattern} from './preview';
import type {AffairsAgentOptions,AffairsConfirmation,AffairsConfirmationResult} from './types';

const fail=(message:string,status:'error'|'uncertain'='error'):AffairsConfirmationResult=>({status,message,receipt:null,objectId:null,reused:false});
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value:Record<string,unknown>,expected:string[])=>Object.keys(value).length===expected.length&&expected.every(k=>Object.hasOwn(value,k));
const fields:Record<string,string[]>={mainline:['name','description','sort_order'],project:['name','outcome','description','mainline_id','due_date'],task:['title','description','project_id','due_date','is_core','core_reason','completion_criteria'],capture:['content']};

// Creates deliberately reach the existing RPC before rechecking parent state:
// the owner-scoped RPC replays a committed request before checking new references.
export async function confirmAgentAffairs(client:AffairsQueryClient,input:AffairsConfirmation,loadOptions:(client:AffairsQueryClient)=>Promise<AffairsAgentOptions>=getAgentAffairsOptions,checkProjectParent:typeof getAgentProjectParentEligibility=getAgentProjectParentEligibility):Promise<AffairsConfirmationResult>{
 if(!object(input)||typeof input.kind!=='string'||typeof input.requestId!=='string'||!uuidPattern.test(input.requestId))return fail('提交内容或标识无效，请检查预览。');
 if(input.kind==='reuse_mainline'||input.kind==='reuse_project'){
  if(!keys(input,['kind','requestId','objectId'])||typeof input.objectId!=='string'||!uuidPattern.test(input.objectId))return fail('复用标识无效。');
  try{
   const options=await loadOptions(client);
   const found=(input.kind==='reuse_mainline'?options.mainlines:options.projects).find(x=>x.id===input.objectId);
   if(!found||found.status==='archived'||found.status==='completed')return fail('复用目标不可用，请重新选择。');
   return {status:'success',message:`已复用「${found.name}」，未修改旧记录。`,receipt:null,objectId:found.id,reused:true};
  }catch{return fail('暂时无法核对复用目标，请稍后重试。');}
 }
 if(!('payload' in input))return fail('缺少创建内容。');
 const allowed=Object.hasOwn(fields,input.kind)?fields[input.kind]:null;
 if(!allowed||!keys(input,['kind','requestId','payload'])||!object(input.payload))return fail('不支持的创建类型或字段。');
 const optional=input.kind==='task'||input.kind==='project'?['planned_start_date','planned_time']:[];
 if(!allowed.every(k=>Object.hasOwn(input.payload,k))||Object.keys(input.payload).some(k=>!allowed.includes(k)&&!optional.includes(k)))return fail('不支持的创建类型或字段。');
 for(const [key,value] of Object.entries(input.payload)){
  if(key==='is_core'){if(typeof value!=='boolean')return fail('核心资格格式无效。');}
  else if(key==='sort_order'){if(typeof value!=='number'||!Number.isInteger(value))return fail('排序格式无效。');}
  else if(value!==null&&typeof value!=='string')return fail('字段格式无效。');
 }
 const data=new FormData();
 data.set('operation',input.kind==='capture'?'create_affairs_inbox_entry':`create_affairs_${input.kind}`);
 data.set('requestId',input.requestId);
 for(const [key,value] of Object.entries(input.payload))data.set(key,value===null?'':String(value));
 const parsed=validateAffairsCommand(data,new Date());
 if(!parsed.input)return fail(Object.values(parsed.errors).join('；'));
 if(input.kind==='project'&&input.payload.mainline_id){
  try{if(await checkProjectParent(client,input.requestId,input.payload.mainline_id)==='invalid')return fail('所属主线不存在或已归档，请重新选择；当前项没有保存。');}
  catch{return fail('暂时无法核对所属主线，请使用原请求重试。');}
 }
 try{
  const receipt=(parsed.input.operation==='create_affairs_inbox_entry'?await executeInboxCommand(client,parsed.input):await executeFoundationCommand(client,parsed.input as FoundationCommand)) as AffairsReceipt;
  return {status:'success',message:receipt.replayed?'已核对：原提交已保存，未重复创建。':'已保存到事务。',receipt,objectId:receipt.objectId,reused:false};
 }catch(error){
  if(error instanceof AffairsDatabaseError)return fail('数据库未接受本次提交。请检查归属及内容；当前项没有保存。');
  return fail('尚未确认保存结果。请保留此预览，使用原请求重试核对；不要重新发送。','uncertain');
 }
}
