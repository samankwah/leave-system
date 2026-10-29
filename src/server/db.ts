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
  /** Runs `fn` in a transaction holding the global write lock; `fn` must use the handle it receives. */
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Transaction-scoped advisory lock: serialises writers across connections and instances (like SQLite's BEGIN IMMEDIATE). */
export const WRITE_LOCK_SQL = "SELECT pg_advisory_xact_lock(424242)";

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
 * Runs `fn` atomically under the global write lock. The lock is taken BEFORE capacity is read,
 * so two writers (even on different serverless instances) can never both see the last free slot.
 * Nested calls join the outer transaction.
 */
export function tx<T>(db: DB, fn: (db: DB) => Promise<T>): Promise<T> {
  return db.inTx ? fn(db) : db.transaction(fn);
}

export const nowIso = () => new Date().toISOString();

export function todayIso(): string {
  return process.env.LEAVE_TODAY ?? new Date().toISOString().slice(0, 10);
}
