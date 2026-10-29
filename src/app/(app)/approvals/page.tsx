import type { Metadata } from "next";
import { todayIso } from "@/server/db";
import { getDb } from "@/server/instance";
import { getPolicy } from "@/server/repos/settings";
import { approvalQueue } from "@/server/services/queries";
import { requireUser } from "@/server/session";
import ApprovalsBoard from "./ApprovalsBoard";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const [user, db, sp] = await Promise.all([requireUser(["manager", "hr"]), getDb(), searchParams]);
  const [pending, policy] = await Promise.all([approvalQueue(db, user, "pending"), getPolicy(db)]);
  return (
    <ApprovalsBoard
      pending={pending} isHr={user.role === "hr"}
      today={todayIso()} overdueDays={policy.overdueApprovalDays} restrictedMonths={policy.restrictedMonths}
      initialItem={sp.item ?? null}
    />
  );
}
