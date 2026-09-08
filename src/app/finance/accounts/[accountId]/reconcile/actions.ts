"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ReconciliationActionState } from "@/lib/finance/reconciliation-types";
import { reconciliationUuid, validateReconciliationInput } from "@/lib/finance/reconciliation-validation";
import { previewBalanceReconciliation, reconcileAccountBalance, ReconciliationError } from "@/lib/finance/reconciliation-queries";

const empty: ReconciliationActionState = { status: "idle", message: null, errors: {}, preview: null, result: null };
const messages: Record<string, string> = {
  account_not_found: "账户不存在或无权访问。", account_inactive: "该账户已停用，不能校准。",
  invalid_snapshot_time: "核对时间无效或晚于服务器当前时间，请修正时间。",
  invalid_snapshot_balance: "实际金额必须为非负、最多两位小数。",
  stale_reconciliation_preview: "账户数据已变化，请重新核对差额后确认。",
  snapshot_time_conflict: "该账户在这个时间已有快照，请查看历史或重新选择核对时间。",
  request_payload_conflict: "这次提交标识已用于其他内容，请返回账户核对记录，不要覆盖。",
  authentication_required: "登录状态已失效，请重新登录。",
  snapshot_note_too_long: "备注不能超过 1000 个字符。",
};
async function authenticatedClient() {
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) throw new ReconciliationError("authentication_required", "42501");
  return client;
}
function failure(error: unknown, mayHaveWritten: boolean): ReconciliationActionState {
  if (error instanceof ReconciliationError) {
    if (error.code === "PGRST202") return { ...empty, status: "error", message: "余额校准接口尚未部署，请先执行余额校准 migration。" };
    if (messages[error.message]) return { ...empty, status: "error", message: messages[error.message] };
    if (error.code && /^[0-9A-Z]{5}$/.test(error.code)) return { ...empty, status: "error", message: "数据库未接受本次操作，请重新核对，必要时检查权限或联系维护者。" };
  }
  return { ...empty, status: mayHaveWritten ? "uncertain" : "error", message: mayHaveWritten
    ? "未能确认保存结果。可重试同一次校准（不会重复写入），或先返回账户查看历史。"
    : "暂时无法读取校准数据，请检查网络后重试。" };
}
export async function previewReconciliationAction(_previous: ReconciliationActionState, data: FormData): Promise<ReconciliationActionState> {
  try {
    const client = await authenticatedClient();
    const { errors, input } = validateReconciliationInput(data);
    if (!input) return { ...empty, status: "error", errors, message: "请检查金额和核对时间。" };
    const row = await previewBalanceReconciliation(client, input);
    return { ...empty, status: "preview", preview: { input, row, requestId: randomUUID() } };
  } catch (error) { return failure(error, false); }
}
export async function saveReconciliationAction(_previous: ReconciliationActionState, data: FormData): Promise<ReconciliationActionState> {
  let client;
  try { client = await authenticatedClient(); }
  catch (error) { return failure(error, false); }
  const { errors, input } = validateReconciliationInput(data);
  const requestId = String(data.get("requestId") ?? "");
  const expected = String(data.get("expectedBalance") ?? "");
  const snapshotId = String(data.get("expectedSnapshotId") ?? "") || null;
  if (!reconciliationUuid.test(requestId) || !/^-?\d+(?:\.\d+)?$/.test(expected)
    || !Number.isFinite(Number(expected)) || (snapshotId && !reconciliationUuid.test(snapshotId))) {
    errors.preview = "确认信息无效，请重新查看差额。";
  }
  if (!input || Object.keys(errors).length) return { ...empty, status: "error", errors, message: "请重新核对校准信息。" };
  let result;
  try {
    result = await reconcileAccountBalance(client, {
      p_request_id: requestId, p_account_id: input.accountId, p_snapshot_at: input.snapshotAt,
      p_balance: input.balance, p_note: input.note, p_expected_balance: Number(expected), p_expected_snapshot_id: snapshotId,
    });
  } catch (error) { return failure(error, true); }
  let message = "余额快照已保存，账户余额与净资产已刷新；收支和预算不变。";
  try { revalidatePath("/finance", "layout"); }
  catch { message = "余额快照已保存，但页面刷新失败。请返回账户刷新查看，不要重新建立同一条校准。"; }
  return { ...empty, status: "success", result, message };
}
