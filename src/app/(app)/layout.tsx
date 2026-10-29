import { cookies } from "next/headers";
import AppShell from "@/components/AppShell";
import { NAV_COOKIE } from "@/lib/constants";
import { getDb } from "@/server/instance";
import { unreadCount } from "@/server/repos/notifications";
import { pendingApprovalCount } from "@/server/services/queries";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  const collapsed = (await cookies()).get(NAV_COOKIE)?.value === "1";
  return (
    <AppShell
      user={{ fullName: user.fullName, employeeId: user.employeeId, role: user.role, departmentName: user.departmentName }}
      unread={await unreadCount(db, user.id)}
      pendingApprovals={await pendingApprovalCount(db, user)}
      initialCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
