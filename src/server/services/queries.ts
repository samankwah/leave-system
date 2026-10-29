import { computeOccupancy } from "@/domain/capacity";
import { analysePlan } from "@/domain/planRules";
import { analyseRequest } from "@/domain/requestRules";
import type { Allocation, Issue, MonthKey, MonthOccupancy } from "@/domain/types";
import { formatRange, yearMonths } from "@/domain/workingDays";
import { get, type DB } from "../db";
import { auditFor } from "../repos/audit";
import { listPlans, listRequests, type LeaveRequest, type Plan } from "../repos/leave";
import { getHolidays } from "../repos/settings";
import { listUsers, type User } from "../repos/users";
import { loadContextBatch, loadEmployeeContext, type EmployeeContext } from "./context";

/** Items a user may decide: managers see items routed to them; HR sees everything pending. */
export function approvalScope(user: User) {
  return user.role === "hr" ? {} : { approverId: user.id };
}

/**
 * Pending (and overdue) approval counts for a manager's queue or the HR pool, in a single COUNT
 * query. The layout shows this badge on every page, so it must not hydrate plans or requests.
 */
export async function approvalCounts(db: DB, user: User, overdueBefore?: string): Promise<{ pending: number; overdue: number }> {
  if (user.role !== "manager" && user.role !== "hr") return { pending: 0, overdue: 0 };
  const scoped = user.role !== "hr";
  const scope = scoped ? "AND approver_id = ?" : "";
  const p = (extra: (string | number)[] = []) => [user.id, ...(scoped ? [user.id] : []), ...extra];
  const before = overdueBefore ?? "0000";
  const r = await get<{ pending: number; overdue: number }>(
    db,
    `SELECT
       ((SELECT COUNT(*) FROM master_plans WHERE status = 'submitted' AND employee_id <> ? ${scope})
      + (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending' AND employee_id <> ? ${scope}))::int AS pending,
       ((SELECT COUNT(*) FROM master_plans WHERE status = 'submitted' AND employee_id <> ? ${scope} AND submitted_at < ?)
      + (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending' AND employee_id <> ? ${scope} AND submitted_at < ?))::int AS overdue`,
    ...p(), ...p(), ...p([before]), ...p([before]),
  );
  return { pending: r?.pending ?? 0, overdue: overdueBefore ? r?.overdue ?? 0 : 0 };
}

export async function pendingApprovalCount(db: DB, user: User): Promise<number> {
  return (await approvalCounts(db, user)).pending;
}

/** "Needs your attention" figures for the dashboard; reuses the already-loaded context (policy, allocations). */
export async function attentionSummary(db: DB, user: User, ctx: Pick<EmployeeContext, "policy" | "allocations" | "today" | "year">) {
  if (user.role !== "manager" && user.role !== "hr") return null;
  const cutoff = new Date(Date.parse(ctx.today) - ctx.policy.overdueApprovalDays * 86_400_000).toISOString().slice(0, 10);
  const counts = await approvalCounts(db, user, cutoff);
  const occ = computeOccupancy(ctx.allocations, yearMonths(ctx.year), ctx.policy.monthlyCapacity, ctx.policy.restrictedMonths);
  return {
    pending: counts.pending,
    overdue: counts.overdue,
    fullMonths: Object.values(occ).filter((o) => o.status === "full").map((o) => o.month),
  };
}

/**
 * Allocations safe (and compact) to send to an employee's browser. Other employees collapse to one
 * anonymous entry per person per month (negative ids, not linked across months), so client-side
 * previews run the same capacity rules without revealing who is on leave. Size is bounded by the
 * monthly capacity, not the size of the organisation.
 */
