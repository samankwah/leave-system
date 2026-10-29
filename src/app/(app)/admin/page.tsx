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
  const user = await requireUser(["sysadmin"]);
  const db = await getDb();
  const count = async (t: string) => (await get<{ c: number }>(db, `SELECT COUNT(*)::int AS c FROM ${t}`))!.c;
  const size = await get<{ kb: number }>(db, "SELECT (pg_database_size(current_database()) / 1024)::int AS kb");
  const users = await listUsers(db);
  return (
    <AdminView
      me={user.id}
      users={users}
      sessions={await listSessions(db, user)}
      system={{
        database: usingNeon() ? `Neon Postgres (${process.env.PGHOST?.replace(/^[^.]+/, "…") ?? "pooled"})` : `PGlite (local) · ${localDataDir()}`,
        sizeKb: size?.kb ?? 0,
        schemaVersion: await getMeta(db, "schema_version") ?? "?",
        activeUsers: users.filter((u) => u.active).length,
        totalUsers: users.length,
        plans: await count("master_plans"),
        requests: await count("leave_requests"),
        audit: await verifyAuditChain(db),
        node: process.version,
      }}
    />
  );
}
