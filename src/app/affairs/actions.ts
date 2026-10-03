"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateAffairsCommand } from "@/lib/affairs/validation";
import type { AffairsActionState } from "@/lib/affairs/action-state";
import type { AffairsReceipt } from "@/lib/affairs/types";
import { executeFoundationCommand } from "@/lib/affairs/foundation-mutations";
import { executeRewardCommand } from "@/lib/affairs/reward-mutations";
import { AffairsDatabaseError } from "@/lib/affairs/mutation-result";
const messages: Record<string, string> = {
  authentication_required: "登录已失效，请重新登录。",
  invalid_payload: "输入内容无效，请检查表单。",
  invalid_request_id: "提交标识无效，请重新打开表单。",
  not_found: "记录不存在或你无权访问。",
  ownership_mismatch: "所选关联不匹配，请重新选择。",
  stale_revision: "内容已被修改，请刷新后重新确认。",
  request_payload_conflict: "这次提交已使用其他内容，请先核对原提交。",
  invalid_state_transition: "当前状态不允许此操作，请刷新核对。",
  core_eligibility_locked: "完成过的任务不能改变金币资格。",
  project_requires_completion: "请先完成阶段成果和核心行动，再确认项目成果。",
  reward_price_changed:
    "奖励价格或版本已变化，请刷新并重新确认，不会按新价自动兑换。",
  reward_unavailable: "该奖励已下架，暂时不能兑换。",
  insufficient_coins: "金币余额不足，不能兑换。",
  redemption_already_used: "奖励已使用，不能取消退款。",
  already_reversed: "已经撤销或取消，不能重复处理。",
};
export async function submitAffairsAction(
  _previous: AffairsActionState,
  data: FormData,
): Promise<AffairsActionState> {
  try {
    const client = await createClient();
    const { data: session, error } = await client.auth.getClaims();
    if (error || !session?.claims.sub)
      return {
        status: "error",
        fieldErrors: {},
        message: messages.authentication_required,
        receipt: null,
      };
    const validated = validateAffairsCommand(data, new Date());
    if (!validated.input)
      return {
        status: "error",
        fieldErrors: validated.errors,
        message: "请检查输入内容。",
        receipt: null,
      };
    const command = validated.input;
    let receipt: AffairsReceipt;
    switch (command.operation) {
      case "create_affairs_mainline":
      case "create_affairs_project":
      case "create_affairs_task":
      case "update_affairs_mainline":
      case "update_affairs_project":
      case "update_affairs_task":
      case "set_affairs_mainline_status":
      case "set_affairs_project_status":
      case "set_affairs_task_status":
      case "set_affairs_mainline_focus":
      case "save_affairs_milestones":
      case "set_affairs_milestone_completed":
      case "record_affairs_progress":
        receipt = await executeFoundationCommand(client, command);
        break;
      case "complete_affairs_task":
      case "reopen_affairs_task":
      case "undo_affairs_task_completion":
      case "create_affairs_reward":
      case "update_affairs_reward":
      case "redeem_affairs_reward":
      case "record_affairs_penalty":
      case "reverse_affairs_penalty":
      case "use_affairs_redemption":
      case "cancel_affairs_redemption":
        receipt = await executeRewardCommand(client, command);
        break;
    }
    let message = receipt.replayed
      ? "已核对原提交，没有重复记账。"
      : "已保存。";
    try {
      revalidatePath("/affairs", "layout");
    } catch {
      message = "已保存，请刷新查看。";
    }
    return { status: "success", fieldErrors: {}, message, receipt };
  } catch (error) {
    if (error instanceof AffairsDatabaseError) {
      const missing = ["PGRST202", "PGRST205", "42883", "42P01"].includes(
        error.code,
      );
      return {
        status: "error",
        fieldErrors: {},
        message: missing
          ? "事务模块数据库功能尚未部署，请执行对应 SQL。"
          : (messages[error.message] ??
            "数据库拒绝了本次操作，请检查内容并刷新核对。"),
        receipt: null,
      };
    }
    // Unknown transport/receipt result may already be committed. Never issue a new request automatically.
    return {
      status: "uncertain",
      fieldErrors: {},
      message: "提交结果暂不明确。请先核对，或保持原内容重试同一次提交。",
      receipt: null,
    };
  }
}
