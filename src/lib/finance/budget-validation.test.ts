import { describe, expect, it } from "vitest";
import { moneyToCents, validateBudgetForm, shanghaiDate } from "./budget-validation";

const bucket = "82000000-0000-0000-0000-000000000001";
function form() {
  const data = new FormData();
  data.set("month", "2026-09");
  data.set("plannedIncome", "5000");
  data.set(`allocation:${bucket}`, "12.34");
  return data;
}
describe("budget inputs", () => {
  it("keeps money exact in cents and rejects empty/negative/precision/overflow", () => {
    expect(moneyToCents("0.10")).toBe(10);
    expect(moneyToCents("0")).toBe(0);
    for (const value of ["", "-1", "1.001", "NaN", "Infinity", "1000000000000", "1e3"]) {
      expect(moneyToCents(value)).toBeNull();
    }
  });
  it("produces a single save payload without status or selection", () => {
    expect(validateBudgetForm(form())).toEqual({ errors: {}, args: {
      p_month: "2026-09-01", p_planned_income: 5000,
      p_allocations: [{ budget_bucket_id: bucket, planned_amount: 12.34 }],
      p_period_id: null, p_expected_updated_at: null,
    } });
  });
  it("rejects invalid months, duplicate allocations and edit without version", () => {
    const data = form();
    data.set("month", "2026-13");
    data.append(`allocation:${bucket}`, "10");
    data.set("periodId", "84000000-0000-0000-0000-000000000001");
    const result = validateBudgetForm(data);
    expect(result.args).toBeNull();
    expect(result.errors.month).toBeTruthy();
    expect(result.errors.allocations).toBeTruthy();
    expect(result.errors.version).toBeTruthy();
  });
  it("uses the Shanghai date at the UTC month boundary", () => {
    expect(shanghaiDate(new Date("2026-09-30T15:59:59Z"))).toBe("2026-09-30");
    expect(shanghaiDate(new Date("2026-09-30T16:00:00Z"))).toBe("2026-10-01");
  });
});
