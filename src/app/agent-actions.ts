"use server";

import { revalidatePath } from "next/cache";
import {randomUUID} from 'node:crypto';
import {handleFinanceTurn} from '@/lib/agent/conversation/orchestrator';
import {parseFinanceTurnInput} from '@/lib/agent/conversation/validation';
import {editable,protectedConversation} from '@/lib/agent/conversation/state';
import type {AgentTurnResult,FinanceTurnInput} from '@/lib/agent/conversation/types';
import {interpretFinanceTurn} from '@/lib/agent/qwen';

import { confirmAgentTransaction } from "@/lib/agent/confirm";
import { interpretAgentMessage } from "@/lib/agent/orchestrator";
import { classifyAgentMessage } from '@/lib/agent/intent';
import { interpretAffairsMessage } from '@/lib/agent/affairs/orchestrator';
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

  if(typeof rawText !== 'string')return failure('请输入文字。');
  const message = rawText.trim();
  if (!message) return failure("请输入需要 Agent 处理的内容。");
  if ([...message].length > 4000) return failure("单次输入不能超过 4000 个字符。");

  try {
    const domain=await classifyAgentMessage(message);
    if(domain==='mixed')return failure('请将财务交易和事务分别发送，这次没有保存任何内容。');
    if(domain==='unsupported')return failure('目前支持记录财务交易，以及新建主线、项目、行动或收集内容；暂不支持此操作。');
    const interpretation=domain==='affairs'
      ? await interpretAffairsMessage(message,client)
      : {domain:'finance' as const,...await interpretAgentMessage(message,new Date(),{loadOptions:()=>getAgentFinanceOptions(client)})};
    return {
      interpretation,
      message: interpretation.message,
      status: "success",
    };
  } catch (error) {
    if (error instanceof QwenProviderError) return failure(providerMessages[error.code]);
    return failure("Agent 处理失败，请稍后重试。没有保存任何内容。");
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
  expectedOwnerId?:string,
): Promise<AgentConfirmationResult> {
  let client;
  try {
    client = await createClient();
    const { data, error } = await client.auth.getClaims();
    if (error || !data?.claims?.sub) {
      return confirmationFailure("登录状态已失效，请重新登录后再确认交易。");
    }
    if(expectedOwnerId!==undefined&&expectedOwnerId!==data.claims.sub)return confirmationFailure('登录用户已改变，请刷新页面后重新录入。');
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

export async function getAgentIdentityAction():Promise<{status:'success';ownerId:string}|{status:'error';message:string}> {
 try{const client=await createClient();const {data,error}=await client.auth.getClaims();if(error||!data?.claims?.sub)return {status:'error',message:'登录状态已失效，请重新登录。'};return {status:'success',ownerId:data.claims.sub};}
 catch{return {status:'error',message:'暂时无法验证登录状态，请稍后重试。'};}
}

export async function interpretAgentTurnAction(value:unknown):Promise<AgentTurnResult> {
 let input:FinanceTurnInput;
 try{input=parseFinanceTurnInput(value);}catch{return {status:'error',domain:null,message:'会话内容无效或超过限制，原草稿未改变。',turnId:'',baseRevision:0};}
 const failure=(message:string,identityChanged=false):AgentTurnResult=>({status:'error',domain:null,message,turnId:input.turnId,baseRevision:input.baseRevision,identityChanged});
 let client;
 try{client=await createClient();const {data,error}=await client.auth.getClaims();if(error||!data?.claims?.sub)return failure('登录状态已失效，请重新登录。',true);if(data.claims.sub!==input.ownerId)return failure('登录用户已改变，请刷新页面后重新录入。',true);}
 catch{return failure('暂时无法验证登录状态，请稍后重试。');}
 try{
  if(input.state&&protectedConversation(input.state))return failure('有交易正在保存或结果待核对，请先处理。');
  const options=await getAgentFinanceOptions(client);
  const active=Boolean(input.state&&(input.state.items.some(editable)||input.state.intentSeed));
  const turnText=input.turn.kind==='text'?input.turn.rawText:'';
  if(input.turn.kind==='text'&&!active&&!options.accounts.some(a=>a.name===turnText.trim())){
   const domain=await classifyAgentMessage(input.turn.rawText);
   if(domain==='affairs'){const interpretation=await interpretAffairsMessage(input.turn.rawText,client);return {status:'success',domain:'affairs',interpretation,message:interpretation.message,turnId:input.turnId,baseRevision:input.baseRevision,ownerId:input.ownerId};}
   if(domain!=='finance')return failure(domain==='mixed'?'请将财务和事务分开发送；没有保存任何内容。':'目前只支持记录财务交易和新建事务。');
  }
  const result=await handleFinanceTurn(input,options,{now:new Date(),uuid:randomUUID,interpret:interpretFinanceTurn});
  if(result.routeDomain==='affairs'&&input.turn.kind==='text'){const interpretation=await interpretAffairsMessage(input.turn.rawText,client);return {status:'success',domain:'affairs',interpretation,message:interpretation.message,turnId:input.turnId,baseRevision:input.baseRevision,ownerId:input.ownerId};}
  if(result.routeDomain)return failure(result.routeDomain==='mixed'?'请将财务和事务分开发送；当前草稿保留。':'这项操作暂不支持，当前草稿保留。');
  return {status:'success',domain:'finance',state:result.state,options,message:result.message,turnId:input.turnId,baseRevision:input.baseRevision,ownerId:input.ownerId};
 }catch(error){return failure(error instanceof QwenProviderError?providerMessages[error.code]:'未能安全更新预览，原草稿保留。请换一种说法或使用选项。');}
}
