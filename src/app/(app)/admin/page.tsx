import fs from "node:fs";
import type { Metadata } from "next";
import { get } from "@/server/db";
import { dbFile, getDb } from "@/server/instance";
import { verifyAuditChain } from "@/server/repos/audit";
import { getMeta } from "@/server/repos/settings";
import { listUsers } from "@/server/repos/users";
import { listSessions } from "@/server/services/adminService";
import { requireUser } from "@/server/session";
import AdminView from "./AdminView";

export const metadata: Metadata = { title: "User access" };

export default async function AdminPage() {
  const user = await requireUser(["sysadmin"]);
  const db = getDb();
  const count = (t: string) => get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM ${t}`)!.c;
  const file = dbFile();
  const users = listUsers(db);
  return (
    <AdminView
      me={user.id}
      users={users}
      sessions={listSessions(db, user)}
      system={{
        database: file,
        // WAL mode keeps recent writes in "-wal" until checkpointed, so count both files.
        sizeKb: Math.round(["", "-wal"].reduce((s, x) => s + (fs.existsSync(file + x) ? fs.statSync(file + x).size : 0), 0) / 1024),
        schemaVersion: getMeta(db, "schema_version") ?? "?",
        activeUsers: users.filter((u) => u.active).length,
        totalUsers: users.length,
        plans: count("master_plans"),
        requests: count("leave_requests"),
        audit: verifyAuditChain(db),
        node: process.version,
      }}
    />
  );
}
