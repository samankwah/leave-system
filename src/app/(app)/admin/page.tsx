import type { Metadata } from "next";
import { get } from "@/server/db";
import { getDb, localDataDir, usingNeon } from "@/server/instance";
import { verifyAuditChain } from "@/server/repos/audit";
import { getMeta } from "@/server/repos/settings";
import { listUsers } from "@/server/repos/users";
import { listSessions } from "@/server/services/adminService";
import { requireUser } from "@/server/session";
import AdminView from "./AdminView";

export const metadata: Metadata = { title: "User access" };

export default async function AdminPage() {
  const [user, db] = await Promise.all([requireUser(["sysadmin"]), getDb()]);
  const [stats, users, sessions, schemaVersion, audit] = await Promise.all([
    get<{ kb: number; plans: number; requests: number }>(db, `SELECT (pg_database_size(current_database()) / 1024)::int AS kb,
      (SELECT COUNT(*) FROM master_plans)::int AS plans, (SELECT COUNT(*) FROM leave_requests)::int AS requests`),
    listUsers(db), listSessions(db, user), getMeta(db, "schema_version"),
    verifyAuditChain(db), // incremental: only records added since the last verified checkpoint
  ]);
  return (
    <AdminView
      me={user.id}
      users={users}
      sessions={sessions}
      system={{
        database: usingNeon() ? `Neon Postgres (${process.env.PGHOST?.replace(/^[^.]+/, "…") ?? "pooled"})` : `PGlite (local) · ${localDataDir()}`,
        sizeKb: stats?.kb ?? 0,
        schemaVersion: schemaVersion ?? "?",
        activeUsers: users.filter((u) => u.active).length,
        totalUsers: users.length,
        plans: stats?.plans ?? 0,
        requests: stats?.requests ?? 0,
        audit,
        node: process.version,
      }}
    />
  );
}
