import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {InboxWorkspace} from './inbox-workspace';
import type {AffairsInboxData} from '../types';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
const entry={id:'a',revision:'1',content:'Original text',status:'pending' as const,createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:00Z',userId:'u',resolvedTaskId:null,resolvedProjectId:null,resolvedAt:null,discardedAt:null};
const data={entries:[entry,{...entry,id:'b',content:'Second text'}],tasks:[],projects:[],mainlines:[],serverNowISO:'2026-10-04T00:00:00Z'} as AffairsInboxData;
it('does not mount organization without selection; defaults ordinary independent and freezes an unknown target',async()=>{
 const calls:FormData[]=[];render(<InboxWorkspace data={data} status="pending" action={async(_s,d)=>{calls.push(d);return {status:'uncertain',receipt:null,fieldErrors:{},message:'未知'};}}/>);
 expect(screen.queryByLabelText('标题')).toBeNull();await userEvent.click(screen.getByRole('button',{name:/Original text/}));expect(screen.getByLabelText('标题')).toHaveValue('Original text');
 await userEvent.click(screen.getByRole('button',{name:'创建行动'}));await screen.findByText('未知');expect(calls[0].get('is_core')).toBe('false');expect(calls[0].get('project_id')).toBe('');
 await userEvent.click(screen.getByRole('button',{name:/Second text/}));expect(screen.getByLabelText('标题')).toHaveValue('Original text');await userEvent.click(screen.getByRole('button',{name:'项目'}));expect(screen.queryByLabelText('项目名称')).toBeNull();await userEvent.click(screen.getByRole('button',{name:'重试同一次提交'}));await waitFor(()=>expect(calls).toHaveLength(2));expect([...calls[1].entries()]).toEqual([...calls[0].entries()]);
});
it('resolved entries only link to their real renamed target',async()=>{
 const resolved={...entry,status:'resolved',resolvedTaskId:'task'};const tasks=[{id:'task',title:'Renamed task',status:'done'}];render(<InboxWorkspace data={{...data,entries:[resolved],tasks} as AffairsInboxData} status="resolved" action={vi.fn()}/>);
 await userEvent.click(screen.getByRole('button',{name:/Original text/}));expect(screen.getByRole('link',{name:'Renamed task'})).toHaveAttribute('href','/affairs/tasks/task/edit');expect(screen.queryByRole('button',{name:'创建行动'})).toBeNull();
});
it('opens a mobile source deep link as a drawer and preserves an unknown command across breakpoint changes',async()=>{
 let narrow=true;const listeners=new Set<()=>void>();
 vi.stubGlobal('matchMedia',()=>({get matches(){return narrow;},addEventListener:(_s:string,fn:()=>void)=>listeners.add(fn),removeEventListener:(_s:string,fn:()=>void)=>listeners.delete(fn)}));
 const requests:FormData[]=[];render(<InboxWorkspace data={data} status="pending" entryId="a" action={async(_s,d)=>{requests.push(d);return {status:'uncertain',receipt:null,fieldErrors:{},message:'未知抽屉'};}}/>);
 expect(await screen.findByRole('dialog',{name:'整理收集'})).toBeInTheDocument();
 await userEvent.click(screen.getByRole('button',{name:'创建行动'}));await screen.findByText('未知抽屉');
 const {act}=await import('@testing-library/react');act(()=>{narrow=false;listeners.forEach(fn=>fn());});
 expect(screen.queryByRole('dialog')).toBeNull();await userEvent.click(screen.getByRole('button',{name:'重试同一次提交'}));await waitFor(()=>expect(requests).toHaveLength(2));expect([...requests[1].entries()]).toEqual([...requests[0].entries()]);vi.unstubAllGlobals();
});
it('clears an old editor on allowed status navigation and confirms mobile discard only once',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
 const view=render(<InboxWorkspace data={data} status="pending" entryId="a" action={vi.fn()}/>);
 await userEvent.type(await screen.findByLabelText('标题'),' changed');await userEvent.click(screen.getByRole('button',{name:'关闭确认'}));expect(confirm).toHaveBeenCalledTimes(1);
 await userEvent.click(screen.getByRole('button',{name:/Original text/}));
 view.rerender(<InboxWorkspace data={{...data,entries:[]}} status="resolved" action={vi.fn()}/>);
 await waitFor(()=>expect(screen.queryByLabelText('标题')).toBeNull());confirm.mockRestore();vi.unstubAllGlobals();
});
