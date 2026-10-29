import { computeOccupancy } from "@/domain/capacity";
import { yearMonths } from "@/domain/workingDays";
import { get, type DB } from "@/server/db";
import { openPglite } from "@/server/drivers";
import { migrate } from "@/server/instance";
import { listAllocations } from "@/server/repos/leave";
import { getPolicy } from "@/server/repos/settings";
import { getUser, type User } from "@/server/repos/users";

// Fixed "today" so date-dependent rules are deterministic.
process.env.LEAVE_TODAY = "2026-10-29";

let template: Promise<DB & { clone(): Promise<DB> }> | undefined;

/** A fresh, fully seeded in-memory Postgres (PGlite) — cloned from a template seeded once per test file. */
export async function seededDb(): Promise<DB> {
  template ??= (async () => {
    const db = await openPglite();
    await migrate(db);
    return db;
  })();
  return (await template).clone();
}

export async function user(db: DB, employeeId: string): Promise<User> {
  const row = await get<{ id: number }>(db, "SELECT id FROM users WHERE employee_id = ?", employeeId);
  if (!row) throw new Error(`No user ${employeeId}`);
  return (await getUser(db, row.id))!;
}

export async function occupancy(db: DB, year = 2027) {
  const p = await getPolicy(db);
  return computeOccupancy(await listAllocations(db, year), yearMonths(year), p.monthlyCapacity, p.restrictedMonths);
}

/** Runs an action and returns the rule codes it was rejected with (or HTTP_<status>), or [] if it succeeded. */
export async function codes(fn: () => Promise<unknown>): Promise<string[]> {
  try {
    await fn();
  } catch (e) {
    const err = e as { issues?: { code: string }[]; status?: number; message: string };
    if (err.issues?.length) return err.issues.map((i) => i.code);
    return [`HTTP_${err.status ?? "ERR"}`];
  }
  return [];
}
