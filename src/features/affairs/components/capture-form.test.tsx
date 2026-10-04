import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {CaptureForm} from './capture-form';
import type {AffairsAction} from './action-form';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
it('permits continuous real captures, clearing only after confirmed success with a fresh UUID',async()=>{
 const seen:FormData[]=[];const action:AffairsAction=async(_s,d)=>{seen.push(d);return {status:'success',fieldErrors:{},message:'已保存',receipt:{objectId:'i',revision:'1',commandId:'c',coinDelta:0,balanceAtCommand:10,replayed:false}};};
 const user=userEvent.setup();render(<CaptureForm action={action}/>);
 await user.type(screen.getByLabelText('收集内容'),'First');await user.click(screen.getByRole('button',{name:'放入收集箱'}));
 await waitFor(()=>expect(screen.getByLabelText('收集内容')).toHaveValue(''));
 await user.type(screen.getByLabelText('收集内容'),'Second');await user.click(screen.getByRole('button',{name:'放入收集箱'}));await waitFor(()=>expect(seen).toHaveLength(2));
 expect(seen[1].get('requestId')).not.toBe(seen[0].get('requestId'));expect(seen[1].get('content')).toBe('Second');expect(screen.queryByText(/原回执余额/)).toBeNull();
});
it('freezes the original capture through unknown response and rejected retry',async()=>{
 const seen:FormData[]=[];const action:AffairsAction=async(_s,d)=>{seen.push(d);return {status:seen.length===1?'uncertain':'error',fieldErrors:{},message:'未知',receipt:null};};
 const user=userEvent.setup();render(<CaptureForm action={action}/>);await user.type(screen.getByLabelText('收集内容'),'Keep me');await user.click(screen.getByRole('button',{name:'放入收集箱'}));await screen.findByText('未知');
 await user.click(screen.getByRole('button',{name:'重试同一次提交'}));await waitFor(()=>expect(seen).toHaveLength(2));expect([...seen[1].entries()]).toEqual([...seen[0].entries()]);expect(screen.getByLabelText('收集内容')).toBeDisabled();
});
it('keeps ordinary Enter as newline and submits Ctrl+Enter only in the focused textarea',async()=>{
 const action=vi.fn<AffairsAction>(async()=>({status:'error',fieldErrors:{},message:'拒绝',receipt:null}));const user=userEvent.setup();render(<CaptureForm action={action}/>);
 await user.type(screen.getByLabelText('收集内容'),'One{Enter}Two');expect(screen.getByLabelText('收集内容')).toHaveValue('One\nTwo');expect(action).not.toHaveBeenCalled();await user.keyboard('{Control>}{Enter}{/Control}');await waitFor(()=>expect(action).toHaveBeenCalledTimes(1));
});
