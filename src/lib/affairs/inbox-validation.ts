import type {InboxCommand} from './inbox-types';
import {isInboxOperation} from './inbox-types';
import type {ValidationResult} from './types';
import {decimalInteger,validateAffairsCommand} from './validation';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateInboxCommand(data:FormData):ValidationResult<InboxCommand> {
 const errors:Record<string,string>={};const allowed=new Set(['operation','requestId']);
 const raw=(k:string)=>{allowed.add(k);const v=data.get(k);if(v!==null&&typeof v!=='string'){errors[k]='输入格式错误';return '';}return (v??'').trim();};
 const id=(k:string)=>{const v=raw(k);if(!uuid.test(v)) errors[k]='标识无效';return v.toLowerCase();};
 const operation=raw('operation');if(!isInboxOperation(operation)) return {input:null,errors:{operation:'不支持的操作'}};
 const args:Record<string,unknown>={p_request_id:id('requestId')};
 if(operation!=='create_affairs_inbox_entry') {
  args.p_inbox_id=id('id');try{args.p_expected_revision=decimalInteger(raw('revision'));if(args.p_expected_revision==='0') throw new Error();}catch{errors.revision='版本无效，请刷新';}
 }
 if(operation==='create_affairs_inbox_entry'||operation==='update_affairs_inbox_entry'){
  const content=raw('content');if(!content||[...content].length>4000) errors.content='请输入1–4000字的内容';args.p_content=content;
 }
 if(operation==='resolve_affairs_inbox_entry') {
  const target=raw('target');if(target!=='task'&&target!=='project') errors.target='请选择行动或项目';
  else {
   const fields=target==='task'?['title','description','project_id','is_core','core_reason','completion_criteria','due_date']:['name','outcome','description','mainline_id','due_date'];
   const metadata=new FormData();metadata.set('operation',`create_affairs_${target}`);metadata.set('requestId',String(args.p_request_id));
   for(const k of fields){allowed.add(k);for(const v of data.getAll(k)) metadata.append(k,v);}
   const parsed=validateAffairsCommand(metadata,new Date());Object.assign(errors,parsed.errors);
   if(parsed.input && 'p_payload' in parsed.input.args) args.p_payload=parsed.input.args.p_payload;
   args.p_target=target;
  }
 }
 for(const k of data.keys()) if(!k.startsWith('$ACTION_')&&(!allowed.has(k)||data.getAll(k).length!==1)) errors[k]='不支持或重复的字段';
 return Object.keys(errors).length?{input:null,errors}:{input:{operation,args} as InboxCommand,errors:{}};
}
