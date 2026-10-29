import { computeOccupancy } from "@/domain/capacity";
import { yearMonths } from "@/domain/workingDays";
import { openDb, type DB } from "@/server/db";
import { listAllocations } from "@/server/repos/leave";
import { getPolicy } from "@/server/repos/settings";
import { getUser, type User } from "@/server/repos/users";
import { get } from "@/server/db";
import { seed } from "@/server/seed";

// Fixed "today" so date-dependent rules are deterministic.
process.env.LEAVE_TODAY = "2026-10-29";

export function seededDb(file = ":memory:"): DB {
  return openDb(file, { seed });
}

export function user(db: DB, employeeId: string): User {
  const row = get<{ id: number }>(db, "SELECT id FROM users WHERE employee_id = ?", employeeId);
  if (!row) throw new Error(`No user ${employeeId}`);
  return getUser(db, row.id)!;
}

export function occupancy(db: DB, year = 2027) {
  const p = getPolicy(db);
  return computeOccupancy(listAllocations(db, year), yearMonths(year), p.monthlyCapacity, p.restrictedMonths);
}

export const codes = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (e) {
    const err = e as { issues?: { code: string }[]; status?: number; message: string };
    if (err.issues?.length) return err.issues.map((i) => i.code);
    return [`HTTP_${err.status ?? "ERR"}`];
  }
  return [];
};
