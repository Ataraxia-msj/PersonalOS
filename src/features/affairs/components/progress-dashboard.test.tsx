import { render, screen, act } from "@testing-library/react";
import userEvent from '@testing-library/user-event';
import { it, expect, vi, beforeEach } from "vitest";
import { ProgressDashboard } from "./progress-dashboard";
import {AffairsNavigationGuard} from './navigation-guard';
import type {AffairsDashboardData,AffairsTask} from '../types';
const {push}=vi.hoisted(()=>({push:vi.fn()}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(),push }) }));
beforeEach(()=>window.history.replaceState({__NA:true},'', '/affairs'));
const base:AffairsDashboardData={mainlines:[],projects:[],tasks:[],progress:[],contributions:[],balance:0,today:'2026-10-05',serverNowISO:'2026-10-05T00:00Z'};
it('switches month and URL locally, supports history and empty-day creation without writes',async()=>{
 const action=vi.fn();render(<ProgressDashboard data={base} action={action}/>);
 await userEvent.click(screen.getByRole('button',{name:'日历'}));
 expect(screen.queryByText('主线与项目')).toBeNull();
 expect(screen.queryByText('行动范围')).toBeNull();
 expect(window.location.search).toContain('view=calendar');
 await userEvent.click(screen.getByRole('button',{name:'下个月'}));
 expect(screen.getByText('2026年11月')).toBeVisible();
 expect(window.location.search).toContain('month=2026-11');
 await userEvent.click(screen.getByRole('button',{name:'今天'}));
 expect(screen.getByText('2026年10月')).toBeVisible();
 window.history.replaceState({__NA:true},'', '/affairs?view=calendar&month=2027-02');
 act(()=>window.dispatchEvent(new PopStateEvent('popstate')));
 expect(screen.getByText('2027年2月')).toBeVisible();
 await userEvent.click(screen.getByRole('button',{name:'新增行动：2027-02-08'}));
 expect(push).toHaveBeenCalledWith('/affairs/tasks/new?dueDate=2027-02-08');
 expect(action).not.toHaveBeenCalled();
});
it.each(['dirty','pending','uncertain'] as const)('keeps calendar controls and history protected for %s completion',async status=>{
 const task={id:'t',revision:'1',title:'准备面试',status:'todo',isCore:false,plannedStartDate:null,dueDate:'2026-10-08',plannedTime:null,projectId:null} as AffairsTask;
 const action=vi.fn(async()=> status==='pending'?await new Promise<never>(()=>{}):{status:'uncertain' as const,receipt:null,fieldErrors:{},message:'结果未知'});
 render(<><AffairsNavigationGuard/><ProgressDashboard data={{...base,tasks:[task]}} action={action} initialLocation={{view:'calendar',month:'2026-10'}}/></>);
 const earlier=window.history.state;window.history.pushState({...earlier},'', '/affairs?view=calendar&month=2026-10');
 const current=window.history.state;
 await userEvent.click(screen.getByRole('button',{name:'完成：准备面试'}));
 await userEvent.click(screen.getByLabelText('确认已满足完成条件'));
 if(status!=='dirty')await userEvent.click(screen.getByRole('button',{name:'确认完成行动'}));
 if(status==='uncertain')await screen.findByText('结果未知');
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false),go=vi.spyOn(window.history,'go').mockImplementation(()=>{});
 await userEvent.click(screen.getByRole('button',{name:'下个月'}));
 await userEvent.click(screen.getByRole('button',{name:'清单'}));
 expect(screen.getByRole('dialog',{name:'确认行动完成'})).toBeVisible();
 expect(screen.getByText('2026年10月')).toBeVisible();
 expect(window.location.search).not.toContain('month=2026-11');
 act(()=>window.dispatchEvent(new PopStateEvent('popstate',{state:earlier})));
 expect(go).toHaveBeenCalledWith(1);
 act(()=>window.dispatchEvent(new PopStateEvent('popstate',{state:current})));
 expect(screen.getByText('2026年10月')).toBeVisible();
 confirm.mockRestore();go.mockRestore();
});
it("zero state has real creation entries and zero coins, no example content", () => {
  render(
    <ProgressDashboard
      data={{
        mainlines: [],
        projects: [],
        tasks: [],
        progress: [],
        contributions: [],
        balance: 0,
        today: "2026-10-03",
        serverNowISO: "2026-10-03T00:00Z",
      }}
      action={vi.fn()}
    />,
  );
  expect(screen.getByRole("link", { name: "新建主线" })).toHaveAttribute(
    "href",
    "/affairs/mainlines/new",
  );
  expect(screen.getByRole("link", { name: "新建项目" })).toHaveAttribute(
    "href",
    "/affairs/projects/new",
  );
  expect(screen.getByText("金币余额")).toBeVisible();
  expect(screen.queryByRole('heading',{name:'事务'})).toBeNull();
  expect(screen.getByRole('link',{name:'查看全部'})).toHaveAttribute('href','/affairs/tasks');
  expect(
    screen.getByRole("button", { name: "2026-10-03 · 0 次推进" }),
  ).toBeVisible();
  expect(screen.queryByText("番茄钟")).not.toBeInTheDocument();
});
