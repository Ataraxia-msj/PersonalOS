import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi} from 'vitest';
import {QuickAdd} from './quick-add';
import type {AffairsProject} from '../types';
const route=vi.hoisted(()=>({pathname:'/affairs'}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),usePathname:()=>route.pathname}));
it('opens capture without loading options and loads real options only for direct creation',async()=>{
 const load=vi.fn(async()=>({status:'ready' as const,data:{mainlines:[],projects:[],tasks:[],serverNowISO:'2026-10-04T00:00:00Z'}}));render(<QuickAdd action={vi.fn()} optionsAction={load}/>);
 await userEvent.click(screen.getByRole('button',{name:'新增'}));expect(screen.getByLabelText('收集内容')).toBeVisible();expect(load).not.toHaveBeenCalled();await userEvent.click(screen.getByRole('button',{name:'行动'}));expect(await screen.findByLabelText('行动名称')).toBeVisible();expect(load).toHaveBeenCalledTimes(1);
});
it('reloads real options after a confirmed creation and on reopening',async()=>{
 let created=false;
 const load=vi.fn(async()=>({status:'ready' as const,data:{mainlines:[],projects:created?[{id:'p',name:'New project',status:'active'} as AffairsProject]:[],tasks:[],serverNowISO:'2026-10-04T00:00:00Z'}}));
 const action=vi.fn(async()=>{created=true;return {status:'success' as const,fieldErrors:{},message:'已保存',receipt:{objectId:'p',revision:'1',commandId:'c',coinDelta:0,balanceAtCommand:0,replayed:false}};});
 render(<QuickAdd action={action} optionsAction={load}/>);
 await userEvent.click(screen.getByRole('button',{name:'新增'}));await userEvent.click(screen.getByRole('button',{name:'项目'}));
 await userEvent.type(await screen.findByLabelText('项目名称'),'New project');await userEvent.type(screen.getByLabelText('想获得的成果'),'Outcome');await userEvent.click(screen.getByRole('button',{name:'保存项目'}));await screen.findByText('已保存');
 await userEvent.click(screen.getByRole('button',{name:'行动'}));expect(await screen.findByRole('option',{name:'New project'})).toBeInTheDocument();
 await userEvent.click(screen.getByRole('button',{name:'关闭确认'}));await userEvent.click(screen.getByRole('button',{name:'新增'}));await userEvent.click(screen.getByRole('button',{name:'行动'}));await waitFor(()=>expect(load).toHaveBeenCalledTimes(3));
});
it('prefills only a real accessible project from the current project route',async()=>{
 route.pathname='/affairs/projects/p';
 const load=vi.fn(async()=>({status:'ready' as const,data:{mainlines:[],projects:[{id:'p',name:'Current',status:'active'} as AffairsProject],tasks:[],serverNowISO:'2026-10-04T00:00:00Z'}}));
 render(<QuickAdd action={vi.fn()} optionsAction={load}/>);await userEvent.click(screen.getByRole('button',{name:'新增'}));await userEvent.click(screen.getByRole('button',{name:'行动'}));expect(await screen.findByLabelText('所属项目')).toHaveValue('p');route.pathname='/affairs';
});
it('does not silently assign an archived contextual project or substitute focus',async()=>{
 route.pathname='/affairs/projects/p';
 const load=vi.fn(async()=>({status:'ready' as const,data:{mainlines:[],projects:[{id:'p',name:'Archived',status:'archived'} as AffairsProject],tasks:[],serverNowISO:'2026-10-04T00:00:00Z'}}));
 render(<QuickAdd action={vi.fn()} optionsAction={load}/>);await userEvent.click(screen.getByRole('button',{name:'新增'}));await userEvent.click(screen.getByRole('button',{name:'行动'}));expect(await screen.findByRole('alert')).toHaveTextContent('当前项目不可用于新增行动');expect(screen.getByLabelText('所属项目')).toHaveValue('');route.pathname='/affairs';
});
