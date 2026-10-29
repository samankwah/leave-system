import crypto from "node:crypto";
import { get, nowIso, run, tx, type DB } from "./db";
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

export async function login(db: DB, loginId: string, password: string, userAgent?: string): Promise<{ user: User; token: string }> {
  const generic = new ServiceError(401, "Invalid Employee ID/email or password.");
  if (!loginId?.trim() || !password) throw new ServiceError(400, "Enter your Employee ID or official email and your password.");
  // Record the outcome inside the transaction, but throw only after it commits so failed-attempt counters persist.
  const outcome = await tx(db, async (t): Promise<{ user: User; token: string } | ServiceError> => {
    const row = await findLogin(t, loginId);
    if (!row) return generic;
    if (row.active !== 1) return new ServiceError(403, "This account is deactivated. Contact the System Administrator.");
    if (row.locked_until && row.locked_until > nowIso()) {
      return new ServiceError(423, "This account is temporarily locked after repeated failed sign-in attempts. Try again later or contact the System Administrator.");
    }
    if (!verifyPassword(password, row.password_hash)) {
      const failed = row.failed_logins + 1;
      const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
      await run(t, "UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?", lock ? 0 : failed, lock, row.id);
      if (lock) await audit(t, { id: row.id, name: row.full_name }, "auth.locked", "user", row.id, `Account locked after ${MAX_FAILED} failed sign-in attempts`);
      return generic;
    }
    await run(t, "UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?", row.id);
    const token = crypto.randomBytes(32).toString("base64url");
    const created = new Date();
    await run(
      t,
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
      tokenHash(token), row.id, created.toISOString(), new Date(created.getTime() + SESSION_HOURS * 3600_000).toISOString(),
      (userAgent ?? "").slice(0, 200),
    );
    await audit(t, { id: row.id, name: row.full_name }, "auth.login", "user", row.id, "Signed in");
    return { user: mapUserRow(row), token };
  });
  if (outcome instanceof ServiceError) throw outcome;
  return outcome;
}

export async function userForToken(db: DB, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const s = await get<{ user_id: number; expires_at: string }>(db, "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?", tokenHash(token));
  if (!s || s.expires_at < nowIso()) return null;
  const user = await getUser(db, s.user_id);
  return user?.active ? user : null;
}

export async function logout(db: DB, token: string | undefined) {
  if (!token) return;
  await tx(db, async (t) => {
    const user = await userForToken(t, token);
    await run(t, "DELETE FROM sessions WHERE token_hash = ?", tokenHash(token));
    if (user) await audit(t, { id: user.id, name: user.fullName }, "auth.logout", "user", user.id, "Signed out");
  });
}
