import type { AffairsCommand,AffairsOperation,MilestoneMetadata,ValidationResult } from './types';
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maximumBigint=BigInt('9223372036854775807');
export function decimalInteger(value:unknown):string {
 if(typeof value==='number' && !Number.isSafeInteger(value)) throw new Error('unsafe_integer');
 const text=typeof value==='string'?value:typeof value==='number'?String(value):'';
 if(!/^\d+$/.test(text) || BigInt(text)>maximumBigint) throw new Error('invalid_integer');
 return BigInt(text).toString();
}
export function safeInteger(value:unknown):number {
 if(typeof value==='string' && !/^-?\d+$/.test(value)) throw new Error('invalid_integer');
 if(typeof value!=='string' && typeof value!=='number') throw new Error('invalid_integer');
 const n=Number(value);if(!Number.isSafeInteger(n))throw new Error('unsafe_integer');return n;
}
export function validDate(value:string):boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value) || value<'1000-01-01')return false;
 const d=new Date(`${value}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function shanghaiInput(date:Date):string {return new Date(date.getTime()+8*3600000).toISOString().slice(0,16);}
export function shanghaiTimestamp(value:string):string {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)||!validDate(value.slice(0,10)))throw new Error('invalid_datetime');
 const [hour,minute,second='0']=value.slice(11).split(':');if(+hour>23||+minute>59||+second>59)throw new Error('invalid_datetime');
 return new Date(`${value}+08:00`).toISOString();
}
const operations:AffairsOperation[]=[
 'create_affairs_mainline','update_affairs_mainline','set_affairs_mainline_status','set_affairs_mainline_focus',
 'create_affairs_project','update_affairs_project','set_affairs_project_status',
 'create_affairs_task','update_affairs_task','set_affairs_task_status','save_affairs_milestones','set_affairs_milestone_completed','record_affairs_progress',
 'complete_affairs_task','reopen_affairs_task','undo_affairs_task_completion',
 'create_affairs_reward','update_affairs_reward','redeem_affairs_reward','use_affairs_redemption','cancel_affairs_redemption','record_affairs_penalty','reverse_affairs_penalty'
];
export function validateAffairsCommand(data:FormData,now:Date):ValidationResult<AffairsCommand> {
 const errors:Record<string,string>={}; const allowed=new Set(['operation','requestId']);
 const raw=(key:string)=>{allowed.add(key);const v=data.get(key);if(v!==null && typeof v!=='string'){errors[key]='输入格式错误';return '';}return v??'';};
 const text=(key:string,max:number,required=false)=>{const v=raw(key).trim();if((required&&!v)||[...v].length>max)errors[key]=`请输入${required?'1–':''}${max}字以内的内容`;return v||null;};
 const uuid=(key:string,required=false)=>{const v=raw(key).trim();if((required&&!v)||(v&&!uuidPattern.test(v)))errors[key]='标识无效';return v?v.toLowerCase():null;};
 const bool=(key:string,fallback=false)=>{const v=raw(key);if(!['','true','false','on'].includes(v))errors[key]='请选择有效选项';return v==='true'||v==='on'||(v===''&&fallback);};
 const integer=(key:string,min:number,max:number)=>{const v=raw(key);if(!/^\d+$/.test(v)||!Number.isSafeInteger(+v)||+v<min||+v>max)errors[key]='请输入有效整数';return +v;};
 const date=(key:string)=>{const v=raw(key).trim();if(v&&!validDate(v))errors[key]='日期无效';return v||null;};
 const timestamp=(key:string)=>{const v=raw(key);try{const parsed=shanghaiTimestamp(v);if(new Date(parsed)>now)errors[key]='实际发生时间不能在未来';return parsed;}catch{errors[key]='日期时间无效';return '';}};
 const op=raw('operation') as AffairsOperation; const request=uuid('requestId',true);
 if(!operations.includes(op))return {input:null,errors:{operation:'不支持的操作'}};
 const args:Record<string,unknown>={p_request_id:request};
 if(!op.startsWith('create_')&&!['record_affairs_progress','record_affairs_penalty'].includes(op)){
  const kind=op.includes('mainline')?'mainline':op.includes('milestone_completed')?'milestone':op.includes('project')||op==='save_affairs_milestones'?'project':op.includes('task')?'task':op.includes('redemption')?'redemption':op.includes('penalty')?'penalty':'reward';
  args[`p_${kind}_id`]=uuid('id',true);const revision=raw('revision');try{const n=decimalInteger(revision);if(n==='0')throw new Error();args.p_expected_revision=n;}catch{errors.revision='版本无效，请刷新';}
 }
 if(op.startsWith('create_')||op.startsWith('update_')){
  if(op.includes('mainline')) args.p_payload={name:text('name',200,true),description:text('description',10000),sort_order:raw('sort_order')===''?0:integer('sort_order',0,2147483647)};
  else if(op.includes('project'))args.p_payload={name:text('name',200,true),outcome:text('outcome',2000,true),description:text('description',10000),mainline_id:uuid('mainline_id'),due_date:date('due_date')};
  else if(op.includes('task')){
   const isCore=bool('is_core');args.p_payload={title:text('title',200,true),description:text('description',10000),project_id:uuid('project_id'),is_core:isCore,core_reason:text('core_reason',2000,isCore),completion_criteria:text('completion_criteria',2000,isCore),due_date:date('due_date')};
  }else args.p_payload={name:text('name',200,true),description:text('description',2000),price_coins:integer('price_coins',1,1000000),is_active:bool('is_active',true)};
 } else switch(op){
  case 'set_affairs_mainline_status':case 'set_affairs_project_status':case 'set_affairs_task_status':{
   const status=raw('status');const choices=op.includes('mainline')?['active','paused','archived']:op.includes('project')?['active','paused','completed','archived']:['todo','in_progress','waiting','cancelled'];if(!choices.includes(status))errors.status='状态无效';args.p_status=status;
   if(op.includes('project'))args.p_outcome_confirmed=bool('outcome_confirmed');if(op.includes('task'))args.p_waiting_reason=text('waiting_reason',2000);break;
  }
  case 'set_affairs_mainline_focus':args.p_project_id=uuid('project_id');break;
  case 'complete_affairs_task':args.p_completion_confirmed=bool('completion_confirmed');if(!args.p_completion_confirmed)errors.completion_confirmed='请确认满足完成条件';break;
  case 'undo_affairs_task_completion':case 'reverse_affairs_penalty':args.p_reason=text('reason',2000,true);break;
  case 'record_affairs_penalty':args.p_task_id=uuid('task_id');args.p_reason=text('reason',2000,true);args.p_occurred_at=timestamp('occurred_at');break;
  case 'record_affairs_progress':args.p_project_id=uuid('project_id');args.p_task_id=uuid('task_id');args.p_content=text('content',4000,true);args.p_next_step=text('next_step',2000);args.p_occurred_at=timestamp('occurred_at');if(!args.p_project_id&&!args.p_task_id)errors.project_id='请选择项目或任务';break;
  case 'redeem_affairs_reward':args.p_confirmed_price=integer('confirmed_price',1,1000000);break;
  case 'set_affairs_milestone_completed':args.p_completed=bool('completed');break;
  case 'save_affairs_milestones':{
   try{
    const items:unknown=JSON.parse(raw('milestones'));if(!Array.isArray(items))throw new Error();
    const normalized:MilestoneMetadata[]=items.map((item:unknown)=>{
     if(!item||typeof item!=='object'||Array.isArray(item))throw new Error();const p=item as Record<string,unknown>;
     if(Object.keys(p).some(k=>!['id','expected_revision','title','completion_criteria','sort_order'].includes(k)))throw new Error();
     if(typeof p.title!=='string'||typeof p.completion_criteria!=='string')throw new Error();const title=p.title.trim(),criterion=p.completion_criteria.trim();
     if(!title||[...title].length>200||!criterion||[...criterion].length>2000)throw new Error();
     const id=p.id===null?null:typeof p.id==='string'&&uuidPattern.test(p.id)?p.id.toLowerCase():(()=>{throw new Error();})();
     const revision=p.expected_revision===null?null:decimalInteger(p.expected_revision);if((id===null)!==(revision===null)||revision==='0')throw new Error();
     if(!Number.isSafeInteger(p.sort_order)||Number(p.sort_order)<0||Number(p.sort_order)>2147483647)throw new Error();
     return {id,expected_revision:revision,title,completion_criteria:criterion,sort_order:Number(p.sort_order)};
    });if(new Set(normalized.filter(i=>i.id).map(i=>i.id)).size!==normalized.filter(i=>i.id).length)throw new Error();args.p_milestones=normalized;
   }catch{errors.milestones='阶段成果格式或版本无效';}break;
  }
 }
 for(const key of data.keys())if(!key.startsWith('$ACTION_')&&(!allowed.has(key)||data.getAll(key).length!==1))errors[key]='不支持或重复的字段';
 return Object.keys(errors).length?{input:null,errors}:{input:{operation:op,args} as AffairsCommand,errors:{}};
}
