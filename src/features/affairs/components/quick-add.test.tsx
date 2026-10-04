import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi} from 'vitest';
import {QuickAdd} from './quick-add';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
it('opens capture without loading options and loads real options only for direct creation',async()=>{
 const load=vi.fn(async()=>({status:'ready' as const,data:{mainlines:[],projects:[],tasks:[],serverNowISO:'2026-10-04T00:00:00Z'}}));render(<QuickAdd action={vi.fn()} optionsAction={load}/>);
 await userEvent.click(screen.getByRole('button',{name:'新增'}));expect(screen.getByLabelText('收集内容')).toBeVisible();expect(load).not.toHaveBeenCalled();await userEvent.click(screen.getByRole('button',{name:'行动'}));expect(await screen.findByLabelText('行动名称')).toBeVisible();expect(load).toHaveBeenCalledTimes(1);
});
