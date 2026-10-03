"use server";

import { revalidatePath } from "next/cache";

import { confirmAgentTransaction } from "@/lib/agent/confirm";
import { interpretAgentMessage } from "@/lib/agent/orchestrator";
import { QwenProviderError } from "@/lib/agent/qwen";
import type {
  AgentActionResult,
  AgentConfirmationResult,
  AgentTransactionDraft,
} from "@/lib/agent/types";
import { IncomeMutationError } from "@/lib/finance/income-mutations";
import { FinanceMutationError } from "@/lib/finance/mutations";
import { getAgentFinanceOptions } from "@/lib/finance/service";
import { createClient } from "@/lib/supabase/server";

const providerMessages: Record<QwenProviderError["code"], string> = {
  configuration_missing: "Agent 尚未完成千问服务配置，请检查服务端环境变量。",
  provider_rejected: "Agent 服务暂时不可用，请稍后重试。",
  provider_timeout: "Agent 识别超时，请稍后重新提交。",
  response_incomplete: "Agent 返回不完整，请重新提交这段内容。",
  response_invalid: "Agent 没有返回可安全处理的结果，请换一种说法后重试。",
};

const failure = (message: string): AgentActionResult => ({
  interpretation: null,
  message,
  status: "error",
});

export async function interpretAgentMessageAction(rawText: string): Promise<AgentActionResult> {
  let client;
  try {
    client = await createClient();
    const { data, error } = await client.auth.getClaims();
    if (error || !data?.claims?.sub) return failure("登录状态已失效，请重新登录后再使用 Agent。");
  } catch {
    return failure("暂时无法验证登录状态，请刷新页面后重试。");
  }

  const message = rawText.trim();
  if (!message) return failure("请输入需要 Agent 处理的内容。");
  if ([...message].length > 4000) return failure("单次输入不能超过 4000 个字符。");

  try {
    const interpretation = await interpretAgentMessage(message);
    return {
      interpretation,
      message: interpretation.message,
      status: "success",
    };
  } catch (error) {
    if (error instanceof QwenProviderError) return failure(providerMessages[error.code]);
    return failure("Agent 处理失败，请稍后重试。没有执行任何财务操作。");
  }
}

const confirmationFailure = (
  message: string,
  status: "error" | "uncertain" = "error",
): AgentConfirmationResult => ({ entryId: null, message, status });

function definitelyRolledBack(error: unknown) {
  if (!(error instanceof FinanceMutationError) && !(error instanceof IncomeMutationError)) return false;
  if (error.code === "PGRST202") return true;
  return Boolean(error.code && /^(22|23|40|42|55|57)[0-9A-Z]{3}$/.test(error.code));
}

export async function confirmAgentTransactionAction(
  draft: AgentTransactionDraft,
): Promise<AgentConfirmationResult> {
  let client;
  try {
    client = await createClient();
    const { data, error } = await client.auth.getClaims();
    if (error || !data?.claims?.sub) {
      return confirmationFailure("登录状态已失效，请重新登录后再确认交易。");
    }
  } catch {
    return confirmationFailure("暂时无法验证登录状态，请刷新页面后重试。");
  }

  try {
    const options = await getAgentFinanceOptions(client);
    const result = await confirmAgentTransaction(client, draft, options, new Date());
    if (result.status === "success" || result.status === "warning") {
      try {
        revalidatePath("/finance", "layout");
      } catch {
        return {
          ...result,
          message: `${result.message} 页面刷新失败，请手动刷新财务页面，不要重复提交。`,
        };
      }
    }
    return result;
  } catch (error) {
    if (definitelyRolledBack(error)) {
      return confirmationFailure("数据库未接受本次交易，请刷新后重新生成预览。");
    }
    return confirmationFailure(
      "尚未确认保存结果。请保留当前预览，不要重新生成或重复提交。",
      "uncertain",
    );
  }
}
