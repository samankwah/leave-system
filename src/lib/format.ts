/**
 * Deterministic formatting: fixed locale and timezone so server-rendered and client-rendered
 * text are identical (avoids React hydration mismatches). Ghana is UTC+0 all year.
 */
const TZ = "Africa/Accra";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const longDateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function fmtDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : "—";
}

/** Formats an ISO timestamp or a plain YYYY-MM-DD date. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateFmt.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
}

export function fmtLongDate(isoDate: string): string {
  return longDateFmt.format(new Date(`${isoDate}T12:00:00Z`));
}

/** "today", "yesterday", "3 days ago", "in 5 days" relative to a reference YYYY-MM-DD (server-supplied, so stable). */
export function relativeDays(isoDate: string, today: string): string {
  const d = Math.round((Date.parse(isoDate.slice(0, 10)) - Date.parse(today)) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (Math.abs(d) < 45) return d > 0 ? `in ${d} days` : `${-d} days ago`;
  const months = Math.round(Math.abs(d) / 30);
  return d > 0 ? `in ${months} month${months > 1 ? "s" : ""}` : `${months} month${months > 1 ? "s" : ""} ago`;
}

export const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / 86_400_000);

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const initials = (name: string) => name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
