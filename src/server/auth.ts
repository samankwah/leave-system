import crypto from "node:crypto";
import { promisify } from "node:util";
import { nowIso, run, tx, type DB } from "./db";
import { ServiceError } from "./errors";
import { audit } from "./repos/audit";
import { findLogin, getUserBySession, mapUserRow, type User } from "./repos/users";

export { SESSION_COOKIE } from "@/lib/constants";
export const SESSION_HOURS = 8;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

// Async scrypt runs on libuv's thread pool, so hashing never blocks other requests on the instance.
const scrypt = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must contain letters and numbers.";
  return null;
}

const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Routine sign-in activity goes to auth_events (not the hash chain), so sign-ins never contend on the audit lock. */
async function authEvent(db: DB, userId: number | null, login: string, kind: string, userAgent?: string) {
  await run(db, "INSERT INTO auth_events (ts, user_id, login, kind, user_agent) VALUES (?, ?, ?, ?, ?)",
    nowIso(), userId, login.slice(0, 120), kind, (userAgent ?? "").slice(0, 200));
}

/**
 * Signs a user in. The password is verified before any transaction, so no lock or pooled
 * connection is held during hashing. The writes afterwards are a few small statements.
 */
export async function login(db: DB, loginId: string, password: string, userAgent?: string): Promise<{ user: User; token: string }> {
  const generic = new ServiceError(401, "Invalid Employee ID/email or password.");
  if (!loginId?.trim() || !password) throw new ServiceError(400, "Enter your Employee ID or official email and your password.");
  const row = await findLogin(db, loginId);
  if (!row) {
    await authEvent(db, null, loginId, "failed", userAgent);
    throw generic;
  }
  if (row.active !== 1) throw new ServiceError(403, "This account is deactivated. Contact the System Administrator.");
  if (row.locked_until && row.locked_until > nowIso()) {
    throw new ServiceError(423, "This account is temporarily locked after repeated failed sign-in attempts. Try again later or contact the System Administrator.");
  }

  if (!(await verifyPassword(password, row.password_hash))) {
    await tx(db, async (t) => {
      // Atomic increment, so concurrent failures are all counted.
      const r = await t.query<{ failed_logins: number }>("UPDATE users SET failed_logins = failed_logins + 1 WHERE id = $1 RETURNING failed_logins", [row.id]);
      if ((r.rows[0]?.failed_logins ?? 0) >= MAX_FAILED) {
        const until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
        await run(t, "UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?", until, row.id);
        await audit(t, { id: row.id, name: row.full_name }, "auth.locked", "user", row.id, `Account locked after ${MAX_FAILED} failed sign-in attempts`);
      }
      await authEvent(t, row.id, loginId, "failed", userAgent);
    });
    throw generic;
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const created = new Date();
  await tx(db, async (t) => {
    await run(t, "UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ? AND (failed_logins <> 0 OR locked_until IS NOT NULL)", row.id);
    await run(
      t,
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
      tokenHash(token), row.id, created.toISOString(), new Date(created.getTime() + SESSION_HOURS * 3600_000).toISOString(),
      (userAgent ?? "").slice(0, 200),
    );
    // Housekeeping: expired sessions are removed opportunistically (indexed, so cheap).
    await run(t, "DELETE FROM sessions WHERE expires_at < ?", created.toISOString());
    await authEvent(t, row.id, loginId, "login", userAgent);
  });
  return { user: mapUserRow(row), token };
}

/** One query: session → active user with labels. */
export async function userForToken(db: DB, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  return (await getUserBySession(db, tokenHash(token), nowIso())) ?? null;
}

export async function logout(db: DB, token: string | undefined) {
  if (!token) return;
  const r = await db.query<{ user_id: number }>("DELETE FROM sessions WHERE token_hash = $1 RETURNING user_id", [tokenHash(token)]);
  if (r.rows[0]) await authEvent(db, r.rows[0].user_id, "", "logout");
}
