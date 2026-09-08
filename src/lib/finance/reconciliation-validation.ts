import { moneyToCents } from "./budget-validation";
import type { ReconciliationInput } from "./reconciliation-types";

export const reconciliationUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function shanghaiDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}
export function validateReconciliationInput(data: FormData, now = new Date()): {
  errors: Record<string, string>; input: ReconciliationInput | null;
} {
  const value = (name: string) => typeof data.get(name) === "string" ? String(data.get(name)).trim() : "";
  const errors: Record<string, string> = {};
  const accountId = value("accountId");
  const localTime = value("snapshotAt");
  const normalized = localTime.length === 16 ? `${localTime}:00` : localTime;
  const timestamp = new Date(`${normalized}+08:00`);
  if (!reconciliationUuid.test(accountId)) errors.accountId = "账户标识无效。";
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)
    || !Number.isFinite(timestamp.getTime()) || timestamp > now || shanghaiDateTime(timestamp) !== normalized) {
    errors.snapshotAt = "请选择有效且不晚于当前的核对时间（北京时间）。";
  }
  const cents = moneyToCents(value("balance"));
  if (cents === null) errors.balance = "请输入非负、最多两位小数的实际金额。";
  const note = value("note") || null;
  if (note && [...note].length > 1000) errors.note = "备注不能超过 1000 个字符。";
  return { errors, input: Object.keys(errors).length ? null : {
    accountId, snapshotAt: timestamp.toISOString(), balance: cents! / 100, note,
  } };
}
