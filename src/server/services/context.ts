import { computeBalance, computeCarryover, type Balance } from "@/domain/balance";
import type { ExistingRequest } from "@/domain/requestRules";
import type { Allocation, PolicySettings, StaffCategory } from "@/domain/types";
import { todayIso, type DB } from "../db";
import { listAllocations, listPlans, listRequests, type LeaveRequest, type Plan } from "../repos/leave";
import { getCategories, getPolicy, holidaySet } from "../repos/settings";
import { getUser, listUsers, type User } from "../repos/users";
import { notFound } from "../errors";

export interface EmployeeContext {
  user: User;
  year: number;
  today: string;
  policy: PolicySettings;
  holidays: Set<string>;
  baseEntitlement: number;
  carryover: number;
  entitlement: number;
  approvedPlan?: Plan;
  workingPlan?: Plan;
  requests: LeaveRequest[];
  /** Pending + approved requests, in the shape the validation rules expect. */
  activeRequests: ExistingRequest[];
  allocations: Allocation[];
  balance: Balance;
}

/** Data shared by every employee's context for one leave year — loaded once, then reused. */
interface YearData {
  year: number;
  today: string;
  policy: PolicySettings;
  holidays: Set<string>;
  categories: Map<string, StaffCategory>;
  allocations: Allocation[];
  plans: Map<number, Plan[]>;
  requests: Map<number, LeaveRequest[]>;
  prevApproved: Map<number, number>;
}

function groupBy<T>(items: T[], key: (t: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return m;
}

async function loadYearData(db: DB, year: number, employeeIds?: number[]): Promise<YearData> {
  // For a single employee, query only their rows; for batches, one query per table. Queries run in parallel.
  const one = employeeIds?.length === 1 ? employeeIds[0] : undefined;
  const [policy, plans, requests, holidays, categories, allocations] = await Promise.all([
    getPolicy(db),
    listPlans(db, { year, employeeId: one }),
    listRequests(db, { year, employeeId: one }),
    holidaySet(db),
    getCategories(db),
    listAllocations(db, year),
  ]);
  const prevApproved = new Map<number, number>();
  if (policy.carryoverEnabled && policy.carryoverMaxDays > 0) {
    for (const r of await listRequests(db, { year: year - 1, status: ["approved"], employeeId: one })) {
      prevApproved.set(r.employeeId, (prevApproved.get(r.employeeId) ?? 0) + r.days);
    }
  }
  return {
    year,
    today: todayIso(),
    policy,
    holidays,
    categories: new Map(categories.map((c) => [c.code, c])),
    allocations,
    plans: groupBy(plans, (p) => p.employeeId),
    requests: groupBy(requests, (r) => r.employeeId),
    prevApproved,
  };
}

function buildContext(d: YearData, user: User): EmployeeContext {
  const base = d.categories.get(user.categoryCode)?.entitlementDays ?? 0;
  const carryover = d.policy.carryoverEnabled && d.policy.carryoverMaxDays > 0
    ? computeCarryover(base, d.prevApproved.get(user.id) ?? 0, d.policy.carryoverMaxDays)
    : 0;
  const plans = d.plans.get(user.id) ?? [];
  const approvedPlan = plans.find((p) => p.status === "approved");
  const workingPlan = plans.find((p) => p.status === "draft" || p.status === "submitted" || p.status === "returned");
  const requests = d.requests.get(user.id) ?? [];
  const active = requests.filter((r) => r.status === "pending" || r.status === "approved");
  const balance = computeBalance({
    baseEntitlement: base,
    carryover,
    approvedRequests: active.filter((r) => r.status === "approved"),
    pendingDays: active.filter((r) => r.status === "pending").reduce((s, r) => s + r.days, 0),
    plannedDays: approvedPlan?.totalDays ?? 0,
    today: d.today,
    holidays: d.holidays,
  });
  return {
    user, year: d.year, today: d.today, policy: d.policy, holidays: d.holidays,
    baseEntitlement: base,
    carryover,
    entitlement: base + carryover,
    approvedPlan,
    workingPlan,
    requests,
    activeRequests: active.map((r) => ({ id: r.id, start: r.start, end: r.end, status: r.status as "pending" | "approved", days: r.days })),
    allocations: d.allocations,
    balance,
  };
}

/** Entitlement is derived from the staff category (plus carryover when enabled); employees never set it. */
export async function entitlementOf(db: DB, user: User, year: number) {
  const c = buildContext(await loadYearData(db, year, [user.id]), user);
  return { base: c.baseEntitlement, carryover: c.carryover, total: c.entitlement };
}

export async function loadEmployeeContext(db: DB, userId: number, year: number): Promise<EmployeeContext> {
  const user = await getUser(db, userId);
  if (!user) throw notFound("Employee");
  return buildContext(await loadYearData(db, year, [userId]), user);
}

/**
 * Contexts for many employees with a fixed number of queries (policy, holidays, allocations,
 * plans and requests are each read once) — used by reports, HR lists and the approvals queue.
 */
export async function loadContextBatch(db: DB, year: number, users?: User[]): Promise<Map<number, EmployeeContext>> {
  const [d, list] = await Promise.all([loadYearData(db, year), users ?? listUsers(db)]);
  return new Map(list.map((u) => [u.id, buildContext(d, u)]));
}
