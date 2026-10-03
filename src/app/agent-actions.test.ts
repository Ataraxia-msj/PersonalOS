// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { interpretAgentMessage } from "@/lib/agent/orchestrator";
import { QwenProviderError } from "@/lib/agent/qwen";
import { createClient } from "@/lib/supabase/server";

import { interpretAgentMessageAction } from "./agent-actions";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/agent/orchestrator", () => ({ interpretAgentMessage: vi.fn() }));

const getClaims = vi.fn();
const client = { auth: { getClaims } };
const interpretation = {
  message: "识别到两笔支出。",
  transactions: [{ draftId: "draft-1" }, { draftId: "draft-2" }],
  unresolvedSegments: [],
} as never;

describe("interpretAgentMessageAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(client as never);
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    vi.mocked(interpretAgentMessage).mockResolvedValue(interpretation);
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
