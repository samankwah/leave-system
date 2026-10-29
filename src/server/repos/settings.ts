import type { PolicySettings, RuleStatus, StaffCategory } from "@/domain/types";
import { all, get, nowIso, run, type DB } from "../db";

export const DEFAULT_POLICY: PolicySettings = {
  activeYear: 2027,
  restrictedMonths: [1, 12],
  monthlyCapacity: 5,
  carryoverEnabled: false,
  carryoverMaxDays: 0,
  overdueApprovalDays: 5,
  leaveTypes: ["Annual Leave"],
};

export const POLICY_LABELS: Record<keyof PolicySettings, string> = {
  activeYear: "Active planning year",
  restrictedMonths: "Restricted scheduling months",
  monthlyCapacity: "Maximum distinct employees on leave per month",
  carryoverEnabled: "Carry over unused leave",
  carryoverMaxDays: "Maximum carryover days",
  overdueApprovalDays: "Approval overdue after (days)",
  leaveTypes: "Leave types handled by this system",
};

export function getPolicy(db: DB): PolicySettings {
  const rows = all<{ key: string; value: string }>(db, "SELECT key, value FROM settings");
  const out = { ...DEFAULT_POLICY } as Record<string, unknown>;
  for (const r of rows) if (r.key in out) out[r.key] = JSON.parse(r.value);
  return out as unknown as PolicySettings;
}

export function getPolicyRows(db: DB) {
  const policy = getPolicy(db);
  const meta = new Map(
    all<{ key: string; status: RuleStatus; updated_at: string | null; updated_by: number | null }>(
      db, "SELECT key, status, updated_at, updated_by FROM settings",
    ).map((r) => [r.key, r]),
  );
  return (Object.keys(DEFAULT_POLICY) as (keyof PolicySettings)[]).map((key) => ({
    key,
    label: POLICY_LABELS[key],
    value: policy[key],
    status: (meta.get(key)?.status ?? "proposed") as RuleStatus,
    updatedAt: meta.get(key)?.updated_at ?? null,
  }));
}

export function setSetting(db: DB, key: keyof PolicySettings, value: unknown, status: RuleStatus, userId: number | null) {
  run(
    db,
    `INSERT INTO settings (key, value, status, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, status = excluded.status,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    key, JSON.stringify(value), status, userId, nowIso(),
  );
}

export function getCategories(db: DB): StaffCategory[] {
  return all<{ code: string; name: string; entitlement_days: number; status: RuleStatus }>(
    db, "SELECT * FROM staff_categories ORDER BY entitlement_days DESC, code",
  ).map((r) => ({ code: r.code, name: r.name, entitlementDays: r.entitlement_days, status: r.status }));
}

export function getCategory(db: DB, code: string): StaffCategory | undefined {
  return getCategories(db).find((c) => c.code === code);
}

export function upsertCategory(db: DB, c: StaffCategory) {
  run(
    db,
    `INSERT INTO staff_categories (code, name, entitlement_days, status) VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name = excluded.name, entitlement_days = excluded.entitlement_days, status = excluded.status`,
    c.code, c.name, c.entitlementDays, c.status,
  );
}

export interface Holiday { id: number; date: string; name: string; note: string }

export function getHolidays(db: DB, year?: number): Holiday[] {
  return year
    ? all<Holiday>(db, "SELECT * FROM public_holidays WHERE substr(date,1,4) = ? ORDER BY date", String(year))
    : all<Holiday>(db, "SELECT * FROM public_holidays ORDER BY date");
}

export function holidaySet(db: DB): Set<string> {
  return new Set(all<{ date: string }>(db, "SELECT date FROM public_holidays").map((r) => r.date));
}

export interface NamedRow { id: number; name: string }
export const getDepartments = (db: DB) => all<NamedRow>(db, "SELECT * FROM departments ORDER BY name");
export const getOffices = (db: DB) => all<NamedRow>(db, "SELECT * FROM offices ORDER BY name");

export interface ApprovalRoute {
  id: number;
  priority: number;
  scope_type: "department" | "category" | "role" | "default";
  scope_value: string;
  approver_mode: "line_manager" | "specific_user" | "hr";
  approver_user_id: number | null;
  active: number;
  note: string;
}

export const getRoutes = (db: DB) =>
  all<ApprovalRoute>(db, "SELECT * FROM approval_routes ORDER BY priority, id");

export const getMeta = (db: DB, key: string) => get<{ value: string }>(db, "SELECT value FROM meta WHERE key = ?", key)?.value;
