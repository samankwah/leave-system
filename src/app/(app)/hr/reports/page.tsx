import type { Metadata } from "next";
import { computeOccupancy } from "@/domain/capacity";
import { yearMonths } from "@/domain/workingDays";
import { getDb } from "@/server/instance";
import { listAllocations } from "@/server/repos/leave";
import { getPolicy } from "@/server/repos/settings";
import { listUsers } from "@/server/repos/users";
import { loadContextBatch } from "@/server/services/context";
import { pendingApprovalCount } from "@/server/services/queries";
import { REPORTS } from "@/server/services/reportService";
import { requireUser } from "@/server/session";
import ReportsView from "./ReportsView";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const user = await requireUser(["hr"]);
  const db = getDb();
  const policy = getPolicy(db);
  const year = policy.activeYear;
  const users = listUsers(db, { activeOnly: true });
  const ctx = [...loadContextBatch(db, year, users).values()];
  const entitlement = ctx.reduce((s, c) => s + c.entitlement, 0);
  const planned = ctx.reduce((s, c) => s + c.balance.plannedDays, 0);
  const occ = computeOccupancy(listAllocations(db, year), yearMonths(year), policy.monthlyCapacity, policy.restrictedMonths);
  const kpis = {
    year,
    planCoverage: Math.round((ctx.filter((c) => c.approvedPlan).length / Math.max(1, ctx.length)) * 100),
    plannedPct: Math.round((planned / Math.max(1, entitlement)) * 100),
    pending: pendingApprovalCount(db, user),
    fullMonths: Object.values(occ).filter((o) => o.status === "full").length,
  };
  return <ReportsView reports={REPORTS} defaultYear={year} years={[year - 1, year, year + 1]} kpis={kpis} />;
}
