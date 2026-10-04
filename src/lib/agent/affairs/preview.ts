import {validDate} from '@/lib/affairs/validation';
import type {AffairsAgentOptions,AffairsDraft,AffairsConfirmation} from './types';

export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalized=(text:string)=>text.replace(/\s/g,'');
const length=(text:string|null)=>[...(text?.trim()??'')].length;
export function validateAffairsDrafts(input:AffairsDraft[], options:AffairsAgentOptions):{items:AffairsDraft[];order:string[]} {
 const items=input.map(item=>({...item,issues:[] as string[]}));
 const byId=new Map(items.map(i=>[i.draftId,i]));
 const issue=(item:AffairsDraft,text:string)=>item.issues.push(text);
 for(const item of items){
  if(item.mode==='skip') continue;
  if(!uuidPattern.test(item.requestId)||!uuidPattern.test(item.draftId)) issue(item,'提交标识无效');
  if(!item.sourceText.trim()||!normalized(item.rawText).includes(normalized(item.sourceText))) issue(item,'原文片段无法对应输入');
  if(item.mode==='reuse'){
   const candidates=item.type==='mainline'?options.mainlines:item.type==='project'?options.projects:[];
   const existing=candidates.find(x=>x.id===item.reuseId);
   if(!existing||existing.status==='archived'||existing.status==='completed') issue(item,'复用目标不可用，请重新选择');
   if(!item.matchConfirmed) issue(item,'请确认复用已有记录');
   continue;
  }
  if(item.type==='capture'){
   if(length(item.description??item.sourceText)<1||length(item.description??item.sourceText)>4000) issue(item,'收集内容需要 1–4000 字');
  }else if(length(item.name)<1||length(item.name)>200) issue(item,'名称需要 1–200 字');
  if(length(item.description)>10000) issue(item,'说明不能超过 10000 字');
  if(item.type==='project'&&(length(item.outcome)<1||length(item.outcome)>2000)) issue(item,'请填写项目成果（1–2000 字）');
  if(item.dueDate&&!validDate(item.dueDate)) issue(item,'计划日期无效');
  if(item.plannedTime&&(!item.dueDate||!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.plannedTime))) issue(item,'计划时间需要有效日期和 HH:mm');
  if(item.dueDate&&item.yearInferred&&!item.dateConfirmed) issue(item,'请确认推断的年份');
  if(item.type==='task'&&item.isCore&&(length(item.coreReason)<1||length(item.coreReason)>2000||length(item.completionCriteria)<1||length(item.completionCriteria)>2000)) issue(item,'核心行动需要目标及完成条件（各 1–2000 字）');
  if(item.parentId&&item.parentDraftId) issue(item,'父级引用冲突');
  const expected=item.type==='project'?'mainline':item.type==='task'?'project':null;
  if(item.parentDraftId){
   const parent=byId.get(item.parentDraftId);
   if(!parent||parent.mode==='skip'||parent.type!==expected) issue(item,'父级卡片不可用，请重新选择归属');
  }
  if(item.parentId){
   const parent=(expected==='mainline'?options.mainlines:expected==='project'?options.projects:[]).find(x=>x.id===item.parentId);
   if(!parent||parent.status==='archived'||parent.status==='completed') issue(item,'父级目标不可用，请重新选择归属');
  }
 }
 const visited=new Set<string>(),visiting=new Set<string>(),order:string[]=[];
 let cycle=false;
 function visit(item:AffairsDraft){
  if(visited.has(item.draftId)||item.mode==='skip')return;
  if(visiting.has(item.draftId)){cycle=true;return;}
  visiting.add(item.draftId);
  const parent=item.parentDraftId?byId.get(item.parentDraftId):null;
  if(parent)visit(parent);
  visiting.delete(item.draftId);visited.add(item.draftId);order.push(item.draftId);
 }
 items.forEach(visit);
 if(byId.size!==items.length||items.length>20){cycle=true;items.forEach(i=>issue(i,'卡片标识重复或超过 20 项'));}
 if(cycle)items.filter(i=>i.mode!=='skip').forEach(i=>issue(i,'父级依赖存在循环'));
 return {items,order:cycle?[]:order};
}

export function toAffairsConfirmation(draft:AffairsDraft,resolvedParentId:string|null):AffairsConfirmation {
 if(draft.mode==='skip')throw new Error('skipped_item');
 if(draft.mode==='reuse'){
  if(!draft.reuseId||(draft.type!=='mainline'&&draft.type!=='project'))throw new Error('invalid_reuse');
  return {kind:draft.type==='mainline'?'reuse_mainline':'reuse_project',requestId:draft.requestId,objectId:draft.reuseId};
 }
 const parent=draft.parentDraftId?resolvedParentId:draft.parentId;
 if(draft.parentDraftId&&!parent)throw new Error('unresolved_parent');
 const description=[draft.description?.trim(),`原文：${draft.sourceText}`,draft.plannedTime&&draft.dueDate?`计划时间：${draft.dueDate} ${draft.plannedTime}（Asia/Shanghai）`:null].filter(Boolean).join('\n');
 if([...description].length>10000)throw new Error('description_too_long');
 switch(draft.type){
  case 'mainline':return {kind:'mainline',requestId:draft.requestId,payload:{name:draft.name?.trim()??'',description,sort_order:0}};
  case 'project':return {kind:'project',requestId:draft.requestId,payload:{name:draft.name?.trim()??'',description,outcome:draft.outcome?.trim()??'',mainline_id:parent,due_date:draft.dueDate}};
  case 'task':return {kind:'task',requestId:draft.requestId,payload:{title:draft.name?.trim()??'',description,project_id:parent,due_date:draft.dueDate,is_core:draft.isCore,core_reason:draft.isCore?draft.coreReason?.trim()??null:null,completion_criteria:draft.isCore?draft.completionCriteria?.trim()??null:null}};
  case 'capture':return {kind:'capture',requestId:draft.requestId,payload:{content:(draft.description??draft.sourceText).trim()}};
 }
}
