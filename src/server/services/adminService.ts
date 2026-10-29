import crypto from "node:crypto";
import { z } from "zod";
import type { PolicySettings, RuleStatus } from "@/domain/types";
import { hashPassword, passwordProblem, verifyPassword } from "../auth";
import { all, get, insert, nowIso, run, tx, type DB } from "../db";
import { badRequest, forbidden, notFound } from "../errors";
import { audit } from "../repos/audit";
import { getCategory, getPolicy, setSetting, upsertCategory } from "../repos/settings";
import { getUser, type User } from "../repos/users";

const actorOf = (u: User) => ({ id: u.id, name: u.fullName });

export function assertHr(u: User) {
  if (u.role !== "hr") throw forbidden("Only HR Administrators can do this.");
}
export function assertSysadmin(u: User) {
  if (u.role !== "sysadmin") throw forbidden("Only System Administrators can do this.");
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; "));
  return r.data;
}

const tempPassword = () => `Gra-${crypto.randomBytes(4).toString("hex")}9`;

/* ------------------------------- HR: employees ------------------------------ */

const employeeSchema = z.object({
  id: z.number().int().optional(),
  employeeId: z.string().trim().regex(/^[A-Za-z0-9-]{3,20}$/, "use 3-20 letters, digits or dashes"),
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2).max(100),
  departmentId: z.number().int().nullable(),
  officeId: z.number().int().nullable(),
  jobTitle: z.string().trim().max(100),
  categoryCode: z.string().min(1),
  managerId: z.number().int().nullable(),
});

/** Creates or updates an employee profile. Returns a one-time temporary password for new accounts. */
export async function saveEmployee(db: DB, actor: User, input: unknown): Promise<{ user: User; tempPassword?: string }> {
  assertHr(actor);
  const e = parse(employeeSchema, input);
  if (!(await getCategory(db, e.categoryCode))) throw badRequest("Unknown staff category.");
  return tx(db, async (db) => {
    const clash = await get<{ id: number }>(
      db, "SELECT id FROM users WHERE (lower(employee_id) = lower(?) OR lower(email) = lower(?)) AND id != ?", e.employeeId, e.email, e.id ?? 0,
    );
    if (clash) throw badRequest("Another user already has this Employee ID or email.");
    if (e.id && e.managerId === e.id) throw badRequest("An employee cannot be their own manager.");
    if (e.id) {
      const before = await getUser(db, e.id);
      if (!before) throw notFound("Employee");
      await run(
        db,
        `UPDATE users SET employee_id = ?, email = ?, full_name = ?, department_id = ?, office_id = ?, job_title = ?,
           category_code = ?, manager_id = ? WHERE id = ?`,
        e.employeeId, e.email, e.fullName, e.departmentId, e.officeId, e.jobTitle, e.categoryCode, e.managerId, e.id,
      );
      const after = (await getUser(db, e.id))!;
      const changed = (["employeeId", "email", "fullName", "departmentName", "officeName", "jobTitle", "categoryCode", "managerName"] as const)
        .filter((k) => before[k] !== after[k])
        .map((k) => ({ field: k, from: before[k], to: after[k] }));
      await audit(db, actorOf(actor), "employee.update", "user", e.id, `Updated profile of ${after.fullName}`, { changed });
      return { user: after };
    }
    const pw = tempPassword();
    const id = await insert(
      db,
      `INSERT INTO users (employee_id, email, full_name, department_id, office_id, job_title, category_code, role, manager_id, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'employee', ?, ?, ?)`,
      e.employeeId, e.email, e.fullName, e.departmentId, e.officeId, e.jobTitle, e.categoryCode, e.managerId, hashPassword(pw), nowIso(),
    );
    await audit(db, actorOf(actor), "employee.create", "user", id, `Created employee ${e.fullName} (${e.employeeId}, ${e.categoryCode})`);
    return { user: (await getUser(db, id))!, tempPassword: pw };
  });
}

/* --------------------------------- HR: policy -------------------------------- */

const statusSchema = z.enum(["confirmed", "proposed", "assumption"]);
const policySchemas: { [K in keyof PolicySettings]: z.ZodType<PolicySettings[K]> } = {
  activeYear: z.number().int().min(2020).max(2100),
  restrictedMonths: z.array(z.number().int().min(1).max(12)).max(11).transform((a) => [...new Set(a)].sort((x, y) => x - y)),
  monthlyCapacity: z.number().int().min(1).max(1000),
  carryoverEnabled: z.boolean(),
  carryoverMaxDays: z.number().int().min(0).max(60),
  overdueApprovalDays: z.number().int().min(1).max(60),
  leaveTypes: z.array(z.string().trim().min(2).max(50)).min(1),
};

