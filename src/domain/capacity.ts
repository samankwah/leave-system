import { messages } from "./messages";
import type { Allocation, Issue, MonthKey, MonthOccupancy, MonthStatus } from "./types";
import { monthNumber } from "./workingDays";

/**
 * Capacity counts DISTINCT employees per month. An employee with several plan periods and
 * requests in one month occupies one slot. Active plans (submitted/approved) and active
 * requests (pending/approved) reserve the slot; rejected/returned/cancelled/superseded
 * sources simply stop appearing in the allocation list, which releases the slot once no
 * other active source for that employee remains.
 */
export function computeOccupancy(
  allocations: Allocation[],
  months: MonthKey[],
  capacity: number,
  restrictedMonths: number[],
): Record<MonthKey, MonthOccupancy> {
  const out: Record<MonthKey, MonthOccupancy> = {};
  for (const month of months) {
    const inMonth = allocations.filter((a) => a.month === month && a.days > 0);
    const all = new Set(inMonth.map((a) => a.employeeId));
    const approved = new Set(inMonth.filter((a) => a.approved).map((a) => a.employeeId));
    const count = all.size;
    let status: MonthStatus = "available";
    if (restrictedMonths.includes(monthNumber(month))) status = "restricted";
    else if (count >= capacity) status = "full";
    else if (count === capacity - 1) status = "nearly-full";
    out[month] = {
      month,
      employeeIds: [...all],
      approvedEmployeeIds: [...approved],
      pendingOnlyEmployeeIds: [...all].filter((id) => !approved.has(id)),
      count,
      capacity,
      remaining: Math.max(0, capacity - count),
      status,
    };
  }
  return out;
}

export interface CapacityCheck {
  employeeId: number;
  months: MonthKey[];
  allocations: Allocation[];
  capacity: number;
  /**
   * "submit": every active (pending or approved) allocation of other employees occupies a slot.
   * "approve": only other employees' APPROVED allocations block approval (pending ones were
   *            admitted after this item reserved its slot, or are themselves awaiting a decision).
   */
  mode: "submit" | "approve";
  /** The plan/request being validated; its own allocations never count as a prior reservation. */
  self?: { sourceType: "plan" | "request"; sourceId: number };
}

export function hasReservation(c: Pick<CapacityCheck, "employeeId" | "allocations" | "mode" | "self">, month: MonthKey): boolean {
  return c.allocations.some(
    (a) =>
      a.employeeId === c.employeeId &&
      a.month === month &&
      a.days > 0 &&
      (c.mode === "submit" || a.approved) &&
      !(c.self && a.sourceType === c.self.sourceType && a.sourceId === c.self.sourceId),
  );
}

export function otherEmployeesInMonth(c: Pick<CapacityCheck, "employeeId" | "allocations" | "mode">, month: MonthKey): number {
  const ids = new Set<number>();
  for (const a of c.allocations) {
    if (a.month !== month || a.days <= 0 || a.employeeId === c.employeeId) continue;
    if (c.mode === "approve" && !a.approved) continue;
    ids.add(a.employeeId);
  }
  return ids.size;
}

/** Returns a CAPACITY_FULL issue for every month where the employee would take a NEW slot in a full month. */
export function checkCapacity(c: CapacityCheck): Issue[] {
  const issues: Issue[] = [];
  for (const month of [...new Set(c.months)].sort()) {
    if (hasReservation(c, month)) continue; // reuse existing reservation
    if (otherEmployeesInMonth(c, month) >= c.capacity) issues.push(messages.capacityFull(month, c.capacity));
  }
  return issues;
}
