import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi} from 'vitest';
import {MainlineOutline} from './mainline-outline';
import type {AffairsDashboardData} from '../types';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
it('shows all projects under a mainline, independent projects and nested ordinary actions',async()=>{
 const data={mainlines:[{id:'m',name:'Mainline',status:'active',focusProjectId:'p'}],projects:[{id:'p',name:'Focus',mainlineId:'m',status:'active',progressRate:.3},{id:'q',name:'Other',mainlineId:'m',status:'paused',progressRate:null},{id:'z',name:'Independent',mainlineId:null,status:'active',progressRate:null}],tasks:[{id:'t',title:'Ordinary',projectId:'q',status:'waiting',isCore:false}]} as unknown as AffairsDashboardData;
 render(<MainlineOutline data={data} action={vi.fn()} history={false} onScope={vi.fn()}/>);expect(screen.getByText('Focus',{selector:'span'})).toBeVisible();expect(screen.getByText('Other',{selector:'span'})).toBeVisible();expect(screen.getByText('独立项目')).toBeVisible();await userEvent.click(screen.getByText('Other',{selector:'span'}));expect(screen.getByRole('link',{name:'Ordinary'})).toBeVisible();expect(screen.getByRole('link',{name:'Ordinary'})).toHaveAttribute('href','/affairs/tasks/t/edit');
});
