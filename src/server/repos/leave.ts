import type { Allocation, MonthKey, Period } from "@/domain/types";
import { all, get, nowIso, run, type DB } from "../db";

export type PlanStatus = "draft" | "submitted" | "approved" | "rejected" | "returned" | "superseded";
export type RequestStatus = "pending" | "approved" | "rejected" | "returned" | "cancelled";

export interface PlanPeriod extends Period { id: number; days: number }

export interface Plan {
  id: number;
  employeeId: number;
  employeeName: string;
  year: number;
  version: number;
  status: PlanStatus;
  amendsPlanId: number | null;
  totalDays: number;
  approverId: number | null;
  approverName: string | null;
  submittedAt: string | null;
  decidedBy: number | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
  periods: PlanPeriod[];
  monthly: Record<MonthKey, number>;
}

export interface LeaveRequest extends Period {
  id: number;
  employeeId: number;
  employeeName: string;
  year: number;
  leaveType: string;
  days: number;
  reason: string;
  status: RequestStatus;
  planId: number | null;
  approverId: number | null;
  approverName: string | null;
  submittedAt: string;
  decidedBy: number | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  attachmentName: string | null;
  breakdown: Record<MonthKey, number>;
}

/* ---------------------------------- plans --------------------------------- */

const PLAN_SELECT = `
  SELECT p.*, e.full_name AS employee_name, a.full_name AS approver_name, d.full_name AS decided_by_name
    FROM master_plans p
    JOIN users e ON e.id = p.employee_id
    LEFT JOIN users a ON a.id = p.approver_id
    LEFT JOIN users d ON d.id = p.decided_by`;

type PlanRow = Record<string, unknown> & { id: number };

/** Loads periods and monthly allocations for many plans in two queries (avoids N+1). */
function hydratePlans(db: DB, rows: PlanRow[]): Plan[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => "?").join(",");
  const periods = new Map<number, PlanPeriod[]>();
  for (const p of all<{ id: number; plan_id: number; start_date: string; end_date: string; working_days: number }>(
    db, `SELECT * FROM plan_periods WHERE plan_id IN (${marks}) ORDER BY start_date`, ...ids,
  )) periods.set(p.plan_id, [...(periods.get(p.plan_id) ?? []), { id: p.id, start: p.start_date, end: p.end_date, days: p.working_days }]);
  const monthly = new Map<number, Record<MonthKey, number>>();
  for (const m of all<{ plan_id: number; month: string; days: number }>(
    db, `SELECT plan_id, month, days FROM plan_month_allocations WHERE plan_id IN (${marks}) ORDER BY month`, ...ids,
  )) monthly.set(m.plan_id, { ...(monthly.get(m.plan_id) ?? {}), [m.month]: m.days });
  return rows.map((r) => mapPlan(r, periods.get(r.id) ?? [], monthly.get(r.id) ?? {}));
}

