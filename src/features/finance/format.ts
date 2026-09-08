import type { Transaction } from "./types";

export function formatCurrency(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
    .format(Math.abs(value))
    .replace("CN¥", "¥");
}

export function formatSignedCurrency(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCurrency(value)}`;
}

export function formatShortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${month}-${day}`;
}
export function formatTransactionAmount(transaction: Transaction): string {
  if (transaction.amount === null) return "—";
  return transaction.transfer ? formatTransferMoney(transaction.amount, transaction.transfer.currency ?? null) : formatSignedCurrency(transaction.amount);
}

export function formatTransferMoney(amount: number, currency: string | null): string {
  if (currency === "CNY") return formatCurrency(amount, 2);
  const number = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount));
  return `${number} ${currency ?? "（币种待确认）"}`;
}