export async function updatePolicy(db: DB, actor: User, key: string, value: unknown, status: unknown) {
  assertHr(actor);
  if (!(key in policySchemas)) throw badRequest(`Unknown policy setting "${key}".`);
  const k = key as keyof PolicySettings;
  const v = parse(policySchemas[k] as z.ZodType<unknown>, value);
  const s = parse(statusSchema, status) as RuleStatus;
  await tx(db, async (db) => {
    const before = (await getPolicy(db))[k];
    await setSetting(db, k, v, s, actor.id);
    await audit(db, actorOf(actor), "policy.update", "policy", k, `Changed policy "${k}"`, { from: before, to: v, status: s });
  });
}

const categorySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z_]{2,20}$/, "use 2-20 capital letters"),
  name: z.string().trim().min(2).max(60),
  entitlementDays: z.number().int().min(0).max(100),
  status: statusSchema,
});

export async function saveCategory(db: DB, actor: User, input: unknown) {
  assertHr(actor);
  const c = parse(categorySchema, input);
  await tx(db, async (db) => {
    const before = await getCategory(db, c.code);
    await upsertCategory(db, c);
    await audit(db, actorOf(actor), before ? "category.update" : "category.create", "category", c.code,
      `${before ? "Updated" : "Created"} staff category ${c.name}: ${c.entitlementDays} days`, { before: before ?? null, after: c });
  });
}

/* ------------------------- HR: holidays & organisation ------------------------- */

export async function addHoliday(db: DB, actor: User, input: unknown) {
  assertHr(actor);
  const h = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().trim().min(2).max(80), note: z.string().max(200).default("") }), input);
  await tx(db, async (db) => {
    if (await get(db, "SELECT 1 FROM public_holidays WHERE date = ?", h.date)) throw badRequest("A holiday already exists on that date.");
    const id = await insert(db, "INSERT INTO public_holidays (date, name, note) VALUES (?, ?, ?)", h.date, h.name, h.note);
    await audit(db, actorOf(actor), "holiday.create", "holiday", id, `Added public holiday ${h.name} (${h.date})`);
  });
}

export async function deleteHoliday(db: DB, actor: User, id: number) {
  assertHr(actor);
  await tx(db, async (db) => {
    const h = await get<{ date: string; name: string }>(db, "SELECT date, name FROM public_holidays WHERE id = ?", id);
    if (!h) throw notFound("Holiday");
    await run(db, "DELETE FROM public_holidays WHERE id = ?", id);
    await audit(db, actorOf(actor), "holiday.delete", "holiday", id, `Removed public holiday ${h.name} (${h.date})`);
  });
}

export async function addOrgUnit(db: DB, actor: User, kind: "department" | "office", name: string) {
  assertHr(actor);
  const n = parse(z.string().trim().min(2).max(80), name);
  const table = kind === "department" ? "departments" : "offices";
  await tx(db, async (db) => {
    if (await get(db, `SELECT 1 FROM ${table} WHERE lower(name) = lower(?)`, n)) throw badRequest(`That ${kind} already exists.`);
    const id = await insert(db, `INSERT INTO ${table} (name) VALUES (?)`, n);
    await audit(db, actorOf(actor), `${kind}.create`, kind, id, `Added ${kind} ${n}`);
  });
}

const routeSchema = z.object({
  id: z.number().int().optional(),
  priority: z.number().int().min(1).max(999),
  scope_type: z.enum(["department", "category", "role", "default"]),
  scope_value: z.string().max(40).default(""),
  approver_mode: z.enum(["line_manager", "specific_user", "hr"]),
  approver_user_id: z.number().int().nullable().default(null),
  active: z.boolean(),
  note: z.string().max(200).default(""),
});

export async function saveRoute(db: DB, actor: User, input: unknown) {
  assertHr(actor);
  const r = parse(routeSchema, input);
  if (r.approver_mode === "specific_user") {
    const approver = r.approver_user_id ? await getUser(db, r.approver_user_id) : undefined;
    if (!approver || !["manager", "hr"].includes(approver.role)) throw badRequest("Choose a manager or HR user as the specific approver.");
  }
  await tx(db, async (db) => {
    const vals = [r.priority, r.scope_type, r.scope_type === "default" ? "" : r.scope_value, r.approver_mode,
      r.approver_mode === "specific_user" ? r.approver_user_id : null, r.active ? 1 : 0, r.note] as const;
    if (r.id) {
      await run(db, `UPDATE approval_routes SET priority = ?, scope_type = ?, scope_value = ?, approver_mode = ?, approver_user_id = ?, active = ?, note = ? WHERE id = ?`, ...vals, r.id);
    } else {
      r.id = await insert(db, `INSERT INTO approval_routes (priority, scope_type, scope_value, approver_mode, approver_user_id, active, note) VALUES (?, ?, ?, ?, ?, ?, ?)`, ...vals);
    }
    await audit(db, actorOf(actor), "route.save", "route", r.id, `Saved approval route #${r.id}: ${r.scope_type}${r.scope_value ? "=" + r.scope_value : ""} → ${r.approver_mode}`, { route: r });
  });
}

