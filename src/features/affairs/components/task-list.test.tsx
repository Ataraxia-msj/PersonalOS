import { render, screen } from "@testing-library/react";
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
