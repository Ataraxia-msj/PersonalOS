import { moneyToCents } from "./budget-validation";
import { reconciliationUuid, shanghaiDateTime } from "./reconciliation-validation";
import type { TransferArgs, TransferFormData, TransferPurpose, UpdateTransferArgs } from "./transfer-types";

export function validateTransferInput(data: FormData, now = new Date()): {
  args: TransferArgs | null; errors: Record<string, string>;
} {
  const value = (name: string) => typeof data.get(name) === "string" ? String(data.get(name)).trim() : "";
  const errors: Record<string, string> = {};
  const requestId = value("requestId").toLowerCase();
  const from = value("fromAccountId").toLowerCase();
  const to = value("toAccountId").toLowerCase();
  const bucket = value("budgetBucketId").toLowerCase() || null;
  for (const [key, id] of [["requestId", requestId], ["fromAccountId", from], ["toAccountId", to]]) {
    if (!reconciliationUuid.test(id)) errors[key] = "请选择有效账户或重新打开表单。";
  }
  if (from === to) errors.toAccountId = "转出和转入账户不能相同。";
  const purpose = value("purpose") as TransferPurpose;
  if (!["general", "saving", "investment", "debt"].includes(purpose)) errors.purpose = "请选择有效用途。";
  if (bucket && (!reconciliationUuid.test(bucket) || purpose === "general")) errors.budgetBucketId = "预算分类无效；普通转账不计入预算。";
  const cents = moneyToCents(value("amount"));
  if (cents === null || cents <= 0) errors.amount = "请输入大于 0、最多两位小数且不超过 999999999999.99 的金额。";
  const time = value("occurredAt");
  const normalized = time.length === 16 ? `${time}:00` : time;
  const date = new Date(`${normalized}+08:00`);
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)
    || !Number.isFinite(date.getTime()) || date > now || shanghaiDateTime(date) !== normalized) {
    errors.occurredAt = "请选择有效且不晚于当前的日期时间（北京时间）。";
  }
  const description = value("description");
  const memo = value("memo") || null;
  if (!description || [...description].length > 1000) errors.description = "请填写 1–1000 个字符的描述。";
  if (memo && [...memo].length > 1000) errors.memo = "备注不能超过 1000 个字符。";
  return { errors, args: Object.keys(errors).length ? null : {
    p_request_id: requestId, p_from_account_id: from, p_to_account_id: to, p_purpose: purpose,
    p_occurred_at: date.toISOString(), p_amount: cents! / 100, p_description: description,
    p_budget_bucket_id: bucket, p_memo: memo,
  } };
}

export function validateTransferUpdateInput(
  data: FormData,
  options: TransferFormData,
  now = new Date(),
): { args: UpdateTransferArgs | null; errors: Record<string, string> } {
  const createShape = new FormData();
  data.forEach((value, key) => createShape.append(key, value));
  createShape.set("requestId", "00000000-0000-4000-8000-000000000001");
  const base = validateTransferInput(createShape, now);
  const errors = { ...base.errors };
  const entryId = typeof data.get("entryId") === "string"
    ? String(data.get("entryId")).trim().toLowerCase()
    : "";
  if (!reconciliationUuid.test(entryId)) errors.entryId = "交易标识无效。";

  if (base.args) {
    const from = options.accounts.find((account) => account.id === base.args?.p_from_account_id);
    const to = options.accounts.find((account) => account.id === base.args?.p_to_account_id);
    if (!from || from.accountClass !== "asset") errors.fromAccountId = "请选择有效的资产转出账户。";
    if (!to || to.accountClass !== (base.args.p_purpose === "debt" ? "liability" : "asset")) {
      errors.toAccountId = base.args.p_purpose === "debt" ? "请选择有效的负债账户。" : "请选择有效的资产转入账户。";
    } else if (from && from.currency !== to.currency) {
      errors.toAccountId = "转入与转出账户必须使用相同币种。";
    }
    if (base.args.p_budget_bucket_id) {
      const bucket = options.budgetBuckets.find((item) => item.id === base.args?.p_budget_bucket_id);
      if (!bucket || bucket.kind !== base.args.p_purpose) {
        errors.budgetBucketId = "预算分类与转账用途不匹配。";
      }
    }
  }

  if (!base.args || Object.keys(errors).length > 0) return { args: null, errors };
  return { args: {
    p_amount: base.args.p_amount,
    p_budget_bucket_id: base.args.p_budget_bucket_id,
    p_description: base.args.p_description,
    p_entry_id: entryId,
    p_from_account_id: base.args.p_from_account_id,
    p_memo: base.args.p_memo,
    p_occurred_at: base.args.p_occurred_at,
    p_purpose: base.args.p_purpose,
    p_to_account_id: base.args.p_to_account_id,
  }, errors };
}
