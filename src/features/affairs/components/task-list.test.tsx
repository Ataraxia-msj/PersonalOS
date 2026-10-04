import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { TaskList } from "./task-list";
import type { AffairsTask } from "../types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
it("keeps independent core tasks accessible through all actions", async () => {
  const tasks = [
    {
      id: "t",
      title: "Core",
      isCore: true,
      projectId: null,
      status: "todo",
      revision: "1",
    } as AffairsTask,
  ];
  render(<TaskList tasks={tasks} projects={[]} balance={0} action={vi.fn()} />);
  expect(screen.getByText("Core")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "全部未完成" }));
  expect(screen.getByText("Core")).toBeVisible();
});
it('cannot hide an unknown status command by switching filters',async()=>{
 const task={id:'t',title:'Keep',status:'todo',projectId:null,isCore:false,revision:'1'} as AffairsTask;
 render(<TaskList tasks={[task]} projects={[]} balance={0} action={async()=>({status:'uncertain',receipt:null,fieldErrors:{},message:'未知状态'})}/>);
 await userEvent.click(screen.getByText('更改状态'));await userEvent.click(screen.getByRole('button',{name:'保存状态'}));await screen.findByText('未知状态');await userEvent.click(screen.getByRole('button',{name:'等待'}));expect(screen.getByText('Keep')).toBeVisible();expect(screen.getByRole('button',{name:'重试同一次提交'})).toBeVisible();
});
it('retains the original completion command when unrelated refresh marks its row done',async()=>{
 const task={id:'t',title:'Keep receipt',status:'todo',projectId:null,isCore:false,revision:'1'} as AffairsTask;
 const requests:FormData[]=[];
 const action=async(_s:unknown,d:FormData)=>{requests.push(d);return {status:'uncertain' as const,receipt:null,fieldErrors:{},message:'未知完成'};};
 const view=render(<TaskList tasks={[task]} projects={[]} balance={0} action={action}/>);
 await userEvent.click(screen.getByRole('button',{name:'确认完成'}));
 await userEvent.click(screen.getByLabelText('确认已满足完成条件'));
 await userEvent.click(screen.getByRole('button',{name:'确认完成行动'}));
 await screen.findByText('未知完成');
 view.rerender(<TaskList tasks={[{...task,status:'done',revision:'2'}]} projects={[]} balance={0} action={action}/>);
 await userEvent.click(screen.getByRole('button',{name:'重试同一次提交'}));
 await waitFor(()=>expect(requests).toHaveLength(2));
 expect([...requests[1].entries()]).toEqual([...requests[0].entries()]);
});
it('allows an explicitly discarded dirty row to leave the filter',async()=>{
 const task={id:'t',title:'Dirty status',status:'todo',projectId:null,isCore:false,revision:'1'} as AffairsTask;
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);render(<TaskList tasks={[task]} projects={[]} balance={0} action={vi.fn()}/>);
 await userEvent.click(screen.getByText('更改状态'));await userEvent.type(screen.getByLabelText('等待说明'),'Note');await userEvent.click(screen.getByRole('button',{name:'等待'}));expect(screen.queryByText('Dirty status')).toBeNull();confirm.mockRestore();
});
