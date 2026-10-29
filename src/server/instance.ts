import fs from "node:fs";
import path from "node:path";
import { openDb, type DB } from "./db";
import { seed } from "./seed";

const g = globalThis as unknown as { __graLeaveDb?: DB };

export const dbFile = () => process.env.LEAVE_DB_PATH ?? path.join(process.cwd(), "data", "leave.db");

/** Process-wide connection (kept on globalThis so dev hot-reload doesn't open a new one per edit). */
export function getDb(): DB {
  if (!g.__graLeaveDb) g.__graLeaveDb = openDb(dbFile(), { seed });
  return g.__graLeaveDb;
}

/** Deletes the database file and reloads the synthetic demo data. */
export function resetDemoData(): DB {
  g.__graLeaveDb?.close();
  g.__graLeaveDb = undefined;
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbFile() + suffix, { force: true });
  return getDb();
}
