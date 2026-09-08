import type { SaveMonthlyBudgetArgs } from "./types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function shanghaiDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (name: string) => parts.find((part) => part.type === name)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function moneyToCents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 99999999999999 ? cents : null;
}

export function validateBudgetForm(data: FormData): {
  errors: Record<string, string>; args: SaveMonthlyBudgetArgs | null;
} {
  const value = (key: string) => typeof data.get(key) === "string" ? String(data.get(key)).trim() : "";
  const errors: Record<string, string> = {};
  const month = value("month");
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) errors.month = "请选择有效月份。";
  const income = moneyToCents(value("plannedIncome"));
  if (income === null) errors.plannedIncome = "请输入非负、最多两位小数的计划收入。";
  const seen = new Set<string>();
  const allocations: SaveMonthlyBudgetArgs["p_allocations"] = [];
  for (const [name, raw] of data.entries()) {
    if (!name.startsWith("allocation:")) continue;
    const id = name.slice(11);
    const cents = typeof raw === "string" ? moneyToCents(raw.trim()) : null;
    if (!uuid.test(id) || seen.has(id.toLowerCase())) errors.allocations = "预算分类重复或无效，请重新加载。";
    if (cents === null) errors[name] = "请输入非负、最多两位小数的预算金额。";
    seen.add(id.toLowerCase());
    if (cents !== null) allocations.push({ budget_bucket_id: id, planned_amount: cents / 100 });
  }
  if (!seen.size) errors.allocations = "没有可保存的预算分类。";
  const periodId = value("periodId") || null;
  const version = value("version") || null;
  if (periodId && !uuid.test(periodId)) errors.version = "预算标识无效。";
  if ((periodId && (!version || !Number.isFinite(Date.parse(version)))) || (!periodId && version)) {
    errors.version = "预算版本缺失或无效，请重新加载。";
  }
  return { errors, args: Object.keys(errors).length ? null : {
    p_month: `${month}-01`, p_planned_income: income! / 100, p_allocations: allocations,
    p_period_id: periodId, p_expected_updated_at: version,
  } };
}
