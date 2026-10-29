import type { PGlite, Transaction } from "@electric-sql/pglite";
import type { Pool, PoolClient } from "pg";
import { WRITE_LOCK_SQL, type DB, type QueryResult } from "./db";

/* ----------------------------- node-postgres (Neon) ----------------------------- */

class PgDb implements DB {
  constructor(private readonly q: Pool | PoolClient, readonly inTx = false) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const r = await this.q.query(sql, params);
    return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
  }

  async exec(sql: string) {
    await this.q.query(sql);
  }

  async transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
    const client = await (this.q as Pool).connect();
    try {
      await client.query("BEGIN");
      await client.query(WRITE_LOCK_SQL);
      const result = await fn(new PgDb(client, true));
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
  const pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
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
  constructor(private readonly pg: PGlite | Transaction, readonly inTx = false) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const r = await this.pg.query<T>(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  }

  async exec(sql: string) {
    await this.pg.exec(sql);
  }

  /** PGlite serialises transactions against all other queries on the instance. */
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
    return (this.pg as PGlite).transaction(async (t) => {
      await t.query(WRITE_LOCK_SQL);
      return fn(new PgliteDb(t, true));
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
