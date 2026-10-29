import { computeOccupancy } from "@/domain/capacity";
import { analysePlan } from "@/domain/planRules";
import { analyseRequest } from "@/domain/requestRules";
import type { Allocation, Issue, MonthKey, MonthOccupancy } from "@/domain/types";
import { formatRange, yearMonths } from "@/domain/workingDays";
import type { DB } from "../db";
import { auditFor } from "../repos/audit";
import { listAllocations, listPlans, listRequests, type LeaveRequest, type Plan } from "../repos/leave";
import { getPolicy, getHolidays } from "../repos/settings";
import { listUsers, type User } from "../repos/users";
import { loadContextBatch, loadEmployeeContext, type EmployeeContext } from "./context";

/** Items a user may decide: managers see items routed to them; HR sees everything pending. */
export function approvalScope(user: User) {
  return user.role === "hr" ? {} : { approverId: user.id };
}

/** "Needs your attention" figures for the dashboard (managers and HR). */
export async function attentionSummary(db: DB, user: User, year: number, today: string) {
  if (user.role !== "manager" && user.role !== "hr") return null;
  const scope = approvalScope(user);
  const [policy, plans, requests, allocations] = await Promise.all([
    getPolicy(db),
    listPlans(db, { ...scope, status: ["submitted"] }),
    listRequests(db, { ...scope, status: ["pending"] }),
    listAllocations(db, year),
  ]);
  const items = [...plans, ...requests].filter((i) => i.employeeId !== user.id);
  const overdue = items.filter((i) => i.submittedAt && (Date.parse(today) - Date.parse(i.submittedAt.slice(0, 10))) / 86_400_000 > policy.overdueApprovalDays).length;
  const occ = computeOccupancy(allocations, yearMonths(year), policy.monthlyCapacity, policy.restrictedMonths);
  return {
    pending: items.length,
    overdue,
    fullMonths: Object.values(occ).filter((o) => o.status === "full").map((o) => o.month),
  };
}

export async function pendingApprovalCount(db: DB, user: User): Promise<number> {
  if (user.role !== "manager" && user.role !== "hr") return 0;
  const scope = approvalScope(user);
  const [plans, requests] = await Promise.all([
    listPlans(db, { ...scope, status: ["submitted"] }),
    listRequests(db, { ...scope, status: ["pending"] }),
  ]);
  return [...plans, ...requests].filter((i) => i.employeeId !== user.id).length;
}

/**
 * Allocations safe to send to an employee's browser: other employees are replaced by anonymous
 * negative ids so client-side previews can run the same capacity rules without revealing who is on leave.
 */
export function anonymisedAllocations(allocations: Allocation[], selfId: number): Allocation[] {
  const alias = new Map<number, number>();
  return allocations.map((a) => {
    if (a.employeeId === selfId) return a;
    if (!alias.has(a.employeeId)) alias.set(a.employeeId, -(alias.size + 1));
    return { ...a, employeeId: alias.get(a.employeeId)!, sourceId: 0 };
  });
}

/** Everything the plan editor, request form and calendar need for instant client-side validation. */
export async function calendarData(db: DB, user: User, year: number) {
  const [ctx, holidays] = await Promise.all([loadEmployeeContext(db, user.id, year), getHolidays(db)]);
  const policy = ctx.policy;
  return {
    year,
    today: ctx.today,
    employeeId: user.id,
    entitlement: ctx.entitlement,
    restrictedMonths: policy.restrictedMonths,
    capacity: policy.monthlyCapacity,
    leaveTypes: policy.leaveTypes,
    holidays: holidays.map((h) => ({ date: h.date, name: h.name })),
    allocations: anonymisedAllocations(ctx.allocations, user.id),
    occupancy: occupancyCounts(computeOccupancy(ctx.allocations, yearMonths(year), policy.monthlyCapacity, policy.restrictedMonths)),
    approvedPlan: ctx.approvedPlan ? { id: ctx.approvedPlan.id, version: ctx.approvedPlan.version, periods: ctx.approvedPlan.periods, monthly: ctx.approvedPlan.monthly } : null,
    requests: ctx.requests.map((r) => ({ id: r.id, start: r.start, end: r.end, status: r.status, days: r.days })),
    balance: ctx.balance,
  };
}
export type CalendarData = Awaited<ReturnType<typeof calendarData>>;

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
 * The approvals inbox. Rule checks run in memory against batched per-year contexts — the same
 * domain functions the services use — so the page needs a fixed number of queries, not several per item.
 */
