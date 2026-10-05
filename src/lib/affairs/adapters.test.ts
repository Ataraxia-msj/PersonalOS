import { describe, it, expect } from "vitest";
import { adaptBalance, adaptReceipt, adaptProject, adaptTask } from "./adapters";
import type { ProjectProgressRow } from "./types";
describe("affairs adapters", () => {
  it("normalizes structured time and refuses missing deployed fields", () => {
    const row={revision:1,completion_cycle:0,due_date:"2026-10-08",planned_start_date:null,planned_time:"10:30:00"} as import("./types").TaskRow;
    expect(adaptTask(row)).toMatchObject({plannedStartDate:null,plannedTime:"10:30"});
    expect(()=>adaptTask({...row,planned_time:undefined} as unknown as import("./types").TaskRow)).toThrow();
  });
  it("maps legitimate absent wallet to zero", () =>
    expect(adaptBalance(null)).toBe(0));
  it("refuses imprecise balance/revision instead of rounding", () => {
    expect(() =>
      adaptBalance({
        user_id: "u",
        balance_coins: 9007199254740993,
        last_sequence: 1,
      }),
    ).toThrow();
    expect(() =>
      adaptReceipt({
        object_id: "x",
        object_revision: 9007199254740993,
        command_id: "c",
        coin_delta: 1,
        balance_coins: 1,
        replayed: false,
      }),
    ).toThrow();
  });
  it("retains database fraction and decimal revision", () => {
    expect(
      adaptProject({
        revision: "9007199254740993",
        milestone_total: 5,
        milestone_completed: 2,
        progress_rate: 0.4,
        due_date: null, planned_start_date: null, planned_time: null,
      } as ProjectProgressRow),
    ).toMatchObject({
      revision: "9007199254740993",
      progressRate: 0.4,
      milestoneTotal: 5,
    });
  });
});
