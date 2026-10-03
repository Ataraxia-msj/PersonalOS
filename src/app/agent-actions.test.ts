// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { interpretAgentMessage } from "@/lib/agent/orchestrator";
import { confirmAgentTransaction } from "@/lib/agent/confirm";
import { QwenProviderError } from "@/lib/agent/qwen";
import { getAgentFinanceOptions } from "@/lib/finance/service";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AgentTransactionDraft } from "@/lib/agent/types";

import { confirmAgentTransactionAction, interpretAgentMessageAction } from "./agent-actions";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/agent/orchestrator", () => ({ interpretAgentMessage: vi.fn() }));
vi.mock("@/lib/agent/confirm", () => ({ confirmAgentTransaction: vi.fn() }));
vi.mock("@/lib/finance/service", () => ({ getAgentFinanceOptions: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const getClaims = vi.fn();
const client = { auth: { getClaims } };
const interpretation = {
  message: "识别到两笔支出。",
  transactions: [{ draftId: "draft-1" }, { draftId: "draft-2" }],
  unresolvedSegments: [],
} as never;
const draft: AgentTransactionDraft = {
  accountId: "10000000-0000-4000-8000-000000000001",
  accountName: "微信",
  amount: 12,
  budgetBucketId: "20000000-0000-4000-8000-000000000001",
  budgetBucketName: "变动必要开销",
  categoryId: "30000000-0000-4000-8000-000000000001",
  categoryName: "餐饮",
  description: "早餐",
  draftId: "50000000-0000-4000-8000-000000000001",
  excludeFromBudget: false,
  fromAccountId: null,
  fromAccountName: null,
  issues: [],
  memo: null,
  occurredAt: "2026-10-03T08:10",
  purpose: null,
  rawText: "微信早餐12",
  requestId: null,
  sourceText: "微信早餐12",
  status: "ready",
  toAccountId: null,
  toAccountName: null,
  type: "expense",
};

describe("interpretAgentMessageAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(client as never);
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    vi.mocked(interpretAgentMessage).mockResolvedValue(interpretation);
    vi.mocked(getAgentFinanceOptions).mockResolvedValue({} as never);
    vi.mocked(confirmAgentTransaction).mockResolvedValue({
      entryId: "entry-1",
      message: "支出已记录，财务数据已刷新。",
      status: "success",
    });
  });

  it("returns authenticated multi-draft interpretation", async () => {
    await expect(interpretAgentMessageAction("  微信早餐12，地铁3块  ")).resolves.toEqual({
      interpretation,
      message: "识别到两笔支出。",
      status: "success",
    });
    expect(interpretAgentMessage).toHaveBeenCalledWith("微信早餐12，地铁3块");
  });

  it("rejects an expired session before invoking Qwen", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });

    await expect(interpretAgentMessageAction("微信早餐12")).resolves.toMatchObject({
      interpretation: null,
      message: expect.stringMatching(/登录/),
      status: "error",
    });
    expect(interpretAgentMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["", /输入/],
    ["a".repeat(4001), /4000/],
  ])("rejects invalid input without invoking Qwen", async (input, message) => {
    await expect(interpretAgentMessageAction(input)).resolves.toMatchObject({ status: "error", message: expect.stringMatching(message) });
    expect(interpretAgentMessage).not.toHaveBeenCalled();
  });

  it.each([
    [new QwenProviderError("configuration_missing"), /配置/],
    [new QwenProviderError("provider_timeout"), /超时/],
    [new QwenProviderError("provider_rejected"), /暂时/],
    [new QwenProviderError("response_incomplete"), /重新/],
  ])("maps provider failures to safe user messages", async (error, message) => {
    vi.mocked(interpretAgentMessage).mockRejectedValueOnce(error);
    await expect(interpretAgentMessageAction("记录午饭")).resolves.toMatchObject({
      interpretation: null,
      message: expect.stringMatching(message),
      status: "error",
    });
  });

  it("never returns an unexpected error or embedded credential", async () => {
    vi.mocked(interpretAgentMessage).mockRejectedValueOnce(new Error("sk-private-key provider payload"));
    const result = await interpretAgentMessageAction("记录午饭");

    expect(result.status).toBe("error");
    expect(result.message).not.toContain("sk-private-key");
    expect(result.message).not.toContain("provider payload");
  });
});

describe("confirmAgentTransactionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(client as never);
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    vi.mocked(getAgentFinanceOptions).mockResolvedValue({} as never);
    vi.mocked(confirmAgentTransaction).mockResolvedValue({
      entryId: "entry-1",
      message: "支出已记录，财务数据已刷新。",
      status: "success",
    });
  });

  it("uses one authenticated client, reloads current options, and confirms without invoking Qwen", async () => {
    await expect(confirmAgentTransactionAction(draft)).resolves.toEqual({
      entryId: "entry-1",
      message: "支出已记录，财务数据已刷新。",
      status: "success",
    });
    expect(getAgentFinanceOptions).toHaveBeenCalledWith(client);
    expect(confirmAgentTransaction).toHaveBeenCalledWith(client, draft, {}, expect.any(Date));
    expect(interpretAgentMessage).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/finance", "layout");
  });

  it("does not write when authentication has expired", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    await expect(confirmAgentTransactionAction(draft)).resolves.toMatchObject({
      entryId: null,
      message: expect.stringMatching(/登录/),
      status: "error",
    });
    expect(confirmAgentTransaction).not.toHaveBeenCalled();
  });

  it("preserves a successful RPC warning and refreshes Finance", async () => {
    vi.mocked(confirmAgentTransaction).mockResolvedValue({
      entryId: "entry-1",
      message: "支出已记录；该月预算尚未建立。",
      status: "warning",
    });
    await expect(confirmAgentTransactionAction(draft)).resolves.toMatchObject({ status: "warning" });
    expect(revalidatePath).toHaveBeenCalledOnce();
  });

  it("returns a safe uncertain state for an unexpected mutation failure", async () => {
    vi.mocked(confirmAgentTransaction).mockRejectedValue(new Error("database secret payload"));
    const result = await confirmAgentTransactionAction(draft);
    expect(result).toEqual({
      entryId: null,
      message: "尚未确认保存结果。请保留当前预览，不要重新生成或重复提交。",
      status: "uncertain",
    });
    expect(result.message).not.toContain("database secret payload");
  });
});
