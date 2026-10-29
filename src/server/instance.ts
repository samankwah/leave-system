import path from "node:path";
import { get, lockKeys, type DB } from "./db";
import { openPg, openPglite } from "./drivers";
import { DROP_ALL, SCHEMA, SCHEMA_VERSION } from "./schema";
import { seed } from "./seed";

const g = globalThis as unknown as { __graLeaveDb?: Promise<DB> };

/** Local PGlite data directory (used when no DATABASE_URL is configured). */
export const localDataDir = () => process.env.LEAVE_DB_PATH ?? path.join(process.cwd(), "data", "pglite");

export const usingNeon = () => !!process.env.DATABASE_URL;

/** Creates the schema if needed and loads the synthetic demo data into an empty database. */
export async function migrate(db: DB): Promise<void> {
  await db.transaction(async (t) => {
    // Concurrent cold starts on several instances: only one migrates/seeds; the others wait, then no-op.
    await lockKeys(t, ["migrate"]);
    await t.exec(SCHEMA);
    await t.query("INSERT INTO meta (key, value) VALUES ('schema_version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [String(SCHEMA_VERSION)]);
    const users = await get<{ c: number }>(t, "SELECT COUNT(*)::int AS c FROM users");
    if (!users?.c) await seed(t);
  });
}

async function isCurrent(db: DB): Promise<boolean> {
  try {
    const v = await get<{ value: string }>(db, "SELECT value FROM meta WHERE key = 'schema_version'");
    return v?.value === String(SCHEMA_VERSION);
  } catch {
    return false; // meta table missing
  }
}

/** Schema changes use Neon's direct (non-pooled) endpoint, as Neon recommends for migrations. */
async function migrateNeon() {
  const direct = await openPg(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);
  try {
    await migrate(direct);
  } finally {
    await direct.close();
  }
}

async function open(): Promise<DB> {
  if (usingNeon()) {
    const db = await openPg(process.env.DATABASE_URL!);
    if (!(await isCurrent(db))) await migrateNeon();
    return db;
  }
  const db = await openPglite(localDataDir());
  if (!(await isCurrent(db))) await migrate(db);
  return db;
}

/** Process-wide connection (kept on globalThis so dev hot-reload and Fluid compute reuse it). */
export function getDb(): Promise<DB> {
  if (!g.__graLeaveDb) {
    g.__graLeaveDb = open().catch((e) => {
      g.__graLeaveDb = undefined;
      throw e;
    });
  }
  return g.__graLeaveDb;
}

/** Drops all app tables and reloads the synthetic demo data. */
export async function resetDemoData(): Promise<DB> {
  const db = await getDb();
  await db.transaction(async (t) => {
    await t.exec(DROP_ALL);
  });
  if (usingNeon()) await migrateNeon();
  else await migrate(db);
  return db;
}
