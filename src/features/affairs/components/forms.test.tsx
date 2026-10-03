import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi} from 'vitest';
import {TaskForm} from './task-form';
import {ConfirmationPanel} from './confirmation-panel';
import type {AffairsFormData} from '../types';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
const data:AffairsFormData={resource:'task',initialValues:null,mainlines:[],projects:[],tasks:[],serverNowISO:'2026-10-03T00:00:00Z'};
it('creates ordinary independent tasks with no date and preserves uncertain request and payload',async()=>{
 const seen:FormData[]=[];const action=vi.fn(async(_s,d:FormData)=>{seen.push(d);return {status:'uncertain' as const,fieldErrors:{},message:'暂不明确',receipt:null};});const user=userEvent.setup();
 render(<TaskForm data={data} mode="create" action={action}/>);
 await user.type(screen.getByLabelText('行动名称'),'Ordinary');await user.click(screen.getByRole('button',{name:'保存行动'}));
 await screen.findByText('暂不明确');expect(seen[0].get('due_date')).toBe('');expect(seen[0].get('project_id')).toBe('');
 expect(screen.getByLabelText('行动名称')).toBeDisabled();await user.click(screen.getByRole('button',{name:'重试同一次提交'}));await waitFor(()=>expect(action).toHaveBeenCalledTimes(2));
 expect([...seen[0].entries()]).toEqual([...seen[1].entries()]);expect(seen[0].get('requestId')).toBeTruthy();
});
it('reveals completion conditions for explicitly core work',async()=>{render(<TaskForm data={data} mode="create" action={vi.fn()}/>);await userEvent.click(screen.getByLabelText('核心行动'));expect(screen.getByLabelText('推进的目标')).toBeRequired();expect(screen.getByLabelText('完成条件')).toBeRequired();expect(screen.queryByText('优先级')).not.toBeInTheDocument();});
it('focuses confirmation dialog and closes with Escape',async()=>{const close=vi.fn();render(<ConfirmationPanel open title="确认" onClose={close}><button>提交</button></ConfirmationPanel>);expect(screen.getByRole('dialog',{name:'确认'})).toBeVisible();await userEvent.keyboard('{Escape}');expect(close).toHaveBeenCalled();});
