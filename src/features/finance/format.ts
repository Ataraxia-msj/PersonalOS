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
