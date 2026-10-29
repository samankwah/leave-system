import { computeOccupancy } from "@/domain/capacity";
import type { Allocation, Issue, MonthKey, MonthOccupancy } from "@/domain/types";
import { formatRange, yearMonths } from "@/domain/workingDays";
import type { DB } from "../db";
import { listAudit } from "../repos/audit";
import { listAllocations, listPlans, listRequests, type LeaveRequest, type Plan } from "../repos/leave";
import { getPolicy, getHolidays } from "../repos/settings";
import { listUsers, type User } from "../repos/users";
import { loadContextBatch, loadEmployeeContext } from "./context";
import { analyseForEmployee } from "./planService";
import { analyseRequestFor } from "./requestService";

/** Items a user may decide: managers see items routed to them; HR sees everything pending. */
export function approvalScope(user: User) {
  return user.role === "hr" ? {} : { approverId: user.id };
}

/** "Needs your attention" figures for the dashboard (managers and HR). */
export function attentionSummary(db: DB, user: User, year: number, today: string) {
  if (user.role !== "manager" && user.role !== "hr") return null;
  const scope = approvalScope(user);
  const overdueAfter = getPolicy(db).overdueApprovalDays;
  const items = [
    ...listPlans(db, { ...scope, status: ["submitted"] }).map((p) => p.submittedAt ?? ""),
    ...listRequests(db, { ...scope, status: ["pending"] }).map((r) => r.submittedAt),
  ];
  const overdue = items.filter((s) => s && (Date.parse(today) - Date.parse(s.slice(0, 10))) / 86_400_000 > overdueAfter).length;
  const policy = getPolicy(db);
  const occ = computeOccupancy(listAllocations(db, year), yearMonths(year), policy.monthlyCapacity, policy.restrictedMonths);
  return {
    pending: pendingApprovalCount(db, user),
    overdue,
    fullMonths: Object.values(occ).filter((o) => o.status === "full").map((o) => o.month),
  };
}

export function pendingApprovalCount(db: DB, user: User): number {
  if (user.role !== "manager" && user.role !== "hr") return 0;
  const scope = approvalScope(user);
  return [
    ...listPlans(db, { ...scope, status: ["submitted"] }),
    ...listRequests(db, { ...scope, status: ["pending"] }),
  ].filter((i) => i.employeeId !== user.id).length;
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
export function calendarData(db: DB, user: User, year: number) {
  const ctx = loadEmployeeContext(db, user.id, year);
  const policy = getPolicy(db);
  return {
    year,
    today: ctx.today,
    employeeId: user.id,
    entitlement: ctx.entitlement,
    restrictedMonths: policy.restrictedMonths,
    capacity: policy.monthlyCapacity,
    leaveTypes: policy.leaveTypes,
    holidays: getHolidays(db).map((h) => ({ date: h.date, name: h.name })),
    allocations: anonymisedAllocations(ctx.allocations, user.id),
    occupancy: occupancyCounts(computeOccupancy(ctx.allocations, yearMonths(year), policy.monthlyCapacity, policy.restrictedMonths)),
    approvedPlan: ctx.approvedPlan ? { id: ctx.approvedPlan.id, version: ctx.approvedPlan.version, periods: ctx.approvedPlan.periods, monthly: ctx.approvedPlan.monthly } : null,
    requests: ctx.requests.map((r) => ({ id: r.id, start: r.start, end: r.end, status: r.status, days: r.days })),
    balance: ctx.balance,
  };
}
export type CalendarData = ReturnType<typeof calendarData>;

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
  balance: ReturnType<typeof loadEmployeeContext>["balance"];
  history: { ts: string; actor: string; summary: string }[];
}

