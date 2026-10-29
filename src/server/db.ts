import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { SCHEMA, SCHEMA_VERSION } from "./schema";

export type DB = DatabaseSync;
export type Param = SQLInputValue | boolean | undefined;

export function openDb(file: string, opts: { seed?: (db: DB) => void } = {}): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
  if (opts.seed && get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM users")!.c === 0) opts.seed(db);
  return db;
}

const norm = (params: Param[]): SQLInputValue[] =>
  params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));

// node:sqlite returns null-prototype rows; copy them to plain objects so they can cross into React client components.
export function all<T>(db: DB, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...norm(params)).map((r) => ({ ...r })) as T[];
}
export function get<T>(db: DB, sql: string, ...params: Param[]): T | undefined {
  const r = db.prepare(sql).get(...norm(params));
  return (r ? { ...r } : undefined) as T | undefined;
}
export function run(db: DB, sql: string, ...params: Param[]): { changes: number; lastId: number } {
  const r = db.prepare(sql).run(...norm(params));
  return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
}

/**
 * Runs `fn` in a BEGIN IMMEDIATE transaction: the write lock is taken BEFORE capacity is read,
 * so two writers (processes or connections) can never both see the last free slot.
 * Nested calls join the outer transaction.
 */
export function tx<T>(db: DB, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
}

export const nowIso = () => new Date().toISOString();

export function todayIso(): string {
  return process.env.LEAVE_TODAY ?? new Date().toISOString().slice(0, 10);
}