export function anonymisedAllocations(allocations: Allocation[], selfId: number): Allocation[] {
  const own = allocations.filter((a) => a.employeeId === selfId);
  const others = new Map<string, Allocation>();
  for (const a of allocations) {
    if (a.employeeId === selfId || a.days <= 0) continue;
    const k = `${a.month}|${a.employeeId}`;
    const prev = others.get(k);
    others.set(k, { ...a, approved: a.approved || !!prev?.approved, days: (prev?.days ?? 0) + a.days });
  }
  const perMonth = new Map<string, number>();
  const anon = [...others.values()].map((a) => {
    const n = (perMonth.get(a.month) ?? 0) + 1;
    perMonth.set(a.month, n);
    return { ...a, employeeId: -n, sourceType: "plan" as const, sourceId: 0 };
  });
  return [...own, ...anon];
}

/** Builds the client calendar payload from an already-loaded context (no extra queries beyond holidays). */
export function calendarDataFrom(ctx: EmployeeContext, holidays: { date: string; name: string }[]) {
  const policy = ctx.policy;
  return {
    year: ctx.year,
    today: ctx.today,
    employeeId: ctx.user.id,
    entitlement: ctx.entitlement,
    restrictedMonths: policy.restrictedMonths,
    capacity: policy.monthlyCapacity,
    leaveTypes: policy.leaveTypes,
    holidays: holidays.map((h) => ({ date: h.date, name: h.name })),
    allocations: anonymisedAllocations(ctx.allocations, ctx.user.id),
    occupancy: occupancyCounts(computeOccupancy(ctx.allocations, yearMonths(ctx.year), policy.monthlyCapacity, policy.restrictedMonths)),
    approvedPlan: ctx.approvedPlan ? { id: ctx.approvedPlan.id, version: ctx.approvedPlan.version, periods: ctx.approvedPlan.periods, monthly: ctx.approvedPlan.monthly } : null,
    requests: ctx.requests.map((r) => ({ id: r.id, start: r.start, end: r.end, status: r.status, days: r.days })),
    balance: ctx.balance,
  };
}

/**
 * Everything the plan editor, request form and calendar need for instant client-side validation.
 * Holidays are limited to the year shown (plus the first days of the next, for December/January views).
 */
export async function calendarData(db: DB, user: User, year: number) {
  const [ctx, holidays] = await Promise.all([loadEmployeeContext(db, user.id, year), getHolidays(db, year)]);
  return calendarDataFrom(ctx, holidays);
}
export type CalendarData = ReturnType<typeof calendarDataFrom>;

/** Strip occupancy to counts only (no employee ids) for employee-facing pages. */
export function occupancyCounts(occ: Record<MonthKey, MonthOccupancy>) {
  return Object.fromEntries(Object.entries(occ).map(([k, v]) => [k, { ...v, employeeIds: [], approvedEmployeeIds: [], pendingOnlyEmployeeIds: [] }]));
}

export interface QueueItem {
  kind: "plan" | "request";
  id: number;
  employee: { id: number; name: string; employeeId: string; department: string; category: string; title: string };
  submittedAt: string;
  approverName: string | null;
  summary: string;
  days: number;
  plan?: Plan;
  previousPlan?: Plan;
  request?: LeaveRequest;
  approvedPlan?: Plan;
  issues: Issue[];
  monthly: Record<MonthKey, number>;
  planMonthly?: Record<MonthKey, number>;
  capacity: Record<MonthKey, { count: number; capacity: number; includesEmployee: boolean; status: string; others: string[]; hiddenOthers: number }>;
  balance: EmployeeContext["balance"];
  history: { ts: string; actor: string; summary: string }[];
}

/**
 * The approvals inbox. Rule checks run in memory against batched per-year contexts, using the same
 * domain functions the services use, so the page needs a fixed number of queries rather than several per item.
 * `view: "pending"` builds the decision queue; `view: "decided"` the 50 most recent decisions (limited in SQL).
 */