function mapPlan(r: PlanRow, periods: PlanPeriod[], monthly: Record<MonthKey, number>): Plan {
  return {
    id: r.id,
    employeeId: r.employee_id as number,
    employeeName: r.employee_name as string,
    year: r.year as number,
    version: r.version as number,
    status: r.status as PlanStatus,
    amendsPlanId: (r.amends_plan_id as number) ?? null,
    totalDays: r.total_days as number,
    approverId: (r.approver_id as number) ?? null,
    approverName: (r.approver_name as string) ?? null,
    submittedAt: (r.submitted_at as string) ?? null,
    decidedBy: (r.decided_by as number) ?? null,
    decidedByName: (r.decided_by_name as string) ?? null,
    decidedAt: (r.decided_at as string) ?? null,
    decisionReason: (r.decision_reason as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    periods,
    monthly,
  };
}

export function getPlan(db: DB, id: number): Plan | undefined {
  const r = get<PlanRow>(db, `${PLAN_SELECT} WHERE p.id = ?`, id);
  return r && hydratePlans(db, [r])[0];
}

export function listPlans(
  db: DB,
  f: { employeeId?: number; year?: number; status?: PlanStatus[]; approverId?: number } = {},
): Plan[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (f.employeeId) { where.push("p.employee_id = ?"); params.push(f.employeeId); }
  if (f.year) { where.push("p.year = ?"); params.push(f.year); }
  if (f.approverId) { where.push("p.approver_id = ?"); params.push(f.approverId); }
  if (f.status?.length) { where.push(`p.status IN (${f.status.map(() => "?").join(",")})`); params.push(...f.status); }
  const sql = `${PLAN_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.year DESC, e.full_name, p.version DESC`;
  return hydratePlans(db, all<PlanRow>(db, sql, ...params));
}

export function getApprovedPlan(db: DB, employeeId: number, year: number) {
  return listPlans(db, { employeeId, year, status: ["approved"] })[0];
}

/** The plan currently being worked on (draft, submitted or returned), if any. */
export function getWorkingPlan(db: DB, employeeId: number, year: number) {
  return listPlans(db, { employeeId, year, status: ["draft", "submitted", "returned"] })[0];
}

export function nextPlanVersion(db: DB, employeeId: number, year: number): number {
  return (get<{ v: number | null }>(db, "SELECT MAX(version) AS v FROM master_plans WHERE employee_id = ? AND year = ?", employeeId, year)?.v ?? 0) + 1;
}

export function insertPlan(
  db: DB,
  p: { employeeId: number; year: number; status: PlanStatus; amendsPlanId?: number | null; createdAt?: string },
): number {
  const ts = p.createdAt ?? nowIso();
  return run(
    db,
    `INSERT INTO master_plans (employee_id, year, version, status, amends_plan_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    p.employeeId, p.year, nextPlanVersion(db, p.employeeId, p.year), p.status, p.amendsPlanId ?? null, ts, ts,
  ).lastId;
}

export function replacePlanPeriods(
  db: DB,
  planId: number,
  periods: { start: string; end: string; days: number }[],
  monthly: Record<MonthKey, number>,
) {
  run(db, "DELETE FROM plan_periods WHERE plan_id = ?", planId);
  run(db, "DELETE FROM plan_month_allocations WHERE plan_id = ?", planId);
  for (const p of periods) {
    run(db, "INSERT INTO plan_periods (plan_id, start_date, end_date, working_days) VALUES (?, ?, ?, ?)", planId, p.start, p.end, p.days);
  }
  for (const [month, days] of Object.entries(monthly)) {
    run(db, "INSERT INTO plan_month_allocations (plan_id, month, days) VALUES (?, ?, ?)", planId, month, days);
  }
  const total = Object.values(monthly).reduce((a, b) => a + b, 0);
  run(db, "UPDATE master_plans SET total_days = ?, updated_at = ? WHERE id = ?", total, nowIso(), planId);
}

export function updatePlan(db: DB, id: number, fields: Partial<Record<
  "status" | "approver_id" | "submitted_at" | "decided_by" | "decided_at" | "decision_reason", string | number | null
>>) {
  const keys = Object.keys(fields);
  run(
    db,
    `UPDATE master_plans SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
    ...keys.map((k) => fields[k as keyof typeof fields] ?? null), nowIso(), id,
  );
}

/* -------------------------------- requests -------------------------------- */

const REQ_SELECT = `
  SELECT r.*, e.full_name AS employee_name, a.full_name AS approver_name, d.full_name AS decided_by_name
    FROM leave_requests r
    JOIN users e ON e.id = r.employee_id
    LEFT JOIN users a ON a.id = r.approver_id
    LEFT JOIN users d ON d.id = r.decided_by`;

type RequestRow = Record<string, unknown> & { id: number };

/** Loads monthly breakdowns for many requests in one query (avoids N+1). */
function hydrateRequests(db: DB, rows: RequestRow[]): LeaveRequest[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const breakdowns = new Map<number, Record<MonthKey, number>>();
  for (const m of all<{ request_id: number; month: string; days: number }>(
    db, `SELECT request_id, month, days FROM request_month_breakdown WHERE request_id IN (${ids.map(() => "?").join(",")}) ORDER BY month`, ...ids,
  )) breakdowns.set(m.request_id, { ...(breakdowns.get(m.request_id) ?? {}), [m.month]: m.days });
  return rows.map((r) => mapRequest(r, breakdowns.get(r.id) ?? {}));
}

function mapRequest(r: RequestRow, breakdown: Record<MonthKey, number>): LeaveRequest {
  return {
    id: r.id,
    employeeId: r.employee_id as number,
    employeeName: r.employee_name as string,
    year: r.year as number,
    leaveType: r.leave_type as string,
    start: r.start_date as string,
    end: r.end_date as string,
    days: r.working_days as number,
    reason: r.reason as string,
    status: r.status as RequestStatus,
    planId: (r.plan_id as number) ?? null,
    approverId: (r.approver_id as number) ?? null,
    approverName: (r.approver_name as string) ?? null,
    submittedAt: r.submitted_at as string,
    decidedBy: (r.decided_by as number) ?? null,
    decidedByName: (r.decided_by_name as string) ?? null,
    decidedAt: (r.decided_at as string) ?? null,
    decisionReason: (r.decision_reason as string) ?? null,
    attachmentName: (r.attachment_name as string) ?? null,
    breakdown,
  };
}

export function getRequest(db: DB, id: number): LeaveRequest | undefined {
  const r = get<RequestRow>(db, `${REQ_SELECT} WHERE r.id = ?`, id);
  return r && hydrateRequests(db, [r])[0];
}

export function getRequestAttachment(db: DB, id: number) {
  return get<{ attachment_name: string | null; attachment_path: string | null; employee_id: number; approver_id: number | null }>(
    db, "SELECT attachment_name, attachment_path, employee_id, approver_id FROM leave_requests WHERE id = ?", id,
  );
}

export function listRequests(
  db: DB,
  f: { employeeId?: number; year?: number; status?: RequestStatus[]; approverId?: number } = {},
): LeaveRequest[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (f.employeeId) { where.push("r.employee_id = ?"); params.push(f.employeeId); }
  if (f.year) { where.push("r.year = ?"); params.push(f.year); }
  if (f.approverId) { where.push("r.approver_id = ?"); params.push(f.approverId); }
  if (f.status?.length) { where.push(`r.status IN (${f.status.map(() => "?").join(",")})`); params.push(...f.status); }
  const sql = `${REQ_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY r.start_date DESC`;
  return hydrateRequests(db, all<RequestRow>(db, sql, ...params));
}

export function insertRequest(
  db: DB,
  r: {
    employeeId: number; year: number; leaveType: string; start: string; end: string; days: number; reason: string;
    status: RequestStatus; planId: number | null; approverId: number | null; submittedAt?: string;
    attachmentName?: string | null; attachmentPath?: string | null;
  },
  breakdown: Record<MonthKey, number>,
): number {
  const ts = r.submittedAt ?? nowIso();
  const id = run(
    db,
    `INSERT INTO leave_requests (employee_id, year, leave_type, start_date, end_date, working_days, reason, status,
       plan_id, approver_id, submitted_at, attachment_name, attachment_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.employeeId, r.year, r.leaveType, r.start, r.end, r.days, r.reason, r.status, r.planId, r.approverId, ts,
    r.attachmentName ?? null, r.attachmentPath ?? null, ts, ts,
  ).lastId;
  replaceRequestBreakdown(db, id, breakdown);
  return id;
}

export function replaceRequestBreakdown(db: DB, id: number, breakdown: Record<MonthKey, number>) {
  run(db, "DELETE FROM request_month_breakdown WHERE request_id = ?", id);
  for (const [month, days] of Object.entries(breakdown)) {
    run(db, "INSERT INTO request_month_breakdown (request_id, month, days) VALUES (?, ?, ?)", id, month, days);
  }
}

export function updateRequest(db: DB, id: number, fields: Partial<Record<
  | "status" | "approver_id" | "submitted_at" | "decided_by" | "decided_at" | "decision_reason" | "start_date" | "end_date"
  | "working_days" | "reason" | "leave_type" | "plan_id" | "year" | "attachment_name" | "attachment_path",
  string | number | null
>>) {
  const keys = Object.keys(fields);
  run(
    db,
    `UPDATE leave_requests SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
    ...keys.map((k) => fields[k as keyof typeof fields] ?? null), nowIso(), id,
  );
}

/* ------------------------------- allocations ------------------------------ */

export function listAllocations(db: DB, year?: number): Allocation[] {
  const rows = all<{ employee_id: number; month: string; days: number; source_type: "plan" | "request"; source_id: number; approved: number }>(
    db,
    `SELECT v.* FROM v_allocations v JOIN users u ON u.id = v.employee_id
      WHERE u.active = 1 ${year ? "AND substr(v.month,1,4) = ?" : ""}`,
    ...(year ? [String(year)] : []),
  );
  return rows.map((r) => ({
    employeeId: r.employee_id,
    month: r.month,
    days: r.days,
    sourceType: r.source_type,
    sourceId: r.source_id,
    approved: r.approved === 1,
  }));
}
