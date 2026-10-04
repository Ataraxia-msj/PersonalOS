import {expect,it} from 'vitest';
import {validateAffairsCommand} from './validation';
const uuid='a0000000-0000-0000-0000-000000000001';
function form(fields:Record<string,string|undefined>) { const f=new FormData();Object.entries({requestId:uuid,...fields}).forEach(([k,v])=>{if(v!==undefined) f.set(k,v);});return f; }
it('captures trimmed Unicode and internal newlines without creating a formal task',()=>{
 const r=validateAffairsCommand(form({operation:'create_affairs_inbox_entry',content:'  论文 📖\n实验  '}),new Date());
 expect(r.errors).toEqual({});expect(r.input).toEqual({operation:'create_affairs_inbox_entry',args:{p_request_id:uuid,p_content:'论文 📖\n实验'}});
});
it('counts code points and refuses empty, long, duplicate and injected fields',()=>{
 expect(validateAffairsCommand(form({operation:'create_affairs_inbox_entry',content:'😀'.repeat(4000)}),new Date()).input).not.toBeNull();
 for(const content of ['','  ','😀'.repeat(4001)]) expect(validateAffairsCommand(form({operation:'create_affairs_inbox_entry',content}),new Date()).input).toBeNull();
 const f=form({operation:'create_affairs_inbox_entry',content:'one'});f.append('content','two');expect(validateAffairsCommand(f,new Date()).input).toBeNull();
 f.delete('content');f.set('content',new File(['text'],'file'));expect(validateAffairsCommand(f,new Date()).input).toBeNull();
 expect(validateAffairsCommand(form({operation:'create_affairs_inbox_entry',content:'a',user_id:uuid}),new Date()).input).toBeNull();
});
it('resolves with ordinary independent defaults and preserves exact bigint revision',()=>{
 const r=validateAffairsCommand(form({operation:'resolve_affairs_inbox_entry',id:uuid,revision:'9007199254740993',target:'task',title:'Paper'}),new Date());
 expect(r.input?.args).toMatchObject({p_inbox_id:uuid,p_expected_revision:'9007199254740993',p_target:'task',p_payload:{title:'Paper',is_core:false,project_id:null,due_date:null}});
});
it('requires core criteria and project outcome, rejects unknown targets and extra fields',()=>{
 const base={operation:'resolve_affairs_inbox_entry',id:uuid,revision:'1'};
 for(const fields of [{target:'task',title:'x',is_core:'true'},{target:'project',name:'x'},{target:'note'},{target:'task',title:'x'.repeat(201)},{target:'task',title:'x',status:'done'}]) expect(validateAffairsCommand(form({...base,...fields}),new Date()).input).toBeNull();
});
