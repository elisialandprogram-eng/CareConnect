import { formatInCurrency } from "@/lib/currency";

export function fmtBalance(n: string | number, currency = "USD"): string {
  return formatInCurrency(Number(n || 0), currency);
}