export async function approvalQueue(db: DB, user: User, view: "pending" | "decided" = "pending"): Promise<QueueItem[]> {
  const scope = approvalScope(user);
  const decidedScope = user.role === "hr" ? {} : { decidedBy: user.id };
  const [allUsers, plans, reqs] = await Promise.all([
    listUsers(db),
    view === "pending"
      ? listPlans(db, { ...scope, status: ["submitted"], notEmployeeId: user.id })
      : listPlans(db, { ...decidedScope, decided: true, status: ["approved", "rejected", "returned", "superseded"], notEmployeeId: user.id, limit: 50 }),
    view === "pending"
      ? listRequests(db, { ...scope, status: ["pending"], notEmployeeId: user.id })
      : listRequests(db, { ...decidedScope, decided: true, status: ["approved", "rejected", "returned", "cancelled"], notEmployeeId: user.id, limit: 50 }),
  ]);
  const analyse = view === "pending";

  const users = new Map(allUsers.map((u) => [u.id, u]));
  const years = [...new Set([...plans.map((p) => p.year), ...reqs.map((r) => r.year)])];
  const [contexts, planHistory, reqHistory, previousPlans] = await Promise.all([
    Promise.all(years.map(async (y) => [y, await loadContextBatch(db, y, allUsers)] as const)).then((e) => new Map(e)),
    auditFor(db, "plan", plans.map((p) => p.id)),
    auditFor(db, "request", reqs.map((r) => r.id)),
    Promise.all(plans.filter((p) => p.amendsPlanId).map(async (p) => (await listPlans(db, { employeeId: p.employeeId, year: p.year })).find((q) => q.id === p.amendsPlanId))),
  ]);
  const prevById = new Map(previousPlans.filter((p): p is Plan => !!p).map((p) => [p.id, p]));

  const build = (kind: "plan" | "request", p: Plan | undefined, r: LeaveRequest | undefined): QueueItem => {
    const item = (p ?? r)!;
    const u = users.get(item.employeeId)!;
    const ctx = contexts.get(item.year)!.get(item.employeeId)!;
    const policy = ctx.policy;
    const monthly = p ? p.monthly : r!.breakdown;
    const o = computeOccupancy(ctx.allocations, Object.keys(monthly), policy.monthlyCapacity, policy.restrictedMonths);
    // Names of others off that month are shown to HR, or to a manager for their own reports; others are counted only.
    const capacity = Object.fromEntries(Object.keys(monthly).map((m) => {
      const others = (o[m]?.employeeIds ?? []).filter((id) => id !== item.employeeId).map((id) => users.get(id)).filter((x): x is User => !!x);
      const visible = others.filter((x) => user.role === "hr" || x.managerId === user.id);
      return [m, {
        count: o[m]?.count ?? 0, capacity: policy.monthlyCapacity, includesEmployee: o[m]?.employeeIds.includes(item.employeeId) ?? false,
        status: o[m]?.status ?? "available", others: visible.map((x) => x.fullName), hiddenOthers: others.length - visible.length,
      }];
    }));
    let issues: Issue[] = [];
    let planMonthly: Record<MonthKey, number> | undefined;
    if (analyse && p) {
      issues = analysePlan(p.periods, {
        employeeId: p.employeeId, planId: p.id, year: p.year, entitlement: ctx.entitlement, holidays: ctx.holidays,
        restrictedMonths: policy.restrictedMonths, capacity: policy.monthlyCapacity, allocations: ctx.allocations,
        approvedRequests: ctx.requests.filter((x) => x.status === "approved"), mode: "approve",
      }).issues;
    }
    if (r) {
      const a = analyseRequest(r, {
        employeeId: r.employeeId, requestId: r.id, today: ctx.today, holidays: ctx.holidays, restrictedMonths: policy.restrictedMonths,
        capacity: policy.monthlyCapacity, entitlement: ctx.entitlement, approvedPlan: ctx.approvedPlan?.periods ?? null,
        existing: ctx.activeRequests, allocations: ctx.allocations, mode: "approve",
      });
      planMonthly = a.planBreakdown;
      if (analyse) issues = a.issues;
    }
    const history = (kind === "plan" ? planHistory : reqHistory).get(item.id) ?? [];
    return {
      kind,
      id: item.id,
      employee: { id: u.id, name: u.fullName, employeeId: u.employeeId, department: u.departmentName ?? "", category: u.categoryName, title: u.jobTitle },
      submittedAt: (p ? p.submittedAt : r!.submittedAt) ?? "",
      approverName: item.approverName,
      summary: p
        ? `${p.amendsPlanId ? "Plan amendment" : "Master leave plan"} ${p.year} v${p.version}: ${p.periods.map(formatRange).join("; ")}`
        : `${r!.leaveType}: ${formatRange(r!)}`,
      days: p ? p.totalDays : r!.days,
      plan: p,
      previousPlan: p?.amendsPlanId ? prevById.get(p.amendsPlanId) : undefined,
      request: r,
      approvedPlan: ctx.approvedPlan,
      issues,
      monthly,
      planMonthly,
      capacity,
      balance: ctx.balance,
      history: history.map((a) => ({ ts: a.ts, actor: a.actor_name, summary: a.summary })).reverse(),
    };
  };

  const items = [...plans.map((p) => build("plan", p, undefined)), ...reqs.map((r) => build("request", undefined, r))];
  if (view === "pending") return items.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const decidedAt = (i: QueueItem) => (i.plan?.decidedAt ?? i.request?.decidedAt ?? "") as string;
  return items.sort((a, b) => decidedAt(b).localeCompare(decidedAt(a))).slice(0, 50);
}

