import ExcelJS from "exceljs";
import { computeOccupancy } from "@/domain/capacity";
import { formatRange, monthLabel, yearMonths } from "@/domain/workingDays";
import { todayIso, type DB } from "../db";
import { forbidden } from "../errors";
import { listAudit } from "../repos/audit";
import { listAllocations, listPlans, listRequests } from "../repos/leave";
import { getPolicy } from "../repos/settings";
import { listUsers, type User } from "../repos/users";
import { loadContextBatch } from "./context";

export interface Report {
  key: string;
  title: string;
  description: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
}

export const REPORTS: Record<string, { title: string; description: string }> = {
  balances: { title: "Entitlement and remaining balances", description: "Annual entitlement, approved, pending, planned and remaining days per employee." },
  "planned-vs-actual": { title: "Planned leave versus actual leave", description: "Approved master plan days compared with approved and taken leave." },
  "upcoming-by-month": { title: "Upcoming leave by month", description: "Approved and pending leave from today onwards, grouped by month." },
  "department-capacity": { title: "Departmental scheduling capacity", description: "Distinct employees scheduled per month and department against organisational capacity." },
  "fully-booked": { title: "Fully booked periods", description: "Months that have reached the monthly employee limit." },
  "pending-approvals": { title: "Pending and overdue approvals", description: "Plans and requests awaiting a decision, with days waiting." },
  returned: { title: "Returned for revision", description: "Plans and leave requests returned to employees for revision." },
  amendments: { title: "Roster amendments", description: "Master plan versions, amendments and the plans they replaced." },
  audit: { title: "Audit history", description: "Most recent audit trail entries." },
};

const col = (key: string, label: string) => ({ key, label });
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.parse(todayIso()) - Date.parse(iso.slice(0, 10))) / 86_400_000) : 0);

export function canViewReports(u: User) {
  return u.role === "hr" || u.role === "sysadmin";
}

