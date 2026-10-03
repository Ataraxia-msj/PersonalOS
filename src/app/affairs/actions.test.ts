import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  claims: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { submitAffairsAction } from "./actions";
import { initialAffairsActionState } from "@/lib/affairs/action-state";
const form = () => {
  const f = new FormData();
  f.set("operation", "create_affairs_task");
  f.set("requestId", "a0000000-0000-0000-0000-000000000001");
  f.set("title", "Task");
  return f;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({
    auth: { getClaims: mocks.claims },
    rpc: mocks.rpc,
  });
  mocks.claims.mockResolvedValue({
    data: { claims: { sub: "u" } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({
    data: [
      {
        object_id: "o",
        object_revision: 1,
        command_id: "c",
        coin_delta: 0,
        balance_coins: 0,
        replayed: false,
      },
    ],
    error: null,
  });
});
describe("authenticated affairs action", () => {
  it("rejects invalid session before writes", async () => {
    mocks.claims.mockResolvedValue({ data: null, error: null });
    expect(
      (await submitAffairsAction(initialAffairsActionState, form())).status,
    ).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns field errors without RPC", async () => {
    const f = form();
    f.set("title", "");
    const r = await submitAffairsAction(initialAffairsActionState, f);
    expect(r.fieldErrors.title).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("validates once, writes once and refreshes only affairs", async () => {
    expect(
      (await submitAffairsAction(initialAffairsActionState, form())).status,
    ).toBe("success");
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.claims).toHaveBeenCalledTimes(1);
    expect(mocks.revalidate).toHaveBeenCalledWith("/affairs", "layout");
  });
  it.each([
    "insufficient_coins",
    "reward_price_changed",
    "stale_revision",
    "PGRST202",
  ])("maps %s explicitly", async (code) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: code === "PGRST202" ? code : "P0001", message: code },
    });
    const r = await submitAffairsAction(initialAffairsActionState, form());
    expect(r.status).toBe("error");
    expect(r.message).not.toContain(code);
  });
  it("retains success if post-write revalidation fails", async () => {
    mocks.revalidate.mockImplementationOnce(() => {
      throw new Error("refresh");
    });
    const r = await submitAffairsAction(initialAffairsActionState, form());
    expect(r.status).toBe("success");
    expect(r.message).toContain("已保存，请刷新查看");
  });
  it("reports uncertain network outcome without claiming failure", async () => {
    mocks.rpc.mockRejectedValue(new Error("network"));
    expect(
      (await submitAffairsAction(initialAffairsActionState, form())).status,
    ).toBe("uncertain");
  });
});
