import type { Metadata } from "next";
import { todayIso } from "@/server/db";
import { getDb } from "@/server/instance";
import { getPolicy } from "@/server/repos/settings";
import { approvalQueue } from "@/server/services/queries";
import { requireUser } from "@/server/session";
import ApprovalsBoard from "./ApprovalsBoard";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const user = await requireUser(["manager", "hr"]);
  const db = getDb();
  const { pending, decided } = approvalQueue(db, user);
  return (
    <ApprovalsBoard
      pending={pending} decided={decided} isHr={user.role === "hr"}
      today={todayIso()} overdueDays={getPolicy(db).overdueApprovalDays} restrictedMonths={getPolicy(db).restrictedMonths}
      initialItem={(await searchParams).item ?? null}
    />
  );
}