export async function runReport(db: DB, actor: User, key: string, year: number): Promise<Report> {
  if (!canViewReports(actor)) throw forbidden("Only HR Administrators can generate reports.");
  if (!REPORTS[key]) throw forbidden("Unknown report.");
  if (actor.role === "sysadmin" && key !== "audit") throw forbidden("System Administrators can only export the audit report.");
  const meta = REPORTS[key];
  const [policy, users] = await Promise.all([getPolicy(db), listUsers(db, { activeOnly: true })]);
  const base = { key, ...meta, title: key === "audit" ? meta.title : `${meta.title} – ${year}` };

  switch (key) {
    case "balances":
    case "planned-vs-actual": {
      const contexts = await loadContextBatch(db, year, users);
      const rows = users.map((u) => {
        const c = contexts.get(u.id)!;
        const b = c.balance;
        return {
          employeeId: u.employeeId, name: u.fullName, department: u.departmentName ?? "", category: u.categoryName,
          entitlement: b.entitlement, planned: b.plannedDays, unallocated: b.unallocatedDays, approved: b.approvedDays,
          taken: b.takenToDate, pending: b.pendingDays, remaining: b.remainingDays, projected: b.projectedDays,
          planStatus: c.approvedPlan ? `approved v${c.approvedPlan.version}` : c.workingPlan ? c.workingPlan.status : "none",
          variance: b.plannedDays - b.approvedDays,
        };
      });
      const columns = key === "balances"
        ? [col("employeeId", "Employee ID"), col("name", "Name"), col("department", "Department"), col("category", "Category"),
            col("entitlement", "Entitlement"), col("approved", "Approved"), col("pending", "Pending"), col("remaining", "Remaining"),
            col("projected", "Projected after pending"), col("planned", "Planned (approved plan)"), col("unallocated", "Unallocated")]
        : [col("employeeId", "Employee ID"), col("name", "Name"), col("department", "Department"), col("planStatus", "Plan"),
            col("planned", "Planned days"), col("approved", "Approved leave"), col("taken", "Taken to date"), col("variance", "Planned not yet requested")];
      return { ...base, columns, rows };
    }
    case "upcoming-by-month": {
      const today = todayIso();
      const rows = (await listRequests(db, { status: ["approved", "pending"] }))
        .filter((r) => r.end >= today && r.year === year)
        .flatMap((r) => Object.entries(r.breakdown).map(([m, d]) => ({ month: m, monthLabel: monthLabel(m), name: r.employeeName, dates: formatRange(r), days: d, status: r.status })))
        .sort((a, b) => a.month.localeCompare(b.month) || a.name.localeCompare(b.name));
      return { ...base, columns: [col("monthLabel", "Month"), col("name", "Employee"), col("dates", "Request dates"), col("days", "Working days in month"), col("status", "Status")], rows };
    }
    case "department-capacity":
    case "fully-booked": {
      const allocs = await listAllocations(db, year);
      const occ = computeOccupancy(allocs, yearMonths(year), policy.monthlyCapacity, policy.restrictedMonths);
      const byId = new Map(users.map((u) => [u.id, u]));
      if (key === "fully-booked") {
        const rows = Object.values(occ).filter((o) => o.status === "full").map((o) => ({
          month: monthLabel(o.month), count: o.count, capacity: o.capacity,
          approved: o.approvedEmployeeIds.map((id) => byId.get(id)?.fullName).join(", "),
          pending: o.pendingOnlyEmployeeIds.map((id) => byId.get(id)?.fullName).join(", "),
        }));
        return { ...base, columns: [col("month", "Month"), col("count", "Employees"), col("capacity", "Capacity"), col("approved", "Approved"), col("pending", "Pending reservation")], rows };
      }
      const depts = [...new Set(users.map((u) => u.departmentName ?? "Unassigned"))].sort();
      const rows = Object.values(occ).map((o) => {
        const row: Record<string, string | number> = { month: monthLabel(o.month), status: o.status, total: o.count, remaining: o.remaining };
        for (const d of depts) row[d] = o.employeeIds.filter((id) => (byId.get(id)?.departmentName ?? "Unassigned") === d).length;
        return row;
      });
      return { ...base, columns: [col("month", "Month"), ...depts.map((d) => col(d, d)), col("total", "Total employees"), col("remaining", "Slots remaining"), col("status", "Status")], rows };
    }
    case "pending-approvals": {
      const plans = (await listPlans(db, { status: ["submitted"], year })).map((p) => ({ type: p.amendsPlanId ? "Plan amendment" : "Master plan", name: p.employeeName, detail: `${p.totalDays} days, v${p.version}`, submitted: p.submittedAt ?? "", approver: p.approverName ?? "HR pool" }));
      const reqs = (await listRequests(db, { status: ["pending"], year })).map((r) => ({ type: "Leave request", name: r.employeeName, detail: `${formatRange(r)} (${r.days} days)`, submitted: r.submittedAt, approver: r.approverName ?? "HR pool" }));
      const rows = [...plans, ...reqs].map((x) => {
        const waiting = daysSince(x.submitted);
        return { ...x, submitted: x.submitted.slice(0, 10), waiting, overdue: waiting > policy.overdueApprovalDays ? "OVERDUE" : "" };
      }).sort((a, b) => b.waiting - a.waiting);
      return { ...base, columns: [col("type", "Type"), col("name", "Employee"), col("detail", "Details"), col("submitted", "Submitted"), col("waiting", "Days waiting"), col("approver", "Approver"), col("overdue", "Overdue")], rows };
    }
    case "returned": {
      const plans = (await listPlans(db, { status: ["returned"], year })).map((p) => ({ type: "Master plan", name: p.employeeName, detail: `v${p.version}, ${p.totalDays} days`, by: p.decidedByName ?? "", at: (p.decidedAt ?? "").slice(0, 10), reason: p.decisionReason ?? "" }));
      const reqs = (await listRequests(db, { status: ["returned"], year })).map((r) => ({ type: "Leave request", name: r.employeeName, detail: formatRange(r), by: r.decidedByName ?? "", at: (r.decidedAt ?? "").slice(0, 10), reason: r.decisionReason ?? "" }));
      return { ...base, columns: [col("type", "Type"), col("name", "Employee"), col("detail", "Details"), col("by", "Returned by"), col("at", "Date"), col("reason", "Reason")], rows: [...plans, ...reqs] };
    }
    case "amendments": {
      const rows = (await listPlans(db, { year })).filter((p) => p.version > 1 || p.amendsPlanId || p.status === "superseded").map((p) => ({
        name: p.employeeName, version: p.version, status: p.status, amends: p.amendsPlanId ? `#${p.amendsPlanId}` : "",
        periods: p.periods.map(formatRange).join("; "), days: p.totalDays, decidedBy: p.decidedByName ?? "", decidedAt: (p.decidedAt ?? "").slice(0, 10),
      }));
      return { ...base, columns: [col("name", "Employee"), col("version", "Version"), col("status", "Status"), col("amends", "Amends plan"), col("periods", "Periods"), col("days", "Days"), col("decidedBy", "Decided by"), col("decidedAt", "Decided")], rows };
    }
    case "audit":
    default: {
      const rows = (await listAudit(db, { limit: 2000 })).map((a) => ({ ts: a.ts.replace("T", " ").slice(0, 19), actor: a.actor_name, action: a.action, entity: `${a.entity_type}${a.entity_id ? " #" + a.entity_id : ""}`, summary: a.summary }));
      return { ...base, columns: [col("ts", "Time (UTC)"), col("actor", "Actor"), col("action", "Action"), col("entity", "Record"), col("summary", "Summary")], rows };
    }
  }
}

export function reportToCsv(r: Report): string {
  const esc = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [r.columns.map((c) => esc(c.label)).join(","), ...r.rows.map((row) => r.columns.map((c) => esc(row[c.key])).join(","))].join("\r\n");
}

export async function reportToXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "GRA Leave Management System (prototype)";
  const ws = wb.addWorksheet(r.key.slice(0, 31));
  ws.addRow([r.title]).font = { bold: true, size: 14 };
  ws.addRow([`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC – synthetic prototype data`]);
  ws.addRow([]);
  const header = ws.addRow(r.columns.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } }; });
  for (const row of r.rows) ws.addRow(r.columns.map((c) => row[c.key] ?? ""));
  ws.columns.forEach((c, i) => { c.width = Math.min(50, Math.max(12, r.columns[i]?.label.length ?? 12) + 4); });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
