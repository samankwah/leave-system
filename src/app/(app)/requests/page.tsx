import type { Metadata } from "next";
import { todayIso } from "@/server/db";
import { getDb } from "@/server/instance";
import { auditFor } from "@/server/repos/audit";
import { listRequests } from "@/server/repos/leave";
import { requireUser } from "@/server/session";
import MyRequests from "./MyRequests";

export const metadata: Metadata = { title: "My requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const requests = await listRequests(db, { employeeId: user.id });
  const audits = await auditFor(db, "request", requests.map((r) => r.id));
  const history = Object.fromEntries(requests.map((r) => [
    r.id,
    (audits.get(r.id) ?? []).map((a) => ({ id: a.id, ts: a.ts, actor: a.actor_name, summary: a.summary })),
  ]));
  return <MyRequests requests={requests} history={history} today={todayIso()} openId={Number((await searchParams).open) || null} />;
}
