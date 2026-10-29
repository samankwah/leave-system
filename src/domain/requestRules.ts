import { checkCapacity } from "./capacity";
import { messages } from "./messages";
import { groupDates, uncoveredWorkingDates } from "./planRules";
import type { Allocation, ISODate, Issue, MonthKey, Period } from "./types";
import {
  formatRange, isValidISO, monthNumber, monthlyBreakdown, monthsSpanned, periodsOverlap, workingDates, yearOf,
} from "./workingDays";

export interface ExistingRequest extends Period {
  id: number;
  status: "pending" | "approved";
  days: number;
}

export interface RequestContext {
  employeeId: number;
  /** Id of the request being (re)validated, excluded from overlap, balance and capacity self-checks. */
  requestId?: number;
  today: ISODate;
  holidays: ReadonlySet<ISODate>;
  restrictedMonths: number[];
  capacity: number;
  /** Entitlement for the request's leave year (including any configured carryover). */
  entitlement: number;
  /** Periods of the employee's APPROVED master plan for the request's year, or null if none. */
  approvedPlan: Period[] | null;
  /** Employee's other active (pending/approved) requests. */
  existing: ExistingRequest[];
  allocations: Allocation[];
  mode: "submit" | "approve";
}

export interface RequestAnalysis {
  days: number;
  breakdown: Record<MonthKey, number>;
  /** Approved-plan working days in each month the request touches. */
  planBreakdown: Record<MonthKey, number>;
  uncovered: ISODate[];
  /** Entitlement minus other approved and pending leave in the same year. */
  available: number;
  balanceAfter: number;
  issues: Issue[];
}

export function analyseRequest(input: Period, ctx: RequestContext): RequestAnalysis {
  const empty: RequestAnalysis = {
    days: 0, breakdown: {}, planBreakdown: {}, uncovered: [], available: ctx.entitlement, balanceAfter: ctx.entitlement, issues: [],
  };
  if (!isValidISO(input.start) || !isValidISO(input.end) || input.start > input.end) {
    return { ...empty, issues: [messages.invalidDates()] };
  }
  const issues: Issue[] = [];
  const year = yearOf(input.start);
  if (yearOf(input.end) !== year) issues.push(messages.crossYear());

  // 1. Restricted months
  const restricted = monthsSpanned(input.start, input.end).filter((m) => ctx.restrictedMonths.includes(monthNumber(m)));
  for (const m of restricted) issues.push(messages.restricted(ctx.restrictedMonths, m));

  const breakdown = monthlyBreakdown(input.start, input.end, ctx.holidays);
  const days = Object.values(breakdown).reduce((a, b) => a + b, 0);
  if (days === 0) issues.push(messages.noWorkingDays());
  if (ctx.mode === "submit" && input.start < ctx.today) issues.push(messages.pastDate());

  // 2. Approved master plan consistency
  const planBreakdown: Record<MonthKey, number> = {};
  let uncovered: ISODate[] = [];
  if (!ctx.approvedPlan) {
    issues.push(messages.noPlan(year));
  } else {
    for (const m of monthsSpanned(input.start, input.end)) {
      const [y, mm] = m.split("-").map(Number);
      const monthStart = `${m}-01`;
      const monthEnd = `${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, "0")}`;
      planBreakdown[m] = ctx.approvedPlan.reduce((sum, p) => {
        const s = p.start > monthStart ? p.start : monthStart;
        const e = p.end < monthEnd ? p.end : monthEnd;
        return s <= e ? sum + workingDates(s, e, ctx.holidays).length : sum;
      }, 0);
    }
    uncovered = uncoveredWorkingDates(input, ctx.approvedPlan, ctx.holidays);
    if (uncovered.length > 0) {
      const ranges = groupDates(uncovered).map(formatRange).join("; ");
      issues.push(messages.planMismatch(`Not in your approved plan: ${uncovered.length} working day(s) (${ranges}).`));
    }
  }

  // 3. Annual entitlement
  const others = ctx.existing.filter((r) => r.id !== ctx.requestId && yearOf(r.start) === year);
  const committed = others.reduce((s, r) => s + r.days, 0);
  const available = ctx.entitlement - committed;
  if (days > available) issues.push(messages.balanceExceeded(days, Math.max(0, available)));

  // 4. Monthly employee capacity (reuses an existing reservation for this employee)
  issues.push(
    ...checkCapacity({
      employeeId: ctx.employeeId,
      months: Object.keys(breakdown),
      allocations: ctx.allocations,
      capacity: ctx.capacity,
      mode: ctx.mode,
      self: ctx.requestId ? { sourceType: "request", sourceId: ctx.requestId } : undefined,
    }),
  );

  // 5. Overlapping and duplicate requests
  for (const r of ctx.existing) {
    if (r.id === ctx.requestId || !periodsOverlap(r, input)) continue;
    issues.push(r.start === input.start && r.end === input.end ? messages.duplicate(formatRange(r)) : messages.overlap(formatRange(r)));
  }

  return { days, breakdown, planBreakdown, uncovered, available, balanceAfter: available - days, issues };
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === "error");