export async function deleteRoute(db: DB, actor: User, id: number) {
  assertHr(actor);
  await tx(db, async (db) => {
    if (!(await run(db, "DELETE FROM approval_routes WHERE id = ?", id)).changes) throw notFound("Route");
    await audit(db, actorOf(actor), "route.delete", "route", id, `Deleted approval route #${id}`);
  });
}

/* ---------------------------- System administration ---------------------------- */

const accessSchema = z.object({
  role: z.enum(["employee", "manager", "hr", "sysadmin"]).optional(),
  active: z.boolean().optional(),
});

export async function updateAccess(db: DB, actor: User, userId: number, input: unknown) {
  assertSysadmin(actor);
  const a = parse(accessSchema, input);
  if (userId === actor.id && (a.active === false || (a.role && a.role !== "sysadmin"))) {
    throw badRequest("You cannot deactivate or demote your own account.");
  }
  await tx(db, async (db) => {
    const before = await getUser(db, userId);
    if (!before) throw notFound("User");
    if (a.role) await run(db, "UPDATE users SET role = ? WHERE id = ?", a.role, userId);
    if (a.active !== undefined) {
      await run(db, "UPDATE users SET active = ? WHERE id = ?", a.active ? 1 : 0, userId);
      if (!a.active) await run(db, "DELETE FROM sessions WHERE user_id = ?", userId);
    }
    await audit(db, actorOf(actor), "access.update", "user", userId, `Changed access for ${before.fullName}`, {
      role: a.role ? { from: before.role, to: a.role } : undefined,
      active: a.active !== undefined ? { from: before.active, to: a.active } : undefined,
    });
  });
}

export async function resetPassword(db: DB, actor: User, userId: number): Promise<string> {
  assertSysadmin(actor);
  const pw = tempPassword();
  await tx(db, async (db) => {
    const u = await getUser(db, userId);
    if (!u) throw notFound("User");
    await run(db, "UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?", hashPassword(pw), userId);
    await run(db, "DELETE FROM sessions WHERE user_id = ?", userId);
    await audit(db, actorOf(actor), "access.password_reset", "user", userId, `Reset password for ${u.fullName} and ended their sessions`);
  });
  return pw;
}

export async function unlockUser(db: DB, actor: User, userId: number) {
  assertSysadmin(actor);
  await tx(db, async (db) => {
    const u = await getUser(db, userId);
    if (!u) throw notFound("User");
    await run(db, "UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?", userId);
    await audit(db, actorOf(actor), "access.unlock", "user", userId, `Unlocked account of ${u.fullName}`);
  });
}

export function listSessions(db: DB, actor: User) {
  assertSysadmin(actor);
  return all<{ id: string; user_id: number; full_name: string; created_at: string; expires_at: string; user_agent: string }>(
    db,
    `SELECT substr(s.token_hash, 1, 16) AS id, s.user_id, u.full_name, s.created_at, s.expires_at, s.user_agent
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.expires_at > ? ORDER BY s.created_at DESC`,
    nowIso(),
  );
}

export async function revokeSession(db: DB, actor: User, idPrefix: string) {
  assertSysadmin(actor);
  if (!/^[0-9a-f]{16}$/.test(idPrefix)) throw badRequest("Invalid session id.");
  await tx(db, async (db) => {
    await run(db, "DELETE FROM sessions WHERE substr(token_hash, 1, 16) = ?", idPrefix);
    await audit(db, actorOf(actor), "access.session_revoke", "session", idPrefix, "Revoked a user session");
  });
}

export async function changeOwnPassword(db: DB, actor: User, current: string, next: string) {
  const row = (await get<{ password_hash: string }>(db, "SELECT password_hash FROM users WHERE id = ?", actor.id))!;
  if (!verifyPassword(current ?? "", row.password_hash)) throw badRequest("Your current password is incorrect.");
  const problem = passwordProblem(next ?? "");
  if (problem) throw badRequest(problem);
  await tx(db, async (db) => {
    await run(db, "UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(next), actor.id);
    await audit(db, actorOf(actor), "auth.password_change", "user", actor.id, "Changed own password");
  });
}
