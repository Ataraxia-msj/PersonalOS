// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { AgentInterpretationContext } from "./types";
import { interpretFinanceMessage } from "./qwen";

const context: AgentInterpretationContext = {
  accounts: [{ accountClass: "asset", currency: "CNY", id: "account-1", name: "微信" }],
  budgetBuckets: [{ id: "bucket-1", kind: "expense", name: "变动必要开销" }],
  expenseCategories: [{ defaultBudgetBucketId: "bucket-1", id: "category-1", name: "餐饮" }],
  incomeCategories: [{ id: "income-1", name: "工资" }],
  nowShanghai: "2026-10-03T09:30",
  rawText: "微信早餐12元",
};

const validContent = JSON.stringify({
  message: "识别到一笔支出。",
  transactions: [{
    accountId: "account-1",
    amount: 12,
    budgetBucketId: "bucket-1",
    categoryId: "category-1",
    description: "早餐",
    excludeFromBudget: false,
    fromAccountId: null,
    memo: null,
    occurredAt: "2026-10-03T09:30",
    purpose: null,
    sourceText: "微信早餐12元",
    toAccountId: null,
    type: "expense",
  }],
  unresolvedSegments: [],
});

function providerResponse(content = validContent, finishReason = "stop") {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: finishReason, message: { content } }],
  }), { headers: { "content-type": "application/json" }, status: 200 });
}

describe("interpretFinanceMessage", () => {
  it("sends server credentials and strict non-thinking JSON Schema configuration", async () => {
    const fetcher = vi.fn().mockResolvedValue(providerResponse());

    const result = await interpretFinanceMessage(context, {
      apiKey: "server-secret",
      baseUrl: "https://workspace.example.com/compatible-mode/v1/",
      fetcher,
      model: "qwen3.7-flash-2026-07-15",
    });

    expect(result.transactions[0]?.amount).toBe(12);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://workspace.example.com/compatible-mode/v1/chat/completions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer server-secret");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      enable_thinking: false,
      model: "qwen3.7-flash-2026-07-15",
      response_format: {
        json_schema: { name: "personal_os_finance_interpretation", strict: true },
        type: "json_schema",
      },
    });
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
  });

  it("fails before network access when server configuration is absent", async () => {
    const fetcher = vi.fn();

    await expect(interpretFinanceMessage(context, {
      apiKey: "",
      baseUrl: "",
      fetcher,
      model: "",
    })).rejects.toMatchObject({ code: "configuration_missing" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["provider status", new Response("rate limited", { status: 429 }), "provider_rejected"],
    ["truncated result", providerResponse(validContent, "length"), "response_incomplete"],
    ["invalid JSON", providerResponse("not-json"), "response_invalid"],
  ])("maps %s to a safe provider error", async (_name, response, code) => {
    await expect(interpretFinanceMessage(context, {
      apiKey: "secret",
      baseUrl: "https://example.com/v1",
      fetcher: vi.fn().mockResolvedValue(response),
      model: "qwen-test",
    })).rejects.toMatchObject({ code });
  });

  it("aborts a provider request that exceeds the timeout", async () => {
    const fetcher = vi.fn<typeof fetch>((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));

    await expect(interpretFinanceMessage(context, {
      apiKey: "secret",
      baseUrl: "https://example.com/v1",
      fetcher,
      model: "qwen-test",
      timeoutMs: 5,
    })).rejects.toMatchObject({ code: "provider_timeout" });
  });
});