export interface WallchartData {
  employees: { id: number; name: string; department: string }[];
  spans: { employeeId: number; start: string; end: string; kind: "approved" | "pending" | "plan" | "plan-pending" }[];
}

/** Day-level spans per person for the team wallchart: managers see their team, HR sees everyone. */
export async function wallchart(db: DB, user: User, year: number): Promise<WallchartData> {
  const [all, plans, requests] = await Promise.all([
    listUsers(db, { activeOnly: true }),
    listPlans(db, { year, status: ["approved", "submitted"] }),
    listRequests(db, { year, status: ["approved", "pending"] }),
  ]);
  const team = user.role === "hr" ? all : all.filter((u) => u.managerId === user.id || u.id === user.id);
  const ids = new Set(team.map((u) => u.id));
  const spans: WallchartData["spans"] = [];
  for (const p of plans) {
    if (!ids.has(p.employeeId)) continue;
    for (const pp of p.periods) spans.push({ employeeId: p.employeeId, start: pp.start, end: pp.end, kind: p.status === "approved" ? "plan" : "plan-pending" });
  }
  for (const r of requests) {
    if (ids.has(r.employeeId)) spans.push({ employeeId: r.employeeId, start: r.start, end: r.end, kind: r.status === "approved" ? "approved" : "pending" });
  }
  return {
    employees: team.map((u) => ({ id: u.id, name: u.fullName, department: u.departmentName ?? "—" })).sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name)),
    spans,
  };
}

export interface TeamLeave {
  requests: LeaveRequest[];
  plans: Plan[];
  /** Department name per employee id, for display and the HR department filter. */
  departments: Record<number, string>;
}

/**
 * Other people's requests and plans for a year: a manager sees their direct reports and anything routed
 * to them; HR sees everyone. The viewer's own items are left out (they are on My requests / Annual plan).
 */
export async function teamLeave(db: DB, user: User, year: number): Promise<TeamLeave> {
  if (user.role !== "manager" && user.role !== "hr") return { requests: [], plans: [], departments: {} };
  const scope = user.role === "hr" ? {} : { managerId: user.id };
  const [requests, plans, users] = await Promise.all([
    listRequests(db, { ...scope, year, notEmployeeId: user.id }),
    listPlans(db, { ...scope, year, notEmployeeId: user.id, status: ["submitted", "returned", "rejected", "approved"] }),
    listUsers(db),
  ]);
  const departments = Object.fromEntries(users.map((u) => [u.id, u.departmentName ?? "—"]));
  return { requests, plans, departments };
}
