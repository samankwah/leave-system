import { computeOccupancy } from "@/domain/capacity";
import type { MonthKey } from "@/domain/types";
import { monthLabel } from "@/domain/workingDays";
import type { DB } from "../db";
import { forbidden } from "../errors";
import { listAllocations } from "../repos/leave";
import { notify } from "../repos/notifications";
import { getPolicy, getRoutes } from "../repos/settings";
import { getUser, usersByRole, type User } from "../repos/users";

/**
 * Resolves who decides an employee's plans and requests from the configurable approval routes.
 * Returns a user id, or null meaning "any HR Administrator".
 */
export async function resolveApprover(db: DB, employee: User): Promise<number | null> {
  const routes = (await getRoutes(db)).filter((r) => r.active === 1);
  const match = routes.find(
    (r) =>
      (r.scope_type === "department" && Number(r.scope_value) === employee.departmentId) ||
      (r.scope_type === "category" && r.scope_value === employee.categoryCode) ||
      (r.scope_type === "role" && r.scope_value === employee.role) ||
      r.scope_type === "default",
  );
  const mode = match?.approver_mode ?? "line_manager";
  let approver: number | null = null;
  if (mode === "specific_user") approver = match?.approver_user_id ?? null;
  if (mode === "line_manager") approver = employee.managerId;
  // Never route to oneself or to an inactive user; fall back to the HR pool.
  if (approver === employee.id || (approver && !(await getUser(db, approver))?.active)) approver = null;
  return approver;
}

/** Recipients for "awaiting your decision" notifications. */
export async function approverRecipients(db: DB, approverId: number | null): Promise<number[]> {
  return approverId ? [approverId] : (await usersByRole(db, "hr")).map((u) => u.id);
}

/** Managers may decide items routed to them; HR may decide any item. Nobody decides their own leave. */
export function assertCanDecide(actor: User, item: { employeeId: number; approverId: number | null }) {
  if (actor.id === item.employeeId) throw forbidden("You cannot approve or reject your own leave.");
  if (actor.role === "hr") return;
  if (actor.role === "manager" && item.approverId === actor.id) return;
  throw forbidden("This item is not assigned to you for approval.");
}

export const canApprove = (u: User) => u.role === "manager" || u.role === "hr";

/** Notifies HR when an action fills a month's capacity. */
export async function notifyIfMonthsFull(db: DB, months: MonthKey[], year: number) {
  const policy = await getPolicy(db);
  const occ = computeOccupancy(await listAllocations(db, year), months, policy.monthlyCapacity, policy.restrictedMonths);
  for (const m of months) {
    if (occ[m] && occ[m].count >= policy.monthlyCapacity) {
      await notify(
        db, (await usersByRole(db, "hr")).map((u) => u.id), "capacity",
        `${monthLabel(m)} is fully booked`,
        `${occ[m].count} of ${policy.monthlyCapacity} employee slots are now reserved for ${monthLabel(m)}. New allocations for this month will be blocked.`,
        "/hr/roster",
      );
    }
  }
}
