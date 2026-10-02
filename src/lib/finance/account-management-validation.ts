import type {
  AccountMetadataInput,
  CreateManagedAccountInput,
  SetManagedAccountActiveInput,
  UpdateManagedAccountInput,
} from "./account-management-mutations";
import type { AccountClass, AccountType } from "./types";
import { moneyToCents } from "./budget-validation";
import { reconciliationUuid, shanghaiDateTime } from "./reconciliation-validation";

export const ACCOUNT_TYPES_BY_CLASS = {
  asset: ["cash", "bank", "ewallet", "wallet_pocket", "money_market", "time_deposit", "investment", "receivable", "other"],
  liability: ["credit_card", "consumer_credit", "loan", "payable", "other"],
} as const satisfies Record<AccountClass, readonly AccountType[]>;

interface ValidationResult<T> {
  errors: Record<string, string>;
  input: T | null;
}

function value(data: FormData, name: string): string {
  const raw = data.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

function validateMetadata(data: FormData) {
  const errors: Record<string, string> = {};
  const name = value(data, "name");
  if (!name || [...name].length > 200) errors.name = "账户名称需为 1–200 个字符。";

  const accountClass = value(data, "accountClass") as AccountClass;
  const accountType = value(data, "accountType") as AccountType;
  if (!(accountClass in ACCOUNT_TYPES_BY_CLASS)) errors.accountClass = "请选择有效的账户类别。";
  else if (!(ACCOUNT_TYPES_BY_CLASS[accountClass] as readonly string[]).includes(accountType)) {
    errors.accountType = "账户类型与资产/负债类别不匹配。";
  }

  const currency = value(data, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) errors.currency = "币种必须是三个大写字母。";
  const institution = value(data, "institution") || null;
  if (institution && [...institution].length > 200) errors.institution = "机构名称不能超过 200 个字符。";
  const note = value(data, "note") || null;
  if (note && [...note].length > 1000) errors.note = "备注不能超过 1000 个字符。";
  const sortRaw = value(data, "sortOrder");
  const sortOrder = Number(sortRaw);
  if (!/^\d+$/.test(sortRaw) || !Number.isSafeInteger(sortOrder) || sortOrder < 0) {
    errors.sortOrder = "排序必须是非负整数。";
  }
  const includeInNetWorth = data.get("includeInNetWorth") !== null;

  const input: AccountMetadataInput = {
    accountClass,
    accountType,
    currency,
    includeInNetWorth,
    institution,
    name,
    note,
    sortOrder,
  };
  return { errors, input };
}

export function validateCreateAccount(data: FormData, now = new Date()): ValidationResult<CreateManagedAccountInput> {
  const metadata = validateMetadata(data);
  const errors = { ...metadata.errors };
  const requestId = value(data, "requestId").toLowerCase();
  if (!reconciliationUuid.test(requestId)) errors.requestId = "请重新打开新增账户页面。";

  const cents = moneyToCents(value(data, "initialBalance"));
  if (cents === null) errors.initialBalance = "请输入非负、最多两位小数且不超过范围的当前余额。";

  const localTime = value(data, "balanceAt");
  const normalized = localTime.length === 16 ? `${localTime}:00` : localTime;
  const timestamp = new Date(`${normalized}+08:00`);
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)
    || !Number.isFinite(timestamp.getTime()) || timestamp > now || shanghaiDateTime(timestamp) !== normalized) {
    errors.balanceAt = "请选择有效且不晚于当前的余额时间（北京时间）。";
  }

  return { errors, input: Object.keys(errors).length ? null : {
    ...metadata.input,
    balanceAt: timestamp.toISOString(),
    initialBalance: cents! / 100,
    requestId,
  } };
}

export function validateUpdateAccount(data: FormData): ValidationResult<UpdateManagedAccountInput> {
  const metadata = validateMetadata(data);
  const errors = { ...metadata.errors };
  const accountId = value(data, "accountId").toLowerCase();
  const expectedUpdatedAt = value(data, "expectedUpdatedAt");
  if (!reconciliationUuid.test(accountId)) errors.accountId = "账户标识无效。";
  if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    errors.expectedUpdatedAt = "账户版本无效，请刷新页面后重试。";
  }
  return { errors, input: Object.keys(errors).length ? null : {
    ...metadata.input, accountId, expectedUpdatedAt,
  } };
}

export function validateSetAccountActive(data: FormData): ValidationResult<SetManagedAccountActiveInput> {
  const errors: Record<string, string> = {};
  const accountId = value(data, "accountId").toLowerCase();
  const expectedUpdatedAt = value(data, "expectedUpdatedAt");
  const activeRaw = value(data, "isActive");
  if (!reconciliationUuid.test(accountId)) errors.accountId = "账户标识无效。";
  if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    errors.expectedUpdatedAt = "账户版本无效，请刷新页面后重试。";
  }
  if (activeRaw !== "true" && activeRaw !== "false") errors.isActive = "账户状态无效。";
  return { errors, input: Object.keys(errors).length ? null : {
    accountId, expectedUpdatedAt, isActive: activeRaw === "true",
  } };
}
