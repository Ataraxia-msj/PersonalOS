import { financeInterpretationJsonSchema, parseModelInterpretation } from "./schema";
import type { AgentInterpretationContext, ModelInterpretation } from "./types";
import { requestQwenJson, type QwenClientOptions } from "./qwen-client";
export { QwenProviderError } from "./qwen-client";
export type { QwenProviderErrorCode, QwenClientOptions } from "./qwen-client";

const systemPrompt = `你是 Personal OS 的财务指令解析器。只提取用户明确表达的支出、收入和转账，不执行操作。
必须保持交易在原文中的顺序；一句话里有多笔交易就输出多个数组项，不能合并金额。
只可使用候选列表中提供的 ID；无法确定时填 null，不得猜测。相对日期按提供的北京时间解析。
支出使用 accountId/categoryId；收入使用 accountId/categoryId；转账使用 fromAccountId/toAccountId/purpose。
普通转账 purpose=general 且 budgetBucketId=null。储蓄、投资、还款分别使用 saving、investment、debt。
“不计预算”仅对对应支出设置 excludeFromBudget=true，并令 budgetBucketId=null。
不适用字段必须为 null。无法安全归入交易的原文片段放入 unresolvedSegments。`;
export function interpretFinanceMessage(context: AgentInterpretationContext, options: QwenClientOptions = {}): Promise<ModelInterpretation> {
  return requestQwenJson({
    name: "personal_os_finance_interpretation", schema: financeInterpretationJsonSchema,
    systemPrompt, context, parse: parseModelInterpretation,
  }, options);
}
