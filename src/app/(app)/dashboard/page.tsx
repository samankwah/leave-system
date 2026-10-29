import type { Metadata } from "next";
import { getDb } from "@/server/instance";
import { getWorkingPlan, listRequests } from "@/server/repos/leave";
import { listNotifications } from "@/server/repos/notifications";
import { getPolicy } from "@/server/repos/settings";
import { attentionSummary, calendarData } from "@/server/services/queries";
import { requireUser } from "@/server/session";
import DashboardView from "./DashboardView";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ year?: string; denied?: string }> }) {
  const user = await requireUser();
  const db = getDb();
  const sp = await searchParams;
  const policy = getPolicy(db);
  const year = Number(sp.year) || policy.activeYear;
  const cal = calendarData(db, user, year);
  return (
    <DashboardView
      denied={sp.denied === "1"}
      user={{
        fullName: user.fullName, employeeId: user.employeeId, department: user.departmentName ?? "—",
        title: user.jobTitle, category: user.categoryName, role: user.role, manager: user.managerName,
      }}
      year={year}
      years={[policy.activeYear - 1, policy.activeYear, policy.activeYear + 1]}
      data={cal}
      requests={listRequests(db, { employeeId: user.id, year }).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))}
      working={getWorkingPlan(db, user.id, year) ?? null}
      notifications={listNotifications(db, user.id, 5)}
      attention={attentionSummary(db, user, year, cal.today)}
    />
  );
}
