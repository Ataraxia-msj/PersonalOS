"use server";

import { interpretAgentMessage } from "@/lib/agent/orchestrator";
import { QwenProviderError } from "@/lib/agent/qwen";
import type { AgentActionResult } from "@/lib/agent/types";
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
