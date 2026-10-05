import {it,expect,vi} from "vitest";
import {draft,options} from "./test-fixtures";
import {toAffairsConfirmation,validateAffairsDrafts} from "./preview";
import {confirmAgentAffairs} from "./confirm";
import type {AffairsQueryClient} from "@/lib/affairs/queries";
import {interpretAffairsMessage} from "./orchestrator";
import {model} from "./test-fixtures";
it("normalizes an inferred start year using Shanghai current year",async()=>{
 const result=await interpretAffairsMessage("10月1日开始",{} as AffairsQueryClient,new Date("2026-10-01T00:00:00Z"),{loadOptions:async()=>options,interpret:async()=>({message:"",unresolvedSegments:[],items:[model({sourceText:"10月1日开始",plannedStartDate:"2027-10-01"})]}),duplicates:async()=>[],uuid:()=>crypto.randomUUID()});
 expect(result.items[0].plannedStartDate).toBe("2026-10-01");
 expect(result.items[0].dateConfirmed).toBe(false);
});
it("saves Agent scheduling in columns rather than relying on description",async()=>{
 const item=draft({dueDate:"2026-10-08",plannedTime:"10:30",plannedStartDate:"2026-10-01"});
 const payload=toAffairsConfirmation(item,null);
 expect(payload).toMatchObject({payload:{planned_time:"10:30",planned_start_date:"2026-10-01"}});
 const rpc=vi.fn(async()=>({data:[{object_id:"t",object_revision:1,command_id:"c",coin_delta:0,balance_coins:0,replayed:false}],error:null}));
 expect((await confirmAgentAffairs({rpc} as unknown as AffairsQueryClient,payload)).status).toBe("success");
 expect(rpc.mock.calls[0]).toMatchObject(["create_affairs_task",{p_payload:{planned_time:"10:30",planned_start_date:"2026-10-01"}}]);
});
it("rejects reverse ranges and requires inferred start-year confirmation",()=>{
 expect(validateAffairsDrafts([draft({plannedStartDate:"2026-10-09",dueDate:"2026-10-08"})],options).items[0].issues.length).toBeGreaterThan(0);
 expect(validateAffairsDrafts([draft({plannedStartDate:"2026-10-01",yearInferred:true})],options).items[0].issues.join()).toContain("年份");
});
