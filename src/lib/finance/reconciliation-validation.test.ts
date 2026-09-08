import { describe, expect, it } from "vitest";
import { validateReconciliationInput } from "./reconciliation-validation";

const accountId = "81000000-0000-0000-0000-000000000001";
function form(changes: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({ accountId, snapshotAt: "2026-09-08T14:00:00", balance: "423.50", note: " 核对微信 ", ...changes })
    .forEach(([key, value]) => data.set(key, value));
  return data;
}
const now = new Date("2026-09-08T06:10:00Z");
describe("reconciliation input", () => {
  it("converts explicit Shanghai observation time and trims the note", () => {
    expect(validateReconciliationInput(form(), now).input).toEqual({
      accountId, snapshotAt: "2026-09-08T06:00:00.000Z", balance: 423.5, note: "核对微信",
    });
  });
  it.each(["-1", "NaN", "Infinity", "1.001", "1e3", "1000000000000", ""])("rejects invalid balance %s", (balance) => {
    expect(validateReconciliationInput(form({ balance }), now).input).toBeNull();
  });
  it("accepts zero outstanding debt", () => {
    expect(validateReconciliationInput(form({ balance: "0" }), now).input?.balance).toBe(0);
  });
  it.each(["2026-02-30T10:00:00", "2026-09-08T14:20:00", "not a date"])("rejects invalid or future timestamp %s", (snapshotAt) => {
    expect(validateReconciliationInput(form({ snapshotAt }), now).input).toBeNull();
  });
  it("rejects malformed account IDs and overlong notes", () => {
    expect(validateReconciliationInput(form({ accountId: "bad", note: "x".repeat(1001) }), now).errors)
      .toEqual(expect.objectContaining({ accountId: expect.any(String), note: expect.any(String) }));
  });
});
