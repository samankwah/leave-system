import type { Metadata } from "next";
import { computeOccupancy } from "@/domain/capacity";
import { yearMonths } from "@/domain/workingDays";
import { getDb } from "@/server/instance";
import { listNotifications } from "@/server/repos/notifications";
import { getHolidays, getPolicy } from "@/server/repos/settings";
import { loadEmployeeContext } from "@/server/services/context";
import { approvalCounts, calendarDataFrom } from "@/server/services/queries";
import { requireUser } from "@/server/session";
import DashboardView from "./DashboardView";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ year?: string; denied?: string }> }) {
  const [user, db, sp] = await Promise.all([requireUser(), getDb(), searchParams]);
  const policy = await getPolicy(db);
  const year = Number(sp.year) || policy.activeYear;
  const today = process.env.LEAVE_TODAY ?? new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.parse(today) - policy.overdueApprovalDays * 86_400_000).toISOString().slice(0, 10);
  // One parallel round: the employee context already contains requests, plans, allocations and balances.
  const [ctx, holidays, notifications, counts] = await Promise.all([
    loadEmployeeContext(db, user.id, year),
    getHolidays(db, year),
    listNotifications(db, user.id, 5),
    approvalCounts(db, user, cutoff),
  ]);
  const occ = computeOccupancy(ctx.allocations, yearMonths(year), policy.monthlyCapacity, policy.restrictedMonths);
  const attention = user.role === "manager" || user.role === "hr"
    ? { ...counts, fullMonths: Object.values(occ).filter((o) => o.status === "full").map((o) => o.month) }
    : null;
  return (
    <DashboardView
      denied={sp.denied === "1"}
      user={{
        fullName: user.fullName, employeeId: user.employeeId, department: user.departmentName ?? "—",
        title: user.jobTitle, category: user.categoryName, role: user.role, manager: user.managerName,
      }}
      year={year}
      years={[policy.activeYear - 1, policy.activeYear, policy.activeYear + 1]}
      data={calendarDataFrom(ctx, holidays)}
      requests={[...ctx.requests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))}
      working={ctx.workingPlan ?? null}
      notifications={notifications}
      attention={attention}
    />
  );
}
