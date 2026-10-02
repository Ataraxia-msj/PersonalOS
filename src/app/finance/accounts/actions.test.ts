// @vitest-environment node

import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccountManagementMutationError,
  createManagedAccount,
  setManagedAccountActive,
  updateManagedAccount,
} from "@/lib/finance/account-management-mutations";
import { createClient } from "@/lib/supabase/server";

import {
  createAccountAction,
  setAccountActiveAction,
  updateAccountAction,
} from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/finance/account-management-mutations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/finance/account-management-mutations")>();
  return {
    ...actual,
    createManagedAccount: vi.fn(),
    setManagedAccountActive: vi.fn(),
    updateManagedAccount: vi.fn(),
  };
});

const accountId = "a2000000-0000-0000-0000-000000000001";
const requestId = "a1000000-0000-0000-0000-000000000001";
const getClaims = vi.fn();
const client = { auth: { getClaims } };

function createForm() {
  const data = new FormData();
  Object.entries({ requestId, name: "日常账户", accountClass: "asset", accountType: "bank",
    currency: "CNY", institution: "建设银行", sortOrder: "0", note: "",
    initialBalance: "123.45", balanceAt: "2026-01-02T09:30" })
    .forEach(([key, value]) => data.set(key, value));
  data.set("includeInNetWorth", "on");
  return data;
}

function updateForm() {
  const data = createForm();
  data.set("accountId", accountId);
  data.set("expectedUpdatedAt", "2026-01-01T00:00:00.000Z");
  return data;
}

function activeForm() {
  const data = new FormData();
  data.set("accountId", accountId);
  data.set("expectedUpdatedAt", "2026-01-01T00:00:00.000Z");
  data.set("isActive", "false");
  return data;
}

describe("account management actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(client as never);
    getClaims.mockResolvedValue({ data: { claims: { sub: "user" } }, error: null });
    vi.mocked(createManagedAccount).mockResolvedValue({ accountId, snapshotId: requestId, updatedAt: "v2", replayed: false });
    vi.mocked(updateManagedAccount).mockResolvedValue({ accountId, structureLocked: true, updatedAt: "v2" });
    vi.mocked(setManagedAccountActive).mockResolvedValue({ accountId, isActive: false, updatedAt: "v2" });
  });

  it("verifies claims, creates once, and refreshes Finance only after confirmed success", async () => {
    const result = await createAccountAction({ status: "idle", message: null, fieldErrors: {} }, createForm());
    expect(getClaims).toHaveBeenCalledOnce();
    expect(createManagedAccount).toHaveBeenCalledWith(client, expect.objectContaining({
      initialBalance: 123.45, requestId,
    }));
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/finance", "layout");
    expect(result).toMatchObject({ status: "success", accountId });
  });

  it("does not validate or write without verified claims", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    const invalid = createForm(); invalid.set("initialBalance", "bad");
    await expect(createAccountAction({ status: "idle", message: null, fieldErrors: {} }, invalid))
      .resolves.toMatchObject({ status: "error", message: expect.stringMatching(/登录/) });
    expect(createManagedAccount).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns field errors and never calls RPC wrappers for invalid input", async () => {
    const invalid = createForm(); invalid.set("initialBalance", "-1");
    const result = await createAccountAction({ status: "idle", message: null, fieldErrors: {} }, invalid);
    expect(result.fieldErrors.initialBalance).toBeDefined();
    expect(createManagedAccount).not.toHaveBeenCalled();
  });

  it("updates metadata and activation with the same authenticated client", async () => {
    await expect(updateAccountAction({ status: "idle", message: null, fieldErrors: {} }, updateForm()))
      .resolves.toMatchObject({ status: "success", accountId });
    await expect(setAccountActiveAction({ status: "idle", message: null, fieldErrors: {} }, activeForm()))
      .resolves.toMatchObject({ status: "success", accountId });
    expect(updateManagedAccount).toHaveBeenCalledWith(client, expect.objectContaining({ accountId }));
    expect(setManagedAccountActive).toHaveBeenCalledWith(client, expect.objectContaining({ accountId, isActive: false }));
  });

  it.each([
    ["account_name_conflict", /名称/],
    ["account_not_found", /不存在/],
    ["stale_account", /刷新/],
    ["account_structure_locked", /已有余额或交易/],
    ["request_payload_conflict", /请求标识/],
    ["invalid_account_name", /名称/],
    ["invalid_account_text", /机构或备注/],
    ["invalid_account_class_type", /类型/],
    ["invalid_account_currency", /币种/],
    ["invalid_include_in_net_worth", /净资产/],
    ["invalid_account_sort_order", /排序/],
    ["invalid_initial_balance", /余额/],
    ["invalid_balance_time", /时间/],
  ])("maps %s to safe Chinese copy", async (databaseMessage, expected) => {
    vi.mocked(createManagedAccount).mockRejectedValueOnce(new AccountManagementMutationError(databaseMessage, "22023"));
    const result = await createAccountAction({ status: "idle", message: null, fieldErrors: {} }, createForm());
    expect(result).toMatchObject({ status: "error", message: expect.stringMatching(expected) });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a missing migration and marks an unknown post-RPC failure as uncertain", async () => {
    vi.mocked(createManagedAccount).mockRejectedValueOnce(new AccountManagementMutationError("function create_account missing", "PGRST202"));
    await expect(createAccountAction({ status: "idle", message: null, fieldErrors: {} }, createForm()))
      .resolves.toMatchObject({ status: "error", message: expect.stringMatching(/migration/) });

    vi.mocked(createManagedAccount).mockRejectedValueOnce(new Error("fetch failed"));
    await expect(createAccountAction({ status: "idle", message: null, fieldErrors: {} }, createForm()))
      .resolves.toMatchObject({ status: "uncertain" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("describes an idempotent replay without claiming a second account", async () => {
    vi.mocked(createManagedAccount).mockResolvedValueOnce({ accountId, snapshotId: requestId, updatedAt: "v2", replayed: true });
    const result = await createAccountAction({ status: "idle", message: null, fieldErrors: {} }, createForm());
    expect(result.message).toMatch(/已存在|已完成/);
    expect(result.message).not.toMatch(/新建成功/);
  });
});