export async function approvalQueue(db: DB, user: User): Promise<{ pending: QueueItem[]; decided: QueueItem[] }> {
  const scope = approvalScope(user);
  const notMine = <T extends { employeeId: number }>(x: T) => x.employeeId !== user.id;
  const decidedFilter = <T extends { decidedBy: number | null; employeeId: number }>(x: T) =>
    x.decidedBy !== null && (user.role === "hr" || x.decidedBy === user.id) && x.employeeId !== user.id;

  const [allUsers, pendingPlans, pendingReqs, decidedPlans, decidedReqs] = await Promise.all([
    listUsers(db),
    listPlans(db, { ...scope, status: ["submitted"] }),
    listRequests(db, { ...scope, status: ["pending"] }),
    listPlans(db, { status: ["approved", "rejected", "returned", "superseded"] }),
    listRequests(db, { status: ["approved", "rejected", "returned", "cancelled"] }),
  ]);
  const byDecision = (x: { decidedAt: string | null }) => x.decidedAt ?? "";
  const plansIn = [...pendingPlans.filter(notMine).map((p) => ({ p, pending: true })),
    ...decidedPlans.filter(decidedFilter).sort((a, b) => byDecision(b).localeCompare(byDecision(a))).slice(0, 50).map((p) => ({ p, pending: false }))];
  const reqsIn = [...pendingReqs.filter(notMine).map((r) => ({ r, pending: true })),
    ...decidedReqs.filter(decidedFilter).sort((a, b) => byDecision(b).localeCompare(byDecision(a))).slice(0, 50).map((r) => ({ r, pending: false }))];

  const users = new Map(allUsers.map((u) => [u.id, u]));
  const years = [...new Set([...plansIn.map((x) => x.p.year), ...reqsIn.map((x) => x.r.year)])];
  const [contexts, planHistory, reqHistory, previousPlans] = await Promise.all([
    Promise.all(years.map(async (y) => [y, await loadContextBatch(db, y, allUsers)] as const)).then((e) => new Map(e)),
    auditFor(db, "plan", plansIn.map((x) => x.p.id)),
    auditFor(db, "request", reqsIn.map((x) => x.r.id)),
    Promise.all(plansIn.filter((x) => x.p.amendsPlanId).map(async (x) => (await listPlans(db, { employeeId: x.p.employeeId, year: x.p.year })).find((q) => q.id === x.p.amendsPlanId))),
  ]);
  const prevById = new Map(previousPlans.filter((p): p is Plan => !!p).map((p) => [p.id, p]));

  const build = (kind: "plan" | "request", p: Plan | undefined, r: LeaveRequest | undefined, analyse: boolean): QueueItem => {
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

  const all = [
    ...plansIn.map((x) => ({ pending: x.pending, item: build("plan", x.p, undefined, x.pending) })),
    ...reqsIn.map((x) => ({ pending: x.pending, item: build("request", undefined, x.r, x.pending) })),
  ];
  const pending = all.filter((x) => x.pending).map((x) => x.item).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const decidedAt = (i: QueueItem) => (i.plan?.decidedAt ?? i.request?.decidedAt ?? "") as string;
  const decided = all.filter((x) => !x.pending).map((x) => x.item).sort((a, b) => decidedAt(b).localeCompare(decidedAt(a))).slice(0, 50);
  return { pending, decided };
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
