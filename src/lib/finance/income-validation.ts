import type { CreateIncomeTransactionInput, UpdateIncomeTransactionInput } from "./income-mutations";
import { moneyToCents } from "./budget-validation";
import { reconciliationUuid, shanghaiDateTime } from "./reconciliation-validation";

export interface IncomeValidationResult {
  input: CreateIncomeTransactionInput | null;
  errors: Record<string, string>;
}

export function validateIncomeInput(
  data: FormData,
  now = new Date(),
): IncomeValidationResult {
  const value = (name: string) => (
    typeof data.get(name) === "string" ? String(data.get(name)).trim() : ""
  );
  const errors: Record<string, string> = {};
  const requestId = value("requestId").toLowerCase();
  const accountId = value("accountId").toLowerCase();
  const categoryId = value("categoryId").toLowerCase();

  if (!reconciliationUuid.test(requestId)) errors.requestId = "请重新打开收入表单。";
  if (!reconciliationUuid.test(accountId)) errors.accountId = "请选择有效的入账账户。";
  if (!reconciliationUuid.test(categoryId)) errors.categoryId = "请选择有效的收入分类。";

  const cents = moneyToCents(value("amount"));
  if (cents === null || cents <= 0) {
    errors.amount = "请输入大于 0、最多两位小数且不超过 999999999999.99 的金额。";
  }

  const time = value("occurredAt");
  const normalizedTime = time.length === 16 ? `${time}:00` : time;
  const occurredAt = new Date(`${normalizedTime}+08:00`);
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalizedTime)
    || !Number.isFinite(occurredAt.getTime())
    || occurredAt > now
    || shanghaiDateTime(occurredAt) !== normalizedTime) {
    errors.occurredAt = "请选择有效且不晚于当前的日期时间（北京时间）。";
  }

  const description = value("description");
  const memo = value("memo") || null;
  if (!description || [...description].length > 1000) {
    errors.description = "请填写 1–1000 个字符的描述。";
  }
  if (memo && [...memo].length > 1000) errors.memo = "备注不能超过 1000 个字符。";

  return {
    errors,
    input: Object.keys(errors).length > 0 ? null : {
      accountId,
      amount: cents! / 100,
      categoryId,
      description,
      memo,
      occurredAt: occurredAt.toISOString(),
      rawText: null,
      requestId,
    },
  };
}

export interface IncomeUpdateValidationResult {
  input: UpdateIncomeTransactionInput | null;
  errors: Record<string, string>;
}

export function validateIncomeUpdateInput(
  data: FormData,
  now = new Date(),
): IncomeUpdateValidationResult {
  const createShape = new FormData();
  data.forEach((value, key) => createShape.append(key, value));
  createShape.set("requestId", "00000000-0000-4000-8000-000000000001");
  const base = validateIncomeInput(createShape, now);
  const entryId = typeof data.get("entryId") === "string"
    ? String(data.get("entryId")).trim().toLowerCase()
    : "";
  const errors = { ...base.errors };
  // Update identity is immutable and never sourced from a create request id.
  if (!reconciliationUuid.test(entryId)) errors.entryId = "交易标识无效。";
  if (!base.input || Object.keys(errors).length > 0) return { errors, input: null };
  const { requestId: _requestId, ...editable } = base.input;
  return { errors, input: { ...editable, entryId } };
}
