import type { PGlite, Transaction } from "@electric-sql/pglite";
import type { Pool, PoolClient } from "pg";
import type { DB, QueryResult } from "./db";

/** Optional query counter for diagnostics and tests (LEAVE_QUERY_STATS=1 or `countQueries`). */
export const queryStats = { count: 0, enabled: process.env.LEAVE_QUERY_STATS === "1" };

/* ----------------------------- node-postgres (Neon) ----------------------------- */

class PgDb implements DB {
  private hooks: ((db: DB) => Promise<void>)[] = [];
  constructor(private readonly q: Pool | PoolClient, readonly inTx = false) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    if (queryStats.enabled) queryStats.count++;
    const r = await this.q.query(sql, params);
    return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
  }

  async exec(sql: string) {
    await this.q.query(sql);
  }

  beforeCommit(hook: (db: DB) => Promise<void>) {
    if (!this.inTx) throw new Error("beforeCommit requires a transaction");
    this.hooks.push(hook);
  }

  async transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
    const client = await (this.q as Pool).connect();
    try {
      await client.query("BEGIN");
      const t = new PgDb(client, true);
      const result = await fn(t);
      for (const h of t.hooks) await h(t);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async close() {
    if (!this.inTx) await (this.q as Pool).end();
  }
}

/** Pooled connection to Neon. On Vercel Fluid compute the pool is shared across requests on an instance. */
export async function openPg(connectionString: string): Promise<DB> {
  const pg = await import("pg");
  // COUNT(*) and other int8 results arrive as strings by default; these values are small.
  pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));
  // Neon's pooled endpoint is PgBouncer, so a larger per-instance pool is cheap.
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 10_000 });
  try {
    const { attachDatabasePool } = await import("@vercel/functions");
    attachDatabasePool(pool);
  } catch {
    // Not on Vercel — nothing to attach.
  }
  return new PgDb(pool);
}

/* --------------------------------- PGlite --------------------------------- */

class PgliteDb implements DB {
  private hooks: ((db: DB) => Promise<void>)[] = [];
  constructor(private readonly pg: PGlite | Transaction, readonly inTx = false) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    if (queryStats.enabled) queryStats.count++;
    const r = await this.pg.query<T>(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  }

  async exec(sql: string) {
    await this.pg.exec(sql);
  }

  beforeCommit(hook: (db: DB) => Promise<void>) {
    if (!this.inTx) throw new Error("beforeCommit requires a transaction");
    this.hooks.push(hook);
  }

  /** PGlite serialises transactions against all other queries on the instance. */
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
    return (this.pg as PGlite).transaction(async (tr) => {
      const t = new PgliteDb(tr, true);
      const result = await fn(t);
      for (const h of t.hooks) await h(t);
      return result;
    });
  }

  async close() {
    if (!this.inTx) await (this.pg as PGlite).close();
  }

  /** Copy-on-write clone of the whole database (fast test fixtures). */
  async clone(): Promise<PgliteDb> {
    return new PgliteDb((await (this.pg as PGlite).clone()) as PGlite);
  }
}

const int8 = { 20: (v: string) => Number.parseInt(v, 10) };

/** In-process Postgres. `dataDir` persists to disk; omit it for an in-memory database. */
export async function openPglite(dataDir?: string): Promise<DB & { clone(): Promise<DB> }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = dataDir ? await PGlite.create(dataDir, { parsers: int8 }) : await PGlite.create({ parsers: int8 });
  return new PgliteDb(pg);
}
