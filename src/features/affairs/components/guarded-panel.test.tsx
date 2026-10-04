import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {GuardedPanel} from './guarded-panel';
it('requires explicit discard of dirty content, restoring normal close after approval',async()=>{
 const close=vi.fn();const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);const user=userEvent.setup();
 render(<GuardedPanel open title="新增" onClose={close}><form data-affairs-dirty="true"><input aria-label="内容"/></form></GuardedPanel>);
 await user.keyboard('{Escape}');expect(confirm).toHaveBeenCalled();expect(close).not.toHaveBeenCalled();confirm.mockReturnValue(true);await user.click(screen.getByRole('button',{name:'关闭确认'}));expect(close).toHaveBeenCalledTimes(1);confirm.mockRestore();
});
it.each(['unresolved','pending'])('cannot discard a %s request by closing',async kind=>{
 const close=vi.fn();render(<GuardedPanel open title="新增" onClose={close}><form {...{[`data-affairs-${kind}`]:'true'}}/></GuardedPanel>);await userEvent.keyboard('{Escape}');await userEvent.click(screen.getByRole('button',{name:'关闭确认'}));expect(close).not.toHaveBeenCalled();
});
