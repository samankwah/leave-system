import type { Metadata } from "next";
import { todayIso } from "@/server/db";
import { getDb } from "@/server/instance";
import { listRequests } from "@/server/repos/leave";
import { requireUser } from "@/server/session";
import MyRequests from "./MyRequests";

export const metadata: Metadata = { title: "My requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const [user, db, sp] = await Promise.all([requireUser(), getDb(), searchParams]);
  const requests = await listRequests(db, { employeeId: user.id });
  return <MyRequests requests={requests} today={todayIso()} openId={Number(sp.open) || null} />;
}
