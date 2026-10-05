import { describe, it, expect } from "vitest";
import {
  validateAffairsCommand,
  decimalInteger,
  shanghaiInput,
  shanghaiTimestamp,
} from "./validation";
const now = new Date("2026-10-03T10:00:00Z");
const request = "A0000000-0000-0000-0000-000000000001";
const form = (operation: string, values: Record<string, string> = {}) => {
  const f = new FormData();
  f.set("operation", operation);
  f.set("requestId", request);
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
describe("affairs input boundary", () => {
  it("preserves legacy omitted keys but saves explicit schedule and rejects reverse ranges", () => {
    const legacy = validateAffairsCommand(form("create_affairs_task", {title:"Interview"}),now);
    expect(legacy.input?.args).toHaveProperty("p_payload");
    expect((legacy.input?.args as {p_payload:object}).p_payload).not.toHaveProperty("planned_time");
    expect(validateAffairsCommand(form("create_affairs_task", {title:"Interview",due_date:"2026-10-08",planned_start_date:"2026-10-01",planned_time:"10:30"}),now).input).toMatchObject({args:{p_payload:{planned_start_date:"2026-10-01",planned_time:"10:30"}}});
    expect(validateAffairsCommand(form("create_affairs_task", {title:"Interview",due_date:"2026-10-08",planned_start_date:"2026-10-09"}),now).errors).toHaveProperty("planned_start_date");
    expect(validateAffairsCommand(form("create_affairs_task", {title:"Interview",planned_start_date:"",planned_time:""}),now).input).toMatchObject({args:{p_payload:{planned_start_date:null,planned_time:null}}});
  });
  it("counts Unicode code points and normalizes text", () => {
    const input = validateAffairsCommand(
      form("create_affairs_task", { title: " 😀".repeat(100).trim() }),
      now,
    ).input;
    expect(input).not.toBeNull();
    expect(
      validateAffairsCommand(
        form("create_affairs_task", { title: "😀".repeat(200) }),
        now,
      ).input,
    ).not.toBeNull();
    expect(
      validateAffairsCommand(
        form("create_affairs_task", { title: "😀".repeat(201) }),
        now,
      ).errors.title,
    ).toBeTruthy();
  });
  it("requires core goal and completion criteria; optional dates remain null", () => {
    expect(
      validateAffairsCommand(
        form("create_affairs_task", { title: "Read", is_core: "true" }),
        now,
      ).input,
    ).toBeNull();
    expect(
      validateAffairsCommand(
        form("create_affairs_task", { title: " Read ", description: "  " }),
        now,
      ).input,
    ).toMatchObject({
      args: {
        p_payload: {
          title: "Read",
          description: null,
          due_date: null,
          is_core: false,
        },
        p_request_id: request.toLowerCase(),
      },
    });
  });
  it("rejects invalid calendar dates but accepts future deadline", () => {
    expect(
      validateAffairsCommand(
        form("create_affairs_task", { title: "Read", due_date: "2026-02-30" }),
        now,
      ).input,
    ).toBeNull();
    expect(
      validateAffairsCommand(
        form("create_affairs_task", { title: "Read", due_date: "2027-02-28" }),
        now,
      ).input,
    ).not.toBeNull();
  });
  it("round trips Shanghai datetime and rejects future facts", () => {
    expect(shanghaiInput(now)).toBe("2026-10-03T18:00");
    expect(shanghaiTimestamp("2026-10-03T18:00")).toBe(now.toISOString());
    expect(
      validateAffairsCommand(
        form("record_affairs_penalty", {
          reason: "Manual",
          occurred_at: "2026-10-03T18:01",
        }),
        now,
      ).input,
    ).toBeNull();
  });
  it.each(["1", "1000000"])("accepts integer shop price %s", (price) => {
    expect(
      validateAffairsCommand(
        form("create_affairs_reward", { name: "Mine", price_coins: price }),
        now,
      ).input,
    ).not.toBeNull();
  });
  it.each(["0", "1.1", "1000001"])("rejects price %s", (price) => {
    expect(
      validateAffairsCommand(
        form("create_affairs_reward", { name: "Mine", price_coins: price }),
        now,
      ).input,
    ).toBeNull();
  });
  it("rejects unknown operations, extra identity/amount fields, duplicate fields", () => {
    expect(validateAffairsCommand(form("arbitrary"), now).input).toBeNull();
    expect(
      validateAffairsCommand(
        form("create_affairs_task", { title: "T", user_id: request }),
        now,
      ).input,
    ).toBeNull();
    expect(
      validateAffairsCommand(
        form("record_affairs_penalty", {
          reason: "R",
          amount: "100",
          occurred_at: "2026-10-03T17:00",
        }),
        now,
      ).input,
    ).toBeNull();
    const f = form("create_affairs_task", { title: "T" });
    f.append("title", "Other");
    expect(validateAffairsCommand(f, now).input).toBeNull();
  });
  it("preserves bigint decimal strings but refuses already imprecise numbers", () => {
    expect(decimalInteger("9007199254740993")).toBe("9007199254740993");
    expect(() => decimalInteger(9007199254740993)).toThrow();
    expect(() => decimalInteger("9223372036854775808")).toThrow();
  });
});
