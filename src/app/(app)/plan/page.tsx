import type { Metadata } from "next";
import { getDb } from "@/server/instance";
import { auditFor } from "@/server/repos/audit";
import { listPlans } from "@/server/repos/leave";
import { getPolicy } from "@/server/repos/settings";
import { calendarData } from "@/server/services/queries";
import { requireUser } from "@/server/session";
import PlanEditor from "./PlanEditor";

export const metadata: Metadata = { title: "Annual plan" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ year?: string; amend?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const policy = await getPolicy(db);
  const sp = await searchParams;
  const year = Number(sp.year) || policy.activeYear;
  const versions = await listPlans(db, { employeeId: user.id, year });
  const working = versions.find((p) => ["draft", "submitted", "returned"].includes(p.status)) ?? null;
  const approved = versions.find((p) => p.status === "approved") ?? null;
  const audits = await auditFor(db, "plan", versions.map((v) => v.id));
  const history = versions.flatMap((v) => audits.get(v.id) ?? [])
    .sort((a, b) => b.ts.localeCompare(a.ts) || b.id - a.id)
    .map((a) => ({ id: a.id, ts: a.ts, actor: a.actor_name, summary: a.summary }));
  return (
    <PlanEditor
      key={`${year}-${working?.id}-${working?.status}-${working?.updatedAt}-${approved?.id}`}
      data={await calendarData(db, user, year)}
      years={[policy.activeYear - 1, policy.activeYear, policy.activeYear + 1]}
      category={user.categoryName}
      working={working}
      approved={approved}
      versions={versions}
      history={history}
      suggestAmend={sp.amend === "1"}
    />
  );
}
