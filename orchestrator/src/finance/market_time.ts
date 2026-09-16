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

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);
const utcDate = (year: number, month: number, day: number): Date => new Date(Date.UTC(year, month - 1, day, 12));

function observedFixedHoliday(year: number, month: number, day: number): string {
  const date = utcDate(year, month, day);
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return isoDay(date);
}

function nthWeekday(year: number, month: number, weekday: number, nth: number): string {
  const date = utcDate(year, month, 1);
  date.setUTCDate(1 + ((7 + weekday - date.getUTCDay()) % 7) + (nth - 1) * 7);
  return isoDay(date);
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const date = utcDate(year, month + 1, 0);
  date.setUTCDate(date.getUTCDate() - ((7 + date.getUTCDay() - weekday) % 7));
  return isoDay(date);
}

function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
}

/** NYSE full-day closure rules. One-off emergency closures must be supplied by an external official calendar. */
export function usMarketHolidays(year: number): ReadonlySet<string> {
  if (!Number.isInteger(year) || year < 1970 || year > 2200) throw new Error(`invalid calendar year: ${year}`);
  const easter = easterSunday(year);
  easter.setUTCDate(easter.getUTCDate() - 2);
  const holidays = new Set([
    observedFixedHoliday(year, 1, 1),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    isoDay(easter),
    lastWeekday(year, 5, 1),
    observedFixedHoliday(year, 6, 19),
    observedFixedHoliday(year, 7, 4),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observedFixedHoliday(year, 12, 25),
  ]);
  // A following year's New Year can be observed on Dec 31 of this year.
  const nextNewYear = observedFixedHoliday(year + 1, 1, 1);
  if (nextNewYear.startsWith(`${year}-`)) holidays.add(nextNewYear);
  return holidays;
}

export function isUsTradingDay(date: string, extraClosures: ReadonlySet<string> = new Set()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`invalid market date: ${JSON.stringify(date)}`);
  const holidays = new Set([...usMarketHolidays(Number(date.slice(0, 4))), ...extraClosures]);
  return isTradingDay(date, holidays);
}
