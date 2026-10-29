import { cookies } from "next/headers";
import AppShell from "@/components/AppShell";
import { NAV_COOKIE } from "@/lib/constants";
import { getDb } from "@/server/instance";
import { unreadCount } from "@/server/repos/notifications";
import { pendingApprovalCount } from "@/server/services/queries";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, db, jar] = await Promise.all([requireUser(), getDb(), cookies()]);
  const collapsed = jar.get(NAV_COOKIE)?.value === "1";
  const [unread, pendingApprovals] = await Promise.all([unreadCount(db, user.id), pendingApprovalCount(db, user)]);
  return (
    <AppShell
      user={{ fullName: user.fullName, employeeId: user.employeeId, role: user.role, departmentName: user.departmentName }}
      unread={unread}
      pendingApprovals={pendingApprovals}
      initialCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
