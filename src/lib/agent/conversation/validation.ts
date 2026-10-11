import {parseModelInterpretation} from '../schema';
import {moneyToCents} from '@/lib/finance/budget-validation';
import {reconciliationUuid} from '@/lib/finance/reconciliation-validation';
import {financeFields, type FieldChange, type FinanceTurnInput, type FinanceConversation} from './types';

export function invalidConversation():never {throw new Error('会话内容无效，请检查当前预览。');}
export function record(v:unknown):v is Record<string,unknown> {return typeof v==='object'&&v!==null&&!Array.isArray(v);}
export function exact(v:unknown,keys:readonly string[]):asserts v is Record<string,unknown> {if(!record(v)||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))invalidConversation();}
function string(v:unknown,max=1000):v is string {return typeof v==='string'&&[...v].length<=max;}
function uuid(v:unknown):boolean {return typeof v==='string'&&reconciliationUuid.test(v);}
function stringList(v:unknown,max:number,size=1000):v is string[] {return Array.isArray(v)&&v.length<=max&&v.every(s=>string(s,size));}
export function parseFieldChanges(v:unknown):FieldChange[] {
  if(!Array.isArray(v)||v.length>financeFields.length)invalidConversation();
  const seen=new Set<string>();
  for(const c of v){
    exact(c,['field','value','origin']);
    if(typeof c.field!=='string'||!financeFields.includes(c.field as typeof financeFields[number])||seen.has(c.field)||!['explicit','suggested','default'].includes(String(c.origin)))invalidConversation();
    seen.add(c.field);
    if(c.field==='amount') {if(c.value!==null&&(typeof c.value!=='number'||!Number.isFinite(c.value)||moneyToCents(String(c.value))===null||c.value<=0))invalidConversation();}
    else if(c.field==='excludeFromBudget'){if(typeof c.value!=='boolean')invalidConversation();}
    else if(c.field==='type'){if(!['expense','income','transfer'].includes(String(c.value)))invalidConversation();}
    else if(c.field==='purpose'){if(c.value!==null&&!['general','saving','investment','debt'].includes(String(c.value)))invalidConversation();}
    else if(c.field.endsWith('Id')){if(c.value!==null&&!uuid(c.value))invalidConversation();}
    else if(c.value!==null&&!string(c.value,c.field==='occurredAt'?32:1000))invalidConversation();
  }
  return v as FieldChange[];
}
const draftExtra=['draftId','requestId','rawText','status','issues','accountName','categoryName','budgetBucketName','fromAccountName','toAccountName'];
export function validateConversation(state:unknown):asserts state is FinanceConversation {
  exact(state,['ownerId','conversationId','batchId','revision','items','intentSeed','pendingQuestion','pendingTargetChanges','recentUserTexts','appliedTurnIds']);
  if(!uuid(state.ownerId)||!uuid(state.conversationId)||!uuid(state.batchId)||!Number.isSafeInteger(state.revision)||(state.revision as number)<0||!Array.isArray(state.items)||state.items.length>20)invalidConversation();
  const ids=new Set(),ordinals=new Set();
  for(const item of state.items){
    exact(item,['draft','ordinal','lifecycle','origins','timeAssumption','attempted','confirmation']);
    exact(item.draft,[...financeFields,'sourceText',...draftExtra]);
    const d=item.draft;
    if(!uuid(d.draftId)||(d.requestId!==null&&!uuid(d.requestId))||!string(d.rawText,4000)||!d.rawText.trim()||!['ready','needs_input'].includes(String(d.status))||!stringList(d.issues,20)||draftExtra.filter(k=>k.endsWith('Name')).some(k=>d[k]!==null&&!string(d[k])))invalidConversation();
    const model=Object.fromEntries([...financeFields,'sourceText'].map(k=>[k,d[k]]));
    parseModelInterpretation({message:'',transactions:[model],unresolvedSegments:[]});
    parseFieldChanges(financeFields.map(field=>({field,value:d[field],origin:'explicit'})));
    if(!Number.isSafeInteger(item.ordinal)||(item.ordinal as number)<1||(item.ordinal as number)>20||ids.has(d.draftId)||ordinals.has(item.ordinal)||!['editing','ready','saving','saved','uncertain','discarded'].includes(String(item.lifecycle))||typeof item.attempted!=='boolean'||![null,'recorded_now','date_only'].includes(item.timeAssumption as string|null)||!record(item.origins))invalidConversation();
    for(const [key,value] of Object.entries(item.origins))if(!financeFields.includes(key as typeof financeFields[number])||!['explicit','suggested','default'].includes(String(value)))invalidConversation();
    if(item.confirmation!==null){exact(item.confirmation,['status','entryId','message']);if(!['success','warning','error','uncertain'].includes(String(item.confirmation.status))||!string(item.confirmation.message)||(item.confirmation.entryId!==null&&!uuid(item.confirmation.entryId)))invalidConversation();}
    ids.add(d.draftId);ordinals.add(item.ordinal);
  }
  if(!stringList(state.recentUserTexts,6,4000)||(state.recentUserTexts as string[]).reduce((n,s)=>n+[...s].length,0)>6000||!stringList(state.appliedTurnIds,32,100)||!(state.appliedTurnIds as string[]).every(uuid))invalidConversation();
  if(state.intentSeed!==null){exact(state.intentSeed,['rawText','accountId']);if(!string(state.intentSeed.rawText,4000)||!uuid(state.intentSeed.accountId))invalidConversation();}
  if(state.pendingTargetChanges!==null)parseFieldChanges(state.pendingTargetChanges);
  if(state.pendingQuestion!==null){
    exact(state.pendingQuestion,['id','kind','field','targetIds','text','choices']);const q=state.pendingQuestion;
    if(!string(q.id,200)||!['field','target','direction'].includes(String(q.kind))||(q.field!==null&&!financeFields.includes(q.field as typeof financeFields[number]))||!stringList(q.targetIds,20,100)||!string(q.text,500)||!Array.isArray(q.choices)||q.choices.length>200)invalidConversation();
    for(const c of q.choices){exact(c,['id','label']);if(!string(c.id,200)||!string(c.label,200))invalidConversation();}
  }
}
export function parseFinanceTurnInput(value:unknown):FinanceTurnInput {
  const json=JSON.stringify(value);if(!json||[...json].length>40000)invalidConversation();
  exact(value,['ownerId','state','turnId','baseRevision','turn']);
  if(!uuid(value.ownerId)||!uuid(value.turnId)||!Number.isSafeInteger(value.baseRevision)||(value.baseRevision as number)<0)invalidConversation();
  if(value.state!==null){validateConversation(value.state);if(value.state.ownerId!==value.ownerId||value.state.revision!==value.baseRevision)invalidConversation();}else if(value.baseRevision!==0)invalidConversation();
  if(!record(value.turn))invalidConversation();
  switch(value.turn.kind){
    case 'text':exact(value.turn,['kind','rawText']);if(!string(value.turn.rawText,4000)||!value.turn.rawText.trim())invalidConversation();break;
    case 'selection':exact(value.turn,['kind','questionId','choiceId']);if(!string(value.turn.questionId,200)||!string(value.turn.choiceId,200))invalidConversation();break;
    case 'edit':exact(value.turn,['kind','draftId','changes']);if(!uuid(value.turn.draftId))invalidConversation();parseFieldChanges(value.turn.changes);break;
    case 'discard':exact(value.turn,['kind','draftId']);if(!uuid(value.turn.draftId))invalidConversation();break;
    default:invalidConversation();
  }
  return value as unknown as FinanceTurnInput;
}
