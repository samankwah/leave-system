import crypto from "node:crypto";
import { get, nowIso, run, type DB } from "./db";
import { ServiceError } from "./errors";
import { audit } from "./repos/audit";
import { findLogin, getUser, mapUserRow, type User } from "./repos/users";

export { SESSION_COOKIE } from "@/lib/constants";
export const SESSION_HOURS = 8;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(salt, "base64"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must contain letters and numbers.";
  return null;
}

const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function login(db: DB, loginId: string, password: string, userAgent?: string): { user: User; token: string } {
  const generic = new ServiceError(401, "Invalid Employee ID/email or password.");
  if (!loginId?.trim() || !password) throw new ServiceError(400, "Enter your Employee ID or official email and your password.");
  const row = findLogin(db, loginId);
  if (!row) throw generic;
  if (row.active !== 1) throw new ServiceError(403, "This account is deactivated. Contact the System Administrator.");
  if (row.locked_until && row.locked_until > nowIso()) {
    throw new ServiceError(423, "This account is temporarily locked after repeated failed sign-in attempts. Try again later or contact the System Administrator.");
  }
  if (!verifyPassword(password, row.password_hash)) {
    const failed = row.failed_logins + 1;
    const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    run(db, "UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?", lock ? 0 : failed, lock, row.id);
    if (lock) audit(db, { id: row.id, name: row.full_name }, "auth.locked", "user", row.id, `Account locked after ${MAX_FAILED} failed sign-in attempts`);
    throw generic;
  }
  run(db, "UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?", row.id);
  const token = crypto.randomBytes(32).toString("base64url");
  const created = new Date();
  run(
    db,
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
    tokenHash(token), row.id, created.toISOString(), new Date(created.getTime() + SESSION_HOURS * 3600_000).toISOString(),
    (userAgent ?? "").slice(0, 200),
  );
  audit(db, { id: row.id, name: row.full_name }, "auth.login", "user", row.id, "Signed in");
  return { user: mapUserRow(row), token };
}

export function userForToken(db: DB, token: string | undefined): User | null {
  if (!token) return null;
  const s = get<{ user_id: number; expires_at: string }>(db, "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?", tokenHash(token));
  if (!s || s.expires_at < nowIso()) return null;
  const user = getUser(db, s.user_id);
  return user?.active ? user : null;
}

export function logout(db: DB, token: string | undefined) {
  if (!token) return;
  const user = userForToken(db, token);
  run(db, "DELETE FROM sessions WHERE token_hash = ?", tokenHash(token));
  if (user) audit(db, { id: user.id, name: user.fullName }, "auth.logout", "user", user.id, "Signed out");
}
