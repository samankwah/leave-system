import type { Allocation, MonthKey, Period } from "@/domain/types";
import { all, get, insert, nowIso, run, type DB } from "../db";

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

const marks = (n: number) => Array(n).fill("?").join(",");

/* ---------------------------------- plans --------------------------------- */

const PLAN_SELECT = `
  SELECT p.*, e.full_name AS employee_name, a.full_name AS approver_name, d.full_name AS decided_by_name
    FROM master_plans p
    JOIN users e ON e.id = p.employee_id
    LEFT JOIN users a ON a.id = p.approver_id
    LEFT JOIN users d ON d.id = p.decided_by`;

type PlanRow = Record<string, unknown> & { id: number };

/** Loads periods and monthly allocations for many plans in two queries (avoids N+1). */
async function hydratePlans(db: DB, rows: PlanRow[]): Promise<Plan[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const periods = new Map<number, PlanPeriod[]>();
  for (const p of await all<{ id: number; plan_id: number; start_date: string; end_date: string; working_days: number }>(
    db, `SELECT * FROM plan_periods WHERE plan_id IN (${marks(ids.length)}) ORDER BY start_date`, ...ids,
  )) periods.set(p.plan_id, [...(periods.get(p.plan_id) ?? []), { id: p.id, start: p.start_date, end: p.end_date, days: p.working_days }]);
  const monthly = new Map<number, Record<MonthKey, number>>();
  for (const m of await all<{ plan_id: number; month: string; days: number }>(
    db, `SELECT plan_id, month, days FROM plan_month_allocations WHERE plan_id IN (${marks(ids.length)}) ORDER BY month`, ...ids,
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

export async function getPlan(db: DB, id: number): Promise<Plan | undefined> {
  const r = await get<PlanRow>(db, `${PLAN_SELECT} WHERE p.id = ?`, id);
  return r && (await hydratePlans(db, [r]))[0];
}

export async function listPlans(
  db: DB,
  f: { employeeId?: number; year?: number; status?: PlanStatus[]; approverId?: number } = {},
): Promise<Plan[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (f.employeeId) { where.push("p.employee_id = ?"); params.push(f.employeeId); }
  if (f.year) { where.push("p.year = ?"); params.push(f.year); }
  if (f.approverId) { where.push("p.approver_id = ?"); params.push(f.approverId); }
  if (f.status?.length) { where.push(`p.status IN (${marks(f.status.length)})`); params.push(...f.status); }
  const sql = `${PLAN_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.year DESC, e.full_name, p.version DESC`;
  return hydratePlans(db, await all<PlanRow>(db, sql, ...params));
}

export async function getApprovedPlan(db: DB, employeeId: number, year: number) {
  return (await listPlans(db, { employeeId, year, status: ["approved"] }))[0];
}

/** The plan currently being worked on (draft, submitted or returned), if any. */
export async function getWorkingPlan(db: DB, employeeId: number, year: number) {
  return (await listPlans(db, { employeeId, year, status: ["draft", "submitted", "returned"] }))[0];
}

export async function nextPlanVersion(db: DB, employeeId: number, year: number): Promise<number> {
  return ((await get<{ v: number | null }>(db, "SELECT MAX(version) AS v FROM master_plans WHERE employee_id = ? AND year = ?", employeeId, year))?.v ?? 0) + 1;
}

export async function insertPlan(
  db: DB,
  p: { employeeId: number; year: number; status: PlanStatus; amendsPlanId?: number | null; createdAt?: string },
): Promise<number> {
  const ts = p.createdAt ?? nowIso();
  return insert(
    db,
    `INSERT INTO master_plans (employee_id, year, version, status, amends_plan_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    p.employeeId, p.year, await nextPlanVersion(db, p.employeeId, p.year), p.status, p.amendsPlanId ?? null, ts, ts,
  );
}

export async function replacePlanPeriods(
  db: DB,
  planId: number,
  periods: { start: string; end: string; days: number }[],
  monthly: Record<MonthKey, number>,
) {
  await run(db, "DELETE FROM plan_periods WHERE plan_id = ?", planId);
  await run(db, "DELETE FROM plan_month_allocations WHERE plan_id = ?", planId);
  for (const p of periods) {
    await run(db, "INSERT INTO plan_periods (plan_id, start_date, end_date, working_days) VALUES (?, ?, ?, ?)", planId, p.start, p.end, p.days);
  }
  for (const [month, days] of Object.entries(monthly)) {
    await run(db, "INSERT INTO plan_month_allocations (plan_id, month, days) VALUES (?, ?, ?)", planId, month, days);
  }
  const total = Object.values(monthly).reduce((a, b) => a + b, 0);
  await run(db, "UPDATE master_plans SET total_days = ?, updated_at = ? WHERE id = ?", total, nowIso(), planId);
}

export async function updatePlan(db: DB, id: number, fields: Partial<Record<
  "status" | "approver_id" | "submitted_at" | "decided_by" | "decided_at" | "decision_reason", string | number | null
>>) {
  const keys = Object.keys(fields);
  await run(
    db,
    `UPDATE master_plans SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
    ...keys.map((k) => fields[k as keyof typeof fields] ?? null), nowIso(), id,
  );
}

/* -------------------------------- requests -------------------------------- */

// Explicit columns: the attachment bytes are only loaded by getRequestAttachment.
const REQ_SELECT = `
  SELECT r.id, r.employee_id, r.year, r.leave_type, r.start_date, r.end_date, r.working_days, r.reason, r.status,
         r.plan_id, r.approver_id, r.submitted_at, r.decided_by, r.decided_at, r.decision_reason, r.attachment_name,
         r.created_at, r.updated_at,
         e.full_name AS employee_name, a.full_name AS approver_name, d.full_name AS decided_by_name
    FROM leave_requests r
    JOIN users e ON e.id = r.employee_id
    LEFT JOIN users a ON a.id = r.approver_id
    LEFT JOIN users d ON d.id = r.decided_by`;

type RequestRow = Record<string, unknown> & { id: number };

/** Loads monthly breakdowns for many requests in one query (avoids N+1). */
async function hydrateRequests(db: DB, rows: RequestRow[]): Promise<LeaveRequest[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const breakdowns = new Map<number, Record<MonthKey, number>>();
  for (const m of await all<{ request_id: number; month: string; days: number }>(
    db, `SELECT request_id, month, days FROM request_month_breakdown WHERE request_id IN (${marks(ids.length)}) ORDER BY month`, ...ids,
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

export async function getRequest(db: DB, id: number): Promise<LeaveRequest | undefined> {
  const r = await get<RequestRow>(db, `${REQ_SELECT} WHERE r.id = ?`, id);
  return r && (await hydrateRequests(db, [r]))[0];
}

export function getRequestAttachment(db: DB, id: number) {
  return get<{ attachment_name: string | null; attachment_type: string | null; attachment_data: Uint8Array | null; employee_id: number; approver_id: number | null }>(
    db, "SELECT attachment_name, attachment_type, attachment_data, employee_id, approver_id FROM leave_requests WHERE id = ?", id,
  );
}

export async function listRequests(
  db: DB,
  f: { employeeId?: number; year?: number; status?: RequestStatus[]; approverId?: number } = {},
): Promise<LeaveRequest[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (f.employeeId) { where.push("r.employee_id = ?"); params.push(f.employeeId); }
  if (f.year) { where.push("r.year = ?"); params.push(f.year); }
  if (f.approverId) { where.push("r.approver_id = ?"); params.push(f.approverId); }
  if (f.status?.length) { where.push(`r.status IN (${marks(f.status.length)})`); params.push(...f.status); }
  const sql = `${REQ_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY r.start_date DESC`;
  return hydrateRequests(db, await all<RequestRow>(db, sql, ...params));
}

export interface StoredAttachment { name: string; type: string; data: Buffer }

export async function insertRequest(
  db: DB,
  r: {
    employeeId: number; year: number; leaveType: string; start: string; end: string; days: number; reason: string;
    status: RequestStatus; planId: number | null; approverId: number | null; submittedAt?: string;
    attachment?: StoredAttachment | null;
  },
  breakdown: Record<MonthKey, number>,
): Promise<number> {
  const ts = r.submittedAt ?? nowIso();
  const id = await insert(
    db,
    `INSERT INTO leave_requests (employee_id, year, leave_type, start_date, end_date, working_days, reason, status,
       plan_id, approver_id, submitted_at, attachment_name, attachment_type, attachment_data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.employeeId, r.year, r.leaveType, r.start, r.end, r.days, r.reason, r.status, r.planId, r.approverId, ts,
    r.attachment?.name ?? null, r.attachment?.type ?? null, r.attachment?.data ?? null, ts, ts,
  );
  await replaceRequestBreakdown(db, id, breakdown);
  return id;
}

export async function replaceRequestBreakdown(db: DB, id: number, breakdown: Record<MonthKey, number>) {
  await run(db, "DELETE FROM request_month_breakdown WHERE request_id = ?", id);
  for (const [month, days] of Object.entries(breakdown)) {
    await run(db, "INSERT INTO request_month_breakdown (request_id, month, days) VALUES (?, ?, ?)", id, month, days);
  }
}

export async function updateRequest(db: DB, id: number, fields: Partial<Record<
  | "status" | "approver_id" | "submitted_at" | "decided_by" | "decided_at" | "decision_reason" | "start_date" | "end_date"
  | "working_days" | "reason" | "leave_type" | "plan_id" | "year" | "attachment_name" | "attachment_type",
  string | number | null
>> & { attachment_data?: Buffer }) {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  await run(
    db,
    `UPDATE leave_requests SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
    ...keys.map((k) => fields[k] ?? null), nowIso(), id,
  );
}

/* ------------------------------- allocations ------------------------------ */

export async function listAllocations(db: DB, year?: number): Promise<Allocation[]> {
  const rows = await all<{ employee_id: number; month: string; days: number; source_type: "plan" | "request"; source_id: number; approved: number }>(
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
    approved: Number(r.approved) === 1,
  }));
}
