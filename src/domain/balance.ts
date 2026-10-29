import type { ISODate, Period } from "./types";
import { workingDates } from "./workingDays";

export interface BalanceInput {
  baseEntitlement: number;
  carryover: number;
  approvedRequests: Period[];
  pendingDays: number;
  /** Total working days in the current APPROVED master plan (a schedule, not leave taken). */
  plannedDays: number;
  today: ISODate;
  holidays: ReadonlySet<ISODate>;
}

export interface Balance {
  baseEntitlement: number;
  carryover: number;
  entitlement: number;
  /** Approved leave: deducted from the annual balance. */
  approvedDays: number;
  /** Portion of approved leave falling on or before today. */
  takenToDate: number;
  /** Portion of approved leave still in the future. */
  scheduledDays: number;
  /** Awaiting approval; NOT deducted from approved/used. */
  pendingDays: number;
  plannedDays: number;
  /** Entitlement not yet allocated in the approved master plan. */
  unallocatedDays: number;
  /** Entitlement minus approved leave. */
  remainingDays: number;
  /** Entitlement minus approved and pending leave. */
  projectedDays: number;
}

export function entitlementFor(categoryEntitlement: number, carryover: number, carryoverEnabled: boolean): number {
  return categoryEntitlement + (carryoverEnabled ? carryover : 0);
}

export function computeCarryover(prevEntitlement: number, prevApprovedDays: number, maxDays: number): number {
  return Math.max(0, Math.min(maxDays, prevEntitlement - prevApprovedDays));
}

export function computeBalance(i: BalanceInput): Balance {
  const entitlement = i.baseEntitlement + i.carryover;
  let approvedDays = 0;
  let takenToDate = 0;
  for (const r of i.approvedRequests) {
    const dates = workingDates(r.start, r.end, i.holidays);
    approvedDays += dates.length;
    takenToDate += dates.filter((d) => d <= i.today).length;
  }
  return {
    baseEntitlement: i.baseEntitlement,
    carryover: i.carryover,
    entitlement,
    approvedDays,
    takenToDate,
    scheduledDays: approvedDays - takenToDate,
    pendingDays: i.pendingDays,
    plannedDays: i.plannedDays,
    unallocatedDays: entitlement - i.plannedDays,
    remainingDays: entitlement - approvedDays,
    projectedDays: entitlement - approvedDays - i.pendingDays,
  };
}
