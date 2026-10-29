/**
 * Async Postgres access with two interchangeable drivers:
 *   - node-postgres (`pg`) against Neon when DATABASE_URL is set (Vercel / production);
 *   - PGlite (Postgres compiled to WASM) for tests, E2E runs and offline development.
 *
 * SQL is written with `?` placeholders and converted to `$1, $2, …`.
 */

export type Param = string | number | boolean | null | undefined | Buffer | Uint8Array;

export interface QueryResult<T> { rows: T[]; rowCount: number }

export interface DB {
  /** True when this handle is bound to an open transaction. */
  readonly inTx: boolean;
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Runs one or more statements without parameters (DDL). */
  exec(sql: string): Promise<void>;
  /** Runs `fn` in a transaction; `fn` must use the handle it receives. Takes no locks by itself. */
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T>;
  /**
   * Registers work to run inside the transaction just before COMMIT (transaction handles only).
   * Used to append audit records at the very end, so the audit-chain lock is held for milliseconds.
   */
  beforeCommit(hook: (db: DB) => Promise<void>): void;
  close(): Promise<void>;
}

export function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const norm = (params: Param[]): unknown[] =>
  params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));

export async function all<T>(db: DB, sql: string, ...params: Param[]): Promise<T[]> {
  return (await db.query<T>(toPg(sql), norm(params))).rows;
}

export async function get<T>(db: DB, sql: string, ...params: Param[]): Promise<T | undefined> {
  return (await db.query<T>(toPg(sql), norm(params))).rows[0];
}

export async function run(db: DB, sql: string, ...params: Param[]): Promise<{ changes: number }> {
  return { changes: (await db.query(toPg(sql), norm(params))).rowCount };
}

/** INSERT … RETURNING id. */
export async function insert(db: DB, sql: string, ...params: Param[]): Promise<number> {
  const r = await db.query<{ id: number }>(`${toPg(sql)} RETURNING id`, norm(params));
  return Number(r.rows[0].id);
}

/**
 * Multi-row INSERT in one round trip: `insertMany(db, "plan_periods", ["plan_id","start_date"], rows)`.
 * Table and column names are code constants, never user input.
 */
export async function insertMany(db: DB, table: string, columns: string[], rows: Param[][]): Promise<void> {
  if (!rows.length) return;
  const tuple = `(${columns.map(() => "?").join(", ")})`;
  await run(db, `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${rows.map(() => tuple).join(", ")}`, ...rows.flat());
}

/** Runs `fn` atomically. Nested calls join the outer transaction. */
export function tx<T>(db: DB, fn: (db: DB) => Promise<T>): Promise<T> {
  return db.inTx ? fn(db) : db.transaction(fn);
}

/**
 * Takes transaction-scoped advisory locks for the given keys (sorted, so every caller acquires them
 * in the same order and two transactions can't deadlock). Locks release automatically at COMMIT/ROLLBACK.
 *
 * Keys in use:
 *   emp:<userId>    — one employee's plans, requests and balance (no double-spend across months);
 *   cap:<YYYY-MM>   — a month's employee capacity (the read-then-write of the last free slot);
 *   audit-chain     — appending to the hash-chained audit log (held only during the final append);
 *   migrate         — schema creation and seeding on cold start.
 */
export async function lockKeys(db: DB, keys: string[]): Promise<void> {
  if (!db.inTx) throw new Error("lockKeys must be called inside a transaction");
  const sorted = [...new Set(keys)].sort();
  for (const k of sorted) await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [k]);
}

export const empKey = (userId: number) => `emp:${userId}`;
export const capKeys = (months: string[]) => months.map((m) => `cap:${m}`);

export const nowIso = () => new Date().toISOString();

export function todayIso(): string {
  return process.env.LEAVE_TODAY ?? new Date().toISOString().slice(0, 10);
}
