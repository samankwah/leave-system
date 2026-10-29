import type { Metadata } from "next";
import { getDb } from "@/server/instance";
import { listAudit } from "@/server/repos/audit";
import { requireUser } from "@/server/session";
import AuditView from "./AuditView";

export const metadata: Metadata = { title: "Audit trail" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; from?: string; to?: string }> }) {
  await requireUser(["hr", "sysadmin"]);
  const sp = await searchParams;
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
  const entries = await listAudit(await getDb(), { search: sp.q || undefined, entityType: sp.type || undefined, from: valid(sp.from), to: valid(sp.to), limit: 500 });
  return <AuditView entries={entries} filters={{ q: sp.q ?? "", type: sp.type ?? "", from: valid(sp.from) ?? "", to: valid(sp.to) ?? "" }} />;
}
