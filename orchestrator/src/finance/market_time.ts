/** Canonical market-time helpers. Persist instants as UTC; use exchange time only for display/session rules. */
export type SupportedMarket = "US" | "CN" | "HK";

export const MARKET_TIME_ZONES: Readonly<Record<SupportedMarket, string>> = {
  US: "America/New_York",
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
};

export function parseInstant(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`invalid instant:${JSON.stringify(value)}`);
  return date;
}

export function toUtcIso(value: string | Date): string {
  return parseInstant(value).toISOString();
}

export function marketDate(value: string | Date, market: SupportedMarket): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONES[market], year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(parseInstant(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isTradingDay(date: string, holidays: ReadonlySet<string> = new Set()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`invalid market date:${JSON.stringify(date)}`);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(date);
}
