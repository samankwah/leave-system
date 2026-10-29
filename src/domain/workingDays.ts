import type { ISODate, MonthKey, Period } from "./types";

const DAY_MS = 86_400_000;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function isValidISO(d: unknown): d is ISODate {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = parseISO(d);
  return !Number.isNaN(t) && toISO(t) === d;
}

export function parseISO(d: ISODate): number {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
}

export function toISO(t: number): ISODate {
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return toISO(parseISO(d) + n * DAY_MS);
}

export function eachDate(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let t = parseISO(start), e = parseISO(end); t <= e; t += DAY_MS) out.push(toISO(t));
  return out;
}

export function isWeekend(d: ISODate): boolean {
  const w = new Date(parseISO(d)).getUTCDay();
  return w === 0 || w === 6;
}

export function isWorkingDay(d: ISODate, holidays: ReadonlySet<ISODate>): boolean {
  return !isWeekend(d) && !holidays.has(d);
}

export function workingDates(start: ISODate, end: ISODate, holidays: ReadonlySet<ISODate>): ISODate[] {
  return eachDate(start, end).filter((d) => isWorkingDay(d, holidays));
}

export function countWorkingDays(start: ISODate, end: ISODate, holidays: ReadonlySet<ISODate>): number {
  return workingDates(start, end, holidays).length;
}

export const monthKeyOf = (d: ISODate): MonthKey => d.slice(0, 7);
export const monthNumber = (key: MonthKey): number => Number(key.slice(5, 7));
export const yearOf = (d: ISODate | MonthKey): number => Number(d.slice(0, 4));
export const monthKey = (year: number, month: number): MonthKey => `${year}-${String(month).padStart(2, "0")}`;
export const monthName = (key: MonthKey): string => MONTH_NAMES[monthNumber(key) - 1];
export const monthLabel = (key: MonthKey): string => `${monthName(key)} ${yearOf(key)}`;

export function yearMonths(year: number): MonthKey[] {
  return Array.from({ length: 12 }, (_, i) => monthKey(year, i + 1));
}

/** Working days per calendar month for a date range. Months without working days are omitted. */
export function monthlyBreakdown(start: ISODate, end: ISODate, holidays: ReadonlySet<ISODate>): Record<MonthKey, number> {
  const out: Record<MonthKey, number> = {};
  for (const d of workingDates(start, end, holidays)) {
    const k = monthKeyOf(d);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function sumBreakdowns(list: Record<MonthKey, number>[]): Record<MonthKey, number> {
  const out: Record<MonthKey, number> = {};
  for (const b of list) for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** Every calendar month touched by the range, including months containing only weekends/holidays. */
export function monthsSpanned(start: ISODate, end: ISODate): MonthKey[] {
  const out: MonthKey[] = [];
  let y = yearOf(start);
  let m = monthNumber(monthKeyOf(start));
  const last = monthKeyOf(end);
  for (;;) {
    const k = monthKey(y, m);
    out.push(k);
    if (k >= last) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function periodsOverlap(a: Period, b: Period): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function formatDate(d: ISODate): string {
  const t = new Date(parseISO(d));
  return `${t.getUTCDate()} ${MONTH_NAMES[t.getUTCMonth()].slice(0, 3)} ${t.getUTCFullYear()}`;
}

export function formatRange(p: Period): string {
  return p.start === p.end ? formatDate(p.start) : `${formatDate(p.start)} – ${formatDate(p.end)}`;
}
