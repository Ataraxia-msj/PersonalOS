import {act,render,screen,within,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi} from 'vitest';
import {AffairsPreview} from './affairs-preview';
import {draft,options,ids} from '@/lib/agent/affairs/test-fixtures';
import type {AffairsInterpretation,AffairsConfirmationResult} from '@/lib/agent/affairs/types';
const interpretation=(items=[draft()]):AffairsInterpretation=>({domain:'affairs',items,options,duplicates:[],unresolvedSegments:[],message:'请确认'});
const duplicateAction=vi.fn().mockResolvedValue({status:'success',items:[]});
it('edits fields and inferred year, allows explicit project addition without inventing outcome',async()=>{
 const user=userEvent.setup();render(<AffairsPreview interpretation={interpretation([draft({dueDate:'2026-10-08',plannedTime:'10:30',yearInferred:true})])} duplicateAction={duplicateAction}/>);
 expect(screen.getByRole('button',{name:/确认保存/})).toBeDisabled();
 await user.click(screen.getByLabelText(/确认年份/));
 await user.clear(screen.getByLabelText('名称'));await user.type(screen.getByLabelText('名称'),'新的面试');
 await waitFor(()=>expect(screen.getByRole('button',{name:/确认保存/})).toBeEnabled());
 await user.click(screen.getByRole('button',{name:'添加项目'}));
 expect(screen.getByLabelText('项目成果')).toHaveValue('');expect(screen.getByRole('button',{name:/确认保存/})).toBeDisabled();
});
it('stale title duplicate response cannot apply to edited preview',async()=>{
 const user=userEvent.setup();let resolve!:(v:unknown)=>void;
 const lookup=vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue({status:'success',items:[]});
 render(<AffairsPreview interpretation={interpretation()} duplicateAction={lookup}/>);
 await user.type(screen.getByLabelText('名称'),'A');
 await waitFor(()=>expect(lookup).toHaveBeenCalled());
 await user.type(screen.getByLabelText('名称'),'B');
 await act(async()=>resolve({status:'success',items:[{id:ids.project,title:'面试A',status:'todo',projectId:null}]}));
 await waitFor(()=>expect(screen.getByRole('button',{name:/确认保存/})).toBeEnabled());
 expect(screen.queryByText(/发现同名行动/)).not.toBeInTheDocument();
});
it('locks unknown submissions across rerender and retries same payload',async()=>{
 const user=userEvent.setup(),protectedChanged=vi.fn(),command=vi.fn().mockResolvedValueOnce({status:'uncertain',message:'结果未知',receipt:null,objectId:null,reused:false}).mockResolvedValue({status:'success',message:'已保存',receipt:null,objectId:ids.project,reused:false});
 const data=interpretation();const {rerender}=render(<AffairsPreview interpretation={data} onProtectionChange={protectedChanged} confirmAction={command} duplicateAction={duplicateAction}/>);
 await user.click(screen.getByRole('button',{name:/确认保存/}));
 expect(await screen.findByRole('alert')).toHaveTextContent('结果未知');expect(screen.getByLabelText('名称')).toBeDisabled();expect(screen.queryByRole('button',{name:/修改未保存/})).not.toBeInTheDocument();
 rerender(<AffairsPreview interpretation={{...data,items:[draft({name:'新内容'})]}} onProtectionChange={protectedChanged} confirmAction={command} duplicateAction={duplicateAction}/>);
 await user.click(screen.getByRole('button',{name:/原请求重试/}));
 expect(command.mock.calls[1][0]).toEqual(command.mock.calls[0][0]);expect(await screen.findByRole('status')).toHaveTextContent('已保存');expect(protectedChanged).toHaveBeenLastCalledWith(false);
});
it('asks to confirm semantic reuse and exposes only real links after success',async()=>{
 const user=userEvent.setup(),confirm=vi.fn<(_:unknown)=>Promise<AffairsConfirmationResult>>().mockResolvedValue({status:'success',message:'已复用',receipt:null,objectId:ids.mainline,reused:true});
 render(<AffairsPreview interpretation={interpretation([draft({type:'mainline',mode:'reuse',reuseId:ids.mainline})])} confirmAction={confirm} duplicateAction={duplicateAction}/>);
 expect(screen.getByRole('button',{name:/确认保存/})).toBeDisabled();await user.click(screen.getByLabelText(/确认复用/));await user.click(screen.getByRole('button',{name:/确认保存/}));
 const card=screen.getByRole('article',{name:'事务预览 1'});expect(await within(card).findByRole('link',{name:'查看记录'})).toHaveAttribute('href','/affairs');
});
it('blocks another batch while an existing batch is protected',async()=>{
 const user=userEvent.setup(),confirm=vi.fn();
 render(<AffairsPreview interpretation={interpretation()} confirmAction={confirm} duplicateAction={duplicateAction} externalBlocked/>);
 expect(screen.getByRole('button',{name:/确认保存/})).toBeDisabled();await user.click(screen.getByRole('button',{name:/确认保存/}));expect(confirm).not.toHaveBeenCalled();
});
it('guards internal navigation and beforeunload while dirty',async()=>{
 const user=userEvent.setup(),ask=vi.spyOn(window,'confirm').mockReturnValue(false);
 render(<><a href="/finance">财务导航</a><AffairsPreview interpretation={interpretation()} duplicateAction={duplicateAction}/></>);
 await user.click(screen.getByRole('link',{name:'财务导航'}));expect(ask).toHaveBeenCalled();
 const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);ask.mockRestore();
});
it('keeps new parent receipt available when editing a failed child after partial success',async()=>{
 const user=userEvent.setup(),parent=draft({type:'project',name:'新项目',outcome:'真实成果'}),child=draft({name:'子行动',parentDraftId:parent.draftId});
 const confirm=vi.fn().mockResolvedValueOnce({status:'success',message:'父级已保存',receipt:null,objectId:ids.project.replace(/2$/,'3'),reused:false}).mockResolvedValueOnce({status:'error',message:'明确拒绝',receipt:null,objectId:null,reused:false}).mockResolvedValue({status:'success',message:'子项已保存',receipt:null,objectId:ids.project,reused:false});
 render(<AffairsPreview interpretation={interpretation([parent,child])} confirmAction={confirm} duplicateAction={duplicateAction}/>);
 await user.click(screen.getByRole('button',{name:/确认保存/}));await screen.findByRole('alert');
 await user.click(screen.getByRole('button',{name:'结束原批次，修改未保存项'}));
 const childCard=screen.getByRole('article',{name:'事务预览 2'});
 expect(within(childCard).getByLabelText('归属')).toHaveValue(ids.project.replace(/2$/,'3'));
 await waitFor(()=>expect(screen.getByRole('button',{name:'确认保存 1 项'})).toBeEnabled());
 await user.click(screen.getByRole('button',{name:'确认保存 1 项'}));
 expect(confirm.mock.calls[2][0]).toMatchObject({kind:'task',payload:{project_id:ids.project.replace(/2$/,'3')}});
 expect(confirm).toHaveBeenCalledTimes(3);
});
