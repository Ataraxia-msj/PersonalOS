import type {AgentFinanceOptions} from '../types';
import {parseModelFinanceTurn} from '../schema';
import {interpretFinanceTurn} from '../qwen';
import {applyFinanceChanges,createFinanceConversation,editable,protectedConversation} from './state';
import {normalizeConversationItem} from './drafts';
import {buildFinanceQuestion,resolveFinanceSelection,StaleFinanceChoice} from './questions';
import {boundedTexts,buildFinanceModelContext} from './model-context';
import {invalidConversation,parseFinanceTurnInput} from './validation';
import type {FieldChange,FinanceConversation,FinanceTurnInput,ModelFinanceTurn} from './types';

const empty=():ModelFinanceTurn=>({kind:'patch',updates:[],additions:[],ambiguity:null,routeDomain:null,unresolvedSegments:[]});
const ordinalPattern=/第([一二三四五六七八九十两]+|\d+)\s*笔/;
function ordinalValue(text:string){
 const digits:Record<string,number>={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
 if(/^\d+$/.test(text))return Number(text);
 if(text.includes('十')){const [tens,units]=text.split('十');return (digits[tens]??1)*10+(digits[units]??0);}
 return digits[text];
}
function targetEvidence(text:string,ordinal:number){
 if(!ordinalPattern.test(text))return text;
 return text.split(/(?=第(?:[一二三四五六七八九十两]+|\d+)\s*笔)/).filter(part=>{const match=part.match(ordinalPattern);return match&&ordinalValue(match[1])===ordinal;}).join(' ');
}
function assertCandidates(changes:FieldChange[],options:AgentFinanceOptions){
 for(const c of changes){if(c.value===null||!c.field.endsWith('Id'))continue;
  const candidates=c.field==='categoryId'?[...options.expenseCategories,...options.incomeCategories]:c.field==='budgetBucketId'?options.budgetBuckets:options.accounts;
  if(!candidates.some(x=>x.id===c.value))invalidConversation();
 }
}
function sanitizeOrigins(result:ModelFinanceTurn,rawText:string,options:AgentFinanceOptions,state:FinanceConversation):ModelFinanceTurn {
 const next=structuredClone(result);
 for(const update of next.updates)assertCandidates(update.changes,options);
 if(next.ambiguity)assertCandidates(next.ambiguity.proposedChanges,options);
 const accountFields=['accountId','fromAccountId','toAccountId'] as const;
 const updateText=next.additions.reduce((text,addition)=>text.replaceAll(addition.sourceText,''),rawText);
 const accountWasNamed=(value:unknown,text:string)=>options.accounts.some(account=>account.id===value&&text.includes(account.name));
 const dateWasSpecified=(text:string)=>/今天|昨天|前天|今早|昨晚|昨早|今[晚晨]|(?:上|本|下)周|周[一二三四五六日天]|星期|早上|上午|中午|下午|晚上|凌晨|\d+\s*[年月日号点时]|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/]\d{1,2}|\d{1,2}[:：]\d{2}|默认.*时间|时间.*默认/.test(text);
 const budgetWasRequested=(value:unknown,text:string)=>value===null?/预算.*(?:默认|自动)|(?:默认|自动).*预算/.test(text):options.budgetBuckets.some(b=>b.id===value&&text.includes(b.name));
 const exclusionWasRequested=(value:unknown,text:string)=>value===true?/不计(?:入)?预算|不占(?:用)?预算/.test(text)&&!/取消|恢复/.test(text):/取消.*不计|恢复.*预算/.test(text)||/计入预算/.test(text)&&!/不计(?:入)?预算/.test(text);
 const sanitize=(changes:FieldChange[],text:string)=>changes.filter(c=>text.trim()&&(accountFields.includes(c.field as typeof accountFields[number])?(c.value===null?/账户|付款|收款|转出|转入/.test(text):accountWasNamed(c.value,text)):c.field==='occurredAt'?dateWasSpecified(text):c.field==='budgetBucketId'?budgetWasRequested(c.value,text):c.field==='excludeFromBudget'?exclusionWasRequested(c.value,text):true)).map(c=>{
  const category=[...options.expenseCategories,...options.incomeCategories].find(x=>x.id===c.value);
  return {...c,origin:c.field==='categoryId'&&!(category&&text.includes(category.name))?'suggested' as const:'explicit' as const};
 });
 next.updates=next.updates.map(u=>{const item=state.items.find(i=>i.draft.draftId===u.draftId);return {...u,changes:sanitize(u.changes,item?targetEvidence(updateText,item.ordinal):updateText)};}).filter(u=>u.changes.length);
 if(next.ambiguity)next.ambiguity.proposedChanges=sanitize(next.ambiguity.proposedChanges,updateText);
 // Application owns defaults; model guesses must not become explicit user budget choices.
 for(const addition of next.additions){
  assertCandidates(['accountId','categoryId','budgetBucketId','fromAccountId','toAccountId'].map(field=>({field:field as FieldChange['field'],value:addition[field as keyof typeof addition],origin:'explicit'})),options);
  const source=addition.sourceText.split(/[，,；;。]/).filter(part=>!ordinalPattern.test(part)).join(' ');
  const shared=!next.updates.length&&!ordinalPattern.test(rawText);
  for(const field of accountFields){
   const named=accountWasNamed(addition[field],source)||!state.items.length&&next.additions.length===1&&accountWasNamed(addition[field],rawText)||shared&&/都|全部|全是|均/.test(rawText)&&accountWasNamed(addition[field],rawText);
   if(!named&&addition[field]!==state.intentSeed?.accountId)addition[field]=null;
  }
  const sharedDate=shared&&/^(?:记一下|帮我记|记录)?(?:今天|昨天|前天|今早|昨晚|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d+月\d+[日号])/.test(rawText);
  if(!dateWasSpecified(source)&&!sharedDate)addition.occurredAt=null;
  if(!budgetWasRequested(addition.budgetBucketId,addition.sourceText))addition.budgetBucketId=null;
  if(!exclusionWasRequested(addition.excludeFromBudget,addition.sourceText))addition.excludeFromBudget=false;
 }
 const targets=state.items.filter(editable);
 const focused=state.pendingQuestion?.kind==='field'&&state.pendingQuestion.targetIds.length===1;
 if(next.routeDomain===null&&targets.length>1&&!focused&&/[这那](?:一)?[笔条]|(?:刚才|刚刚)(?:那|这)?(?:一)?笔/.test(rawText)&&/改|换|更正/.test(rawText)){
  const changes=next.ambiguity?.proposedChanges.length?next.ambiguity.proposedChanges:next.updates[0]?.changes??[];
  return {...next,kind:next.additions.length?'patch':'clarify',updates:[],ambiguity:{kind:'target',field:next.ambiguity?.field??changes[0]?.field??null,targetIds:targets.map(i=>i.draft.draftId),proposedChanges:changes}};
 }
 return next;
}
function deterministicText(state:FinanceConversation,rawText:string,options:AgentFinanceOptions):ModelFinanceTurn|null {
 const text=rawText.trim(),q=state.pendingQuestion;
 const choice=q?.choices.filter(c=>c.label===text);
 if(q&&choice?.length===1)return resolveFinanceSelection(state,{kind:'selection',questionId:q.id,choiceId:choice[0].id},options);
 if(q?.field==='accountId'&&q.targetIds.length>1&&/^(不是|不一样|不同|不是同一个)(?:账户)?[。！!]*$/.test(text))return {...empty(),kind:'clarify',ambiguity:{kind:'field',field:'accountId',targetIds:[q.targetIds[0]],proposedChanges:[]}};
 const all=options.accounts.filter(a=>new RegExp(`^都是${a.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:付的|支付|付款)?[。！!]*$`).test(text));
 if(all.length===1){const result=empty();result.updates=state.items.filter(i=>editable(i)&&i.draft.type==='expense'&&(!(q?.field==='accountId'&&q.targetIds.length)||q.targetIds.includes(i.draft.draftId))).map(i=>({draftId:i.draft.draftId,changes:[{field:'accountId',value:all[0].id,origin:'explicit'}]}));if(result.updates.length)return result;}
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
 const typedSeedDirection=input.turn.kind==='text'&&Boolean(state.intentSeed)&&state.pendingQuestion?.kind==='direction'&&state.pendingQuestion.choices.some(c=>c.label===rawText);
 const seedText=state.intentSeed?.rawText;
 const selection=input.turn.kind==='selection'?input.turn:input.turn.kind==='text'&&state.pendingQuestion?.choices.find(c=>c.label===rawText)?{kind:'selection' as const,questionId:state.pendingQuestion.id,choiceId:state.pendingQuestion.choices.find(c=>c.label===rawText)!.id}:null;
 if(selection){
  try{resolveFinanceSelection(state,selection,options);}catch(error){
   if(!(error instanceof StaleFinanceChoice))throw error;
   const previous=state.pendingQuestion!;
   state=applyFinanceChanges(state,input.turnId,empty(),dependencies.uuid);
   state.pendingQuestion=buildFinanceQuestion(state,options,previous.kind==='target'?{kind:'target',field:null,targetIds:previous.targetIds,proposedChanges:state.pendingTargetChanges??[]}:null);
   return {state,message:'所选选项已失效，候选已刷新，请重新选择；已知交易信息保留。',routeDomain:null};
  }
 }
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
  }else result=deterministicText(state,rawText,options)??sanitizeOrigins(parseModelFinanceTurn(await dependencies.interpret(buildFinanceModelContext(input,state,options,dependencies.now))),rawText,options,state);
 }
 parseModelFinanceTurn(result);
 if(result.kind==='route')return {state:input.state??state,message:result.routeDomain==='mixed'?'请把财务和事务分开发送；当前草稿保留。':'这条信息将交给相应入口，财务草稿保留。',routeDomain:result.routeDomain};
 for(const u of result.updates)assertCandidates(u.changes,options);
 if(result.ambiguity)assertCandidates(result.ambiguity.proposedChanges,options);
 for(const d of result.additions){
  assertCandidates(['accountId','categoryId','budgetBucketId','fromAccountId','toAccountId'].map(field=>({field:field as FieldChange['field'],value:d[field as keyof typeof d],origin:'explicit'})),options);
  if(rawText&&!typedSeedDirection&&!rawText.includes(d.sourceText))invalidConversation();
 }
 // Never append a transaction for a bare answer to a candidate question.
 if(result.additions.length&&!typedSeedDirection&&state.pendingQuestion?.choices.some(c=>c.label===rawText)&&input.turn.kind==='text')invalidConversation();
 const previousIds=new Set(state.items.map(i=>i.draft.draftId));
 state=applyFinanceChanges(state,input.turnId,result,dependencies.uuid);
 if(result.additions.length){state.intentSeed=null;for(const item of state.items)if(!previousIds.has(item.draft.draftId)&&rawText)item.draft.rawText=typedSeedDirection?seedText!:rawText;}
 state.items=state.items.map(i=>normalizeConversationItem(i,options,dependencies.now,dependencies.uuid));
 state.pendingQuestion=buildFinanceQuestion(state,options,result.ambiguity);
 if(rawText)state.recentUserTexts=boundedTexts([...state.recentUserTexts,rawText]);
 const unresolved=result.unresolvedSegments.length?' 有部分内容尚未识别，请补充或另发。':'';
 return {state,message:(state.pendingQuestion?.text??(state.items.some(editable)?'预览已更新，请核对后逐笔确认。':'没有新增记录，请提供交易事实。'))+unresolved,routeDomain:null};
}
