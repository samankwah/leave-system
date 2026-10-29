import { checkCapacity } from "./capacity";
import { messages } from "./messages";
import type { Allocation, ISODate, Issue, MonthKey, Period } from "./types";
import {
  formatRange, isValidISO, monthNumber, monthlyBreakdown, monthsSpanned, parseISO,
  periodsOverlap, sumBreakdowns, workingDates, yearOf,
} from "./workingDays";

export interface PlanContext {
  employeeId: number;
  /** Id of the plan being validated (excluded from its own capacity reservation). */
  planId?: number;
  year: number;
  entitlement: number;
  holidays: ReadonlySet<ISODate>;
  restrictedMonths: number[];
  capacity: number;
  allocations: Allocation[];
  /** Employee's approved leave requests for the year; an amendment must keep covering them. */
  approvedRequests: Period[];
  mode: "submit" | "approve";
}

export interface AnalysedPeriod extends Period {
  days: number;
  breakdown: Record<MonthKey, number>;
  valid: boolean;
}

export interface PlanAnalysis {
  periods: AnalysedPeriod[];
  monthly: Record<MonthKey, number>;
  total: number;
  unallocated: number;
  issues: Issue[];
}

/** Working dates in `range` that are not covered by any of `periods`. */
export function uncoveredWorkingDates(range: Period, periods: Period[], holidays: ReadonlySet<ISODate>): ISODate[] {
  return workingDates(range.start, range.end, holidays).filter(
    (d) => !periods.some((p) => p.start <= d && d <= p.end),
  );
}

/** Groups dates into ranges, joining dates separated only by a weekend/holiday gap (≤ 4 days). */
export function groupDates(dates: ISODate[]): Period[] {
  const out: Period[] = [];
  for (const d of [...dates].sort()) {
    const last = out[out.length - 1];
    if (last && (parseISO(d) - parseISO(last.end)) / 86_400_000 <= 4) last.end = d;
    else out.push({ start: d, end: d });
  }
  return out;
}

export function analysePlan(input: Period[], ctx: PlanContext): PlanAnalysis {
  const issues: Issue[] = [];
  const restrictedHit = new Set<MonthKey>();
  const periods: AnalysedPeriod[] = input.map((p) => {
    const valid = isValidISO(p.start) && isValidISO(p.end) && p.start <= p.end;
    if (!valid) return { ...p, days: 0, breakdown: {}, valid };
    const breakdown = monthlyBreakdown(p.start, p.end, ctx.holidays);
    return { ...p, days: Object.values(breakdown).reduce((a, b) => a + b, 0), breakdown, valid };
  });

  if (periods.length === 0) issues.push(messages.emptyPlan());

  for (const p of periods) {
    if (!p.valid) {
      issues.push(messages.invalidDates());
      continue;
    }
    if (yearOf(p.start) !== ctx.year || yearOf(p.end) !== ctx.year) {
      issues.push(messages.crossYear());
      continue;
    }
    for (const m of monthsSpanned(p.start, p.end)) {
      if (ctx.restrictedMonths.includes(monthNumber(m))) restrictedHit.add(m);
    }
    if (p.days === 0) issues.push(messages.noWorkingDays());
  }
  for (const m of [...restrictedHit].sort()) issues.push(messages.restricted(ctx.restrictedMonths, m));

  const valid = periods.filter((p) => p.valid);
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (periodsOverlap(valid[i], valid[j])) issues.push(messages.periodOverlap(formatRange(valid[i]), formatRange(valid[j])));
    }
  }

  const monthly = sumBreakdowns(valid.map((p) => p.breakdown));
  const total = Object.values(monthly).reduce((a, b) => a + b, 0);
  if (total > ctx.entitlement) issues.push(messages.planOverEntitlement(total, ctx.entitlement));

  issues.push(
    ...checkCapacity({
      employeeId: ctx.employeeId,
      months: Object.keys(monthly),
      allocations: ctx.allocations,
      capacity: ctx.capacity,
      mode: ctx.mode,
      self: ctx.planId ? { sourceType: "plan", sourceId: ctx.planId } : undefined,
    }),
  );

  for (const r of ctx.approvedRequests) {
    if (uncoveredWorkingDates(r, valid, ctx.holidays).length > 0) issues.push(messages.amendmentConflict(formatRange(r)));
  }

  return { periods, monthly, total, unallocated: ctx.entitlement - total, issues };
}
