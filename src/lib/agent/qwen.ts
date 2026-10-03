import { financeInterpretationJsonSchema, parseModelInterpretation } from "./schema";
import type { AgentInterpretationContext, ModelInterpretation } from "./types";

export type QwenProviderErrorCode =
  | "configuration_missing"
  | "provider_rejected"
  | "provider_timeout"
  | "response_incomplete"
  | "response_invalid";

export class QwenProviderError extends Error {
  constructor(readonly code: QwenProviderErrorCode) {
    super(code);
    this.name = "QwenProviderError";
  }
}

interface QwenClientOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

const systemPrompt = `你是 Personal OS 的财务指令解析器。只提取用户明确表达的支出、收入和转账，不执行操作。
必须保持交易在原文中的顺序；一句话里有多笔交易就输出多个数组项，不能合并金额。
只可使用候选列表中提供的 ID；无法确定时填 null，不得猜测。相对日期按提供的北京时间解析。
支出使用 accountId/categoryId；收入使用 accountId/categoryId；转账使用 fromAccountId/toAccountId/purpose。
普通转账 purpose=general 且 budgetBucketId=null。储蓄、投资、还款分别使用 saving、investment、debt。
“不计预算”仅对对应支出设置 excludeFromBudget=true，并令 budgetBucketId=null。
不适用字段必须为 null。无法安全归入交易的原文片段放入 unresolvedSegments。`;

function providerConfig(options: QwenClientOptions) {
  return {
    apiKey: options.apiKey ?? process.env.DASHSCOPE_API_KEY ?? "",
    baseUrl: (options.baseUrl ?? process.env.QWEN_BASE_URL ?? "").replace(/\/+$/, ""),
    fetcher: options.fetcher ?? fetch,
    model: options.model ?? process.env.QWEN_MODEL ?? "qwen3.7-flash-2026-07-15",
    timeoutMs: options.timeoutMs ?? 30_000,
  };
}

export async function interpretFinanceMessage(
  context: AgentInterpretationContext,
  options: QwenClientOptions = {},
): Promise<ModelInterpretation> {
  const config = providerConfig(options);
  if (!config.apiKey || !config.baseUrl || !config.model) {
    throw new QwenProviderError("configuration_missing");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  try {
    response = await config.fetcher(`${config.baseUrl}/chat/completions`, {
      body: JSON.stringify({
        enable_thinking: false,
        max_completion_tokens: 4096,
        messages: [
          { content: systemPrompt, role: "system" },
          { content: JSON.stringify(context), role: "user" },
        ],
        model: config.model,
        response_format: {
          json_schema: {
            name: "personal_os_finance_interpretation",
            schema: financeInterpretationJsonSchema,
            strict: true,
          },
          type: "json_schema",
        },
        stream: false,
        temperature: 0.1,
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new QwenProviderError("provider_timeout");
    }
    throw new QwenProviderError("provider_rejected");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new QwenProviderError("provider_rejected");

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new QwenProviderError("response_invalid");
  }
  if (typeof payload !== "object" || payload === null || !("choices" in payload)
    || !Array.isArray(payload.choices) || payload.choices.length !== 1) {
    throw new QwenProviderError("response_invalid");
  }
  const choice = payload.choices[0];
  if (typeof choice !== "object" || choice === null || !("finish_reason" in choice)
    || choice.finish_reason !== "stop") {
    throw new QwenProviderError("response_incomplete");
  }
  if (!("message" in choice) || typeof choice.message !== "object" || choice.message === null
    || !("content" in choice.message) || typeof choice.message.content !== "string") {
    throw new QwenProviderError("response_invalid");
  }
  try {
    return parseModelInterpretation(JSON.parse(choice.message.content));
  } catch {
    throw new QwenProviderError("response_invalid");
  }
}
