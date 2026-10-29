import type { Metadata } from "next";
import { todayIso } from "@/server/db";
import { getDb } from "@/server/instance";
import { getApprovedPlan, listRequests } from "@/server/repos/leave";
import { requireUser } from "@/server/session";
import MyRequests from "./MyRequests";

export const metadata: Metadata = { title: "My requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const [user, db, sp] = await Promise.all([requireUser(), getDb(), searchParams]);
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  // Only needed for the empty state: is there an approved plan (this year or next) to request against?
  const [requests, thisYear, nextYear] = await Promise.all([
    listRequests(db, { employeeId: user.id }),
    getApprovedPlan(db, user.id, year),
    getApprovedPlan(db, user.id, year + 1),
  ]);
  return (
    <MyRequests requests={requests} today={today} openId={Number(sp.open) || null}
      hasApprovedPlan={!!(thisYear || nextYear)} canSeeTeam={user.role === "manager" || user.role === "hr"} />
  );
}