export function approvalQueue(db: DB, user: User): { pending: QueueItem[]; decided: QueueItem[] } {
  const scope = approvalScope(user);
  const allUsers = listUsers(db);
  const users = new Map(allUsers.map((u) => [u.id, u]));
  const policy = getPolicy(db);
  const ctxByYear = new Map<number, ReturnType<typeof loadContextBatch>>();
  const ctxOf = (employeeId: number, year: number) => {
    if (!ctxByYear.has(year)) ctxByYear.set(year, loadContextBatch(db, year, allUsers));
    return ctxByYear.get(year)!.get(employeeId)!;
  };
  const occByYear = new Map<number, Record<MonthKey, MonthOccupancy>>();
  const occ = (year: number) => {
    if (!occByYear.has(year)) occByYear.set(year, computeOccupancy(listAllocations(db, year), yearMonths(year), policy.monthlyCapacity, policy.restrictedMonths));
    return occByYear.get(year)!;
  };

  const build = (kind: "plan" | "request", p: Plan | undefined, r: LeaveRequest | undefined, analyse: boolean): QueueItem => {
    const employeeId = (p ?? r)!.employeeId;
    const year = (p ?? r)!.year;
    const u = users.get(employeeId)!;
    const ctx = ctxOf(employeeId, year);
    const monthly = p ? p.monthly : r!.breakdown;
    const o = occ(year);
    // Names of others off that month are shown to HR, or to a manager for their own reports; others are counted only.
    const capacity = Object.fromEntries(Object.keys(monthly).map((m) => {
      const others = (o[m]?.employeeIds ?? []).filter((id) => id !== employeeId).map((id) => users.get(id)).filter((x): x is User => !!x);
      const visible = others.filter((x) => user.role === "hr" || x.managerId === user.id);
      return [m, {
        count: o[m]?.count ?? 0, capacity: policy.monthlyCapacity, includesEmployee: o[m]?.employeeIds.includes(employeeId) ?? false,
        status: o[m]?.status ?? "available", others: visible.map((x) => x.fullName), hiddenOthers: others.length - visible.length,
      }];
    }));
    let issues: QueueItem["issues"] = [];
    let planMonthly: Record<MonthKey, number> | undefined;
    if (analyse && p) issues = analyseForEmployee(db, employeeId, year, p.periods, "approve", p.id).issues;
    if (r) {
      const a = analyseRequestFor(db, employeeId, r, "approve", r.id);
      planMonthly = a.planBreakdown;
      if (analyse) issues = a.issues;
    }
    return {
      kind,
      id: (p ?? r)!.id,
      employee: { id: u.id, name: u.fullName, employeeId: u.employeeId, department: u.departmentName ?? "", category: u.categoryName, title: u.jobTitle },
      submittedAt: (p ? p.submittedAt : r!.submittedAt) ?? "",
      approverName: (p ?? r)!.approverName,
      summary: p
        ? `${p.amendsPlanId ? "Plan amendment" : "Master leave plan"} ${p.year} v${p.version}: ${p.periods.map(formatRange).join("; ")}`
        : `${r!.leaveType}: ${formatRange(r!)}`,
      days: p ? p.totalDays : r!.days,
      plan: p,
      previousPlan: p?.amendsPlanId ? listPlans(db, { employeeId, year }).find((x) => x.id === p.amendsPlanId) : undefined,
      request: r,
      approvedPlan: ctx.approvedPlan,
      issues,
      monthly,
      planMonthly,
      capacity,
      balance: ctx.balance,
      history: listAudit(db, { entityType: kind, entityId: (p ?? r)!.id }).map((a) => ({ ts: a.ts, actor: a.actor_name, summary: a.summary })).reverse(),
    };
  };

  const notMine = <T extends { employeeId: number }>(x: T) => x.employeeId !== user.id;
  const pending = [
    ...listPlans(db, { ...scope, status: ["submitted"] }).filter(notMine).map((p) => build("plan", p, undefined, true)),
    ...listRequests(db, { ...scope, status: ["pending"] }).filter(notMine).map((r) => build("request", undefined, r, true)),
  ].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  const decidedFilter = <T extends { decidedBy: number | null; employeeId: number }>(x: T) =>
    x.decidedBy !== null && (user.role === "hr" || x.decidedBy === user.id) && x.employeeId !== user.id;
  const decided = [
    ...listPlans(db, { status: ["approved", "rejected", "returned", "superseded"] }).filter(decidedFilter).map((p) => build("plan", p, undefined, false)),
    ...listRequests(db, { status: ["approved", "rejected", "returned", "cancelled"] }).filter(decidedFilter).map((r) => build("request", undefined, r, false)),
  ].sort((a, b) => ((b.plan?.decidedAt ?? b.request?.decidedAt ?? "") as string).localeCompare((a.plan?.decidedAt ?? a.request?.decidedAt ?? "") as string)).slice(0, 50);

  return { pending, decided };
}

export interface WallchartData {
  employees: { id: number; name: string; department: string }[];
  spans: { employeeId: number; start: string; end: string; kind: "approved" | "pending" | "plan" | "plan-pending" }[];
}

/** Day-level spans per person for the team wallchart: managers see their team, HR sees everyone. */
export function wallchart(db: DB, user: User, year: number): WallchartData {
  const all = listUsers(db, { activeOnly: true });
  const team = user.role === "hr" ? all : all.filter((u) => u.managerId === user.id || u.id === user.id);
  const ids = new Set(team.map((u) => u.id));
  const spans: WallchartData["spans"] = [];
  for (const p of listPlans(db, { year, status: ["approved", "submitted"] })) {
    if (!ids.has(p.employeeId)) continue;
    for (const pp of p.periods) spans.push({ employeeId: p.employeeId, start: pp.start, end: pp.end, kind: p.status === "approved" ? "plan" : "plan-pending" });
  }
  for (const r of listRequests(db, { year, status: ["approved", "pending"] })) {
    if (ids.has(r.employeeId)) spans.push({ employeeId: r.employeeId, start: r.start, end: r.end, kind: r.status === "approved" ? "approved" : "pending" });
  }
  return {
    employees: team.map((u) => ({ id: u.id, name: u.fullName, department: u.departmentName ?? "—" })).sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name)),
    spans,
  };
}
