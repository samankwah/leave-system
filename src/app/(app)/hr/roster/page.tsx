import { computeOccupancy } from "@/domain/capacity";
import { formatRange, yearMonths } from "@/domain/workingDays";
import { getDb } from "@/server/instance";
import { listAllocations, listPlans, listRequests } from "@/server/repos/leave";
import { getPolicy } from "@/server/repos/settings";
import { listUsers } from "@/server/repos/users";
import { requireUser } from "@/server/session";
import RosterView from "./RosterView";

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const [, db, sp] = await Promise.all([requireUser(["hr"]), getDb(), searchParams]);
  const policy = await getPolicy(db);
  const year = Number(sp.year) || policy.activeYear;
  const [plans, requests, users, allocations] = await Promise.all([
    listPlans(db, { year }), listRequests(db, { year, status: ["approved", "pending"] }),
    listUsers(db, { activeOnly: true }), listAllocations(db, year),
  ]);
  const rows = users.map((u) => {
    const approved = plans.find((p) => p.employeeId === u.id && p.status === "approved");
    const working = plans.find((p) => p.employeeId === u.id && ["draft", "submitted", "returned"].includes(p.status));
    const reqs = requests.filter((r) => r.employeeId === u.id);
    return {
      id: u.id, name: u.fullName, employeeId: u.employeeId, department: u.departmentName ?? "—", category: u.categoryName,
      planStatus: approved ? (working ? `approved v${approved.version} + ${working.status} v${working.version}` : `approved v${approved.version}`) : working?.status ?? "none",
      approvedMonthly: approved?.monthly ?? {},
      pendingMonthly: working?.status === "submitted" ? working.monthly : {},
      requestMonthly: reqs.reduce<Record<string, { approved: number; pending: number }>>((acc, r) => {
        for (const [m, d] of Object.entries(r.breakdown)) {
          acc[m] ??= { approved: 0, pending: 0 };
          acc[m][r.status === "approved" ? "approved" : "pending"] += d;
        }
        return acc;
      }, {}),
      total: approved?.totalDays ?? 0,
    };
  });
  const occupancy = computeOccupancy(allocations, yearMonths(year), policy.monthlyCapacity, policy.restrictedMonths);
  const amendments = plans.filter((p) => p.amendsPlanId || p.status === "superseded").map((p) => ({
    id: p.id, name: p.employeeName, version: p.version, status: p.status, amends: p.amendsPlanId,
    periods: p.periods.map(formatRange).join("; "), days: p.totalDays, decidedBy: p.decidedByName, decidedAt: p.decidedAt, reason: p.decisionReason,
  }));
  return (
    <RosterView
      year={year} years={[policy.activeYear - 1, policy.activeYear, policy.activeYear + 1]} rows={rows}
      occupancy={Object.fromEntries(Object.entries(occupancy).map(([k, v]) => [k, { count: v.count, capacity: v.capacity, status: v.status }]))}
      amendments={amendments}
    />
  );
}
