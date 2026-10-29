import crypto from "node:crypto";
import { all, get, nowIso, run, tx, type DB } from "../db";

export interface Actor { id: number | null; name: string }
export const SYSTEM_ACTOR: Actor = { id: null, name: "System" };

export interface AuditEntry {
  id: number;
  ts: string;
  actor_id: number | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  details: string;
  prev_hash: string;
  hash: string;
}

const hashOf = (e: Omit<AuditEntry, "id" | "hash">) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify([e.ts, e.actor_id, e.actor_name, e.action, e.entity_type, e.entity_id, e.summary, e.details, e.prev_hash]))
    .digest("hex");

/**
 * Appends a hash-chained audit record. The table rejects UPDATE/DELETE via a trigger, and each
 * record's hash covers the previous record's hash, so edits made outside the app are detectable.
 * Runs under the global write lock so concurrent writers can't fork the chain.
 */
export function audit(
  db: DB,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | number | null,
  summary: string,
  details: Record<string, unknown> = {},
  ts = nowIso(),
) {
  return tx(db, async (t) => {
    const prev = (await get<{ hash: string }>(t, "SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1"))?.hash ?? "GENESIS";
    const entry = {
      ts, actor_id: actor.id, actor_name: actor.name, action, entity_type: entityType,
      entity_id: entityId === null ? null : String(entityId), summary, details: JSON.stringify(details), prev_hash: prev,
    };
    await run(
      t,
      `INSERT INTO audit_log (ts, actor_id, actor_name, action, entity_type, entity_id, summary, details, prev_hash, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.ts, entry.actor_id, entry.actor_name, entry.action, entry.entity_type, entry.entity_id, entry.summary,
      entry.details, entry.prev_hash, hashOf(entry),
    );
  });
}

export function listAudit(
  db: DB,
  f: { entityType?: string; entityId?: string | number; actorId?: number; search?: string; from?: string; to?: string; limit?: number } = {},
): Promise<AuditEntry[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (f.entityType) { where.push("entity_type = ?"); params.push(f.entityType); }
  if (f.entityId !== undefined) { where.push("entity_id = ?"); params.push(String(f.entityId)); }
  if (f.actorId) { where.push("actor_id = ?"); params.push(f.actorId); }
  if (f.from) { where.push("ts >= ?"); params.push(f.from); }
  if (f.to) { where.push("ts <= ?"); params.push(`${f.to}T23:59:59.999Z`); }
  if (f.search) { where.push("(summary ILIKE ? OR action ILIKE ? OR actor_name ILIKE ?)"); params.push(...Array(3).fill(`%${f.search}%`)); }
  return all<AuditEntry>(
    db,
    `SELECT * FROM audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ts DESC, id DESC LIMIT ?`,
    ...params, f.limit ?? 500,
  );
}

/** Audit history for many records of one type in a single query (avoids N+1). */
export async function auditFor(db: DB, entityType: string, ids: number[]): Promise<Map<number, AuditEntry[]>> {
  const out = new Map<number, AuditEntry[]>();
  if (!ids.length) return out;
  const rows = await all<AuditEntry>(
    db,
    `SELECT * FROM audit_log WHERE entity_type = ? AND entity_id IN (${ids.map(() => "?").join(",")}) ORDER BY ts DESC, id DESC`,
    entityType, ...ids.map(String),
  );
  for (const r of rows) out.set(Number(r.entity_id), [...(out.get(Number(r.entity_id)) ?? []), r]);
  return out;
}

export async function verifyAuditChain(db: DB): Promise<{ ok: boolean; checked: number; brokenAt?: number }> {
  let prev = "GENESIS";
  const rows = await all<AuditEntry>(db, "SELECT * FROM audit_log ORDER BY id");
  for (const r of rows) {
    if (r.prev_hash !== prev || hashOf(r) !== r.hash) return { ok: false, checked: rows.length, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, checked: rows.length };
}
