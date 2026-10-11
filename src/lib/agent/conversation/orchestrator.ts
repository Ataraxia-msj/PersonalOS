import type {AgentFinanceOptions} from '../types';
import {parseModelFinanceTurn} from '../schema';
import {interpretFinanceTurn} from '../qwen';
import {applyFinanceChanges,createFinanceConversation,editable,protectedConversation} from './state';
import {normalizeConversationItem} from './drafts';
import {buildFinanceQuestion,resolveFinanceSelection} from './questions';
import {boundedTexts,buildFinanceModelContext} from './model-context';
import {invalidConversation,parseFinanceTurnInput} from './validation';
import type {FieldChange,FinanceConversation,FinanceTurnInput,ModelFinanceTurn} from './types';

const empty=():ModelFinanceTurn=>({kind:'patch',updates:[],additions:[],ambiguity:null,routeDomain:null,unresolvedSegments:[]});
function assertCandidates(changes:FieldChange[],options:AgentFinanceOptions){
 for(const c of changes){if(c.value===null||!c.field.endsWith('Id'))continue;
  const candidates=c.field==='categoryId'?[...options.expenseCategories,...options.incomeCategories]:c.field==='budgetBucketId'?options.budgetBuckets:options.accounts;
  if(!candidates.some(x=>x.id===c.value))invalidConversation();
 }
}
function sanitizeOrigins(result:ModelFinanceTurn,rawText:string,options:AgentFinanceOptions):ModelFinanceTurn {
 const next=structuredClone(result);
 for(const update of next.updates)for(const c of update.changes){
  c.origin=c.field==='categoryId'&&!([...options.expenseCategories,...options.incomeCategories].find(x=>x.id===c.value)?.name&&rawText.includes([...options.expenseCategories,...options.incomeCategories].find(x=>x.id===c.value)!.name))?'suggested':'explicit';
 }
 if(next.ambiguity)for(const c of next.ambiguity.proposedChanges)c.origin=c.field==='categoryId'?'suggested':'explicit';
 return next;
}
function deterministicText(state:FinanceConversation,rawText:string,options:AgentFinanceOptions):ModelFinanceTurn|null {
 const text=rawText.trim(),q=state.pendingQuestion;
 const choice=q?.choices.filter(c=>c.label===text);
 if(q&&choice?.length===1)return resolveFinanceSelection(state,{kind:'selection',questionId:q.id,choiceId:choice[0].id},options);
 const all=options.accounts.filter(a=>new RegExp(`^都是${a.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:付的|支付|付款)?[。！!]*$`).test(text));
 if(all.length===1){const result=empty();result.updates=state.items.filter(i=>editable(i)&&i.draft.type==='expense').map(i=>({draftId:i.draft.draftId,changes:[{field:'accountId',value:all[0].id,origin:'explicit'}]}));if(result.updates.length)return result;}
 const ordinal=text.match(/^第([一二三四五六七八九十]|\d+)笔(?:不计预算|不计入预算)[。！!]*$/);
 if(ordinal){const n=Number(ordinal[1])||'一二三四五六七八九十'.indexOf(ordinal[1])+1;const item=state.items.find(i=>i.ordinal===n&&editable(i)&&i.draft.type==='expense');if(!item)invalidConversation();return {...empty(),updates:[{draftId:item.draft.draftId,changes:[{field:'excludeFromBudget',value:true,origin:'explicit'}]}]};}
 return null;
}

export async function handleFinanceTurn(input:FinanceTurnInput,options:AgentFinanceOptions,dependencies:{now:Date;uuid:()=>string;interpret:typeof interpretFinanceTurn}) {
 parseFinanceTurnInput(input);
 let state=input.state?structuredClone(input.state):createFinanceConversation(input.ownerId,dependencies.uuid);
 if(state.appliedTurnIds.includes(input.turnId))return {state,message:state.pendingQuestion?.text??'请核对当前预览。',routeDomain:null};
 if(protectedConversation(state))invalidConversation();
 const rawText=input.turn.kind==='text'?input.turn.rawText.trim():'';
 // A completed batch can start again, without sending completed facts to the model.
 if(input.turn.kind==='text'&&state.items.length&&!state.items.some(editable)&&!state.intentSeed)state=createFinanceConversation(input.ownerId,dependencies.uuid);
 state.items=state.items.map(i=>normalizeConversationItem(i,options,dependencies.now,dependencies.uuid));
 let result:ModelFinanceTurn;
 if(input.turn.kind==='selection')result=resolveFinanceSelection(state,input.turn,options);
 else if(input.turn.kind==='edit')result={...empty(),updates:[{draftId:input.turn.draftId,changes:input.turn.changes.map(c=>({...c,origin:'explicit'}))}]};
 else if(input.turn.kind==='discard'){
  const draftId=input.turn.draftId;
  const item=state.items.find(i=>i.draft.draftId===draftId);if(!item||!editable(item))invalidConversation();item.lifecycle='discarded';result=empty();
 }else{
  const accounts=options.accounts.filter(a=>a.name===rawText);
  if(!state.items.some(editable)&&accounts.length===1){
   state.intentSeed={rawText,accountId:accounts[0].id};result=empty();
  }else result=deterministicText(state,rawText,options)??sanitizeOrigins(parseModelFinanceTurn(await dependencies.interpret(buildFinanceModelContext(input,state,options,dependencies.now))),rawText,options);
 }
 parseModelFinanceTurn(result);
 if(result.kind==='route')return {state:input.state??state,message:result.routeDomain==='mixed'?'请把财务和事务分开发送；当前草稿保留。':'这条信息将交给相应入口，财务草稿保留。',routeDomain:result.routeDomain};
 for(const u of result.updates)assertCandidates(u.changes,options);
 if(result.ambiguity)assertCandidates(result.ambiguity.proposedChanges,options);
 for(const d of result.additions){
  assertCandidates(['accountId','categoryId','budgetBucketId','fromAccountId','toAccountId'].map(field=>({field:field as FieldChange['field'],value:d[field as keyof typeof d],origin:'explicit'})),options);
  if(rawText&&!rawText.includes(d.sourceText))invalidConversation();
 }
 // Never append a transaction for a bare answer to a candidate question.
 if(result.additions.length&&state.pendingQuestion?.choices.some(c=>c.label===rawText)&&input.turn.kind==='text')invalidConversation();
 const previousIds=new Set(state.items.map(i=>i.draft.draftId));
 state=applyFinanceChanges(state,input.turnId,result,dependencies.uuid);
 if(result.additions.length){state.intentSeed=null;for(const item of state.items)if(!previousIds.has(item.draft.draftId)&&rawText)item.draft.rawText=rawText;}
 state.items=state.items.map(i=>normalizeConversationItem(i,options,dependencies.now,dependencies.uuid));
 state.pendingQuestion=buildFinanceQuestion(state,options,result.ambiguity);
 if(rawText)state.recentUserTexts=boundedTexts([...state.recentUserTexts,rawText]);
 const unresolved=result.unresolvedSegments.length?' 有部分内容尚未识别，请补充或另发。':'';
 return {state,message:(state.pendingQuestion?.text??(state.items.some(editable)?'预览已更新，请核对后逐笔确认。':'没有新增记录，请提供交易事实。'))+unresolved,routeDomain:null};
}
