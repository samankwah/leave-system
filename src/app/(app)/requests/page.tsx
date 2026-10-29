import type { Metadata } from "next";
import { todayIso } from "@/server/db";
import { getDb } from "@/server/instance";
import { listAudit } from "@/server/repos/audit";
import { listRequests } from "@/server/repos/leave";
import { requireUser } from "@/server/session";
import MyRequests from "./MyRequests";

export const metadata: Metadata = { title: "My requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const user = await requireUser();
  const db = getDb();
  const requests = listRequests(db, { employeeId: user.id });
  const history = Object.fromEntries(requests.map((r) => [
    r.id,
    listAudit(db, { entityType: "request", entityId: r.id }).map((a) => ({ id: a.id, ts: a.ts, actor: a.actor_name, summary: a.summary })),
  ]));
  return <MyRequests requests={requests} history={history} today={todayIso()} openId={Number((await searchParams).open) || null} />;
}
