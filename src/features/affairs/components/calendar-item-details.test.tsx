import {render,screen} from "@testing-library/react";
import {it,expect,vi} from "vitest";
import {CalendarItemDetails} from "./calendar-item-details";
import type {CalendarItem} from "../schedule";
it("shows real project affiliation and complete dates, without mainline",()=>{
 const item={key:"task:t",id:"t",resource:"task",title:"面试",projectName:"求职",startDate:"2026-10-01",endDate:"2026-10-08",time:"10:30",status:"todo",href:"/affairs/tasks/t/edit"} as CalendarItem;
 render(<CalendarItemDetails item={item} task={null} project={null} balance={0} action={vi.fn()} onClose={vi.fn()}/>);
 expect(screen.getByText("求职")).toBeVisible();
 expect(screen.getByText(/2026-10-01.*2026-10-08/)).toBeVisible();
 expect(screen.getByRole("link",{name:"编辑行动"})).toHaveAttribute("href","/affairs/tasks/t/edit");
 expect(screen.queryByText("主线")).toBeNull();
});
