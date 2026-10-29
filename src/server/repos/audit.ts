import crypto from "node:crypto";
import { all, get, nowIso, run, type DB } from "../db";

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
 * Appends a hash-chained audit record. The table rejects UPDATE/DELETE via triggers, and each
 * record's hash covers the previous record's hash, so edits made outside the app are detectable.
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
  const prev = get<{ hash: string }>(db, "SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")?.hash ?? "GENESIS";
  const entry = {
    ts, actor_id: actor.id, actor_name: actor.name, action, entity_type: entityType,
    entity_id: entityId === null ? null : String(entityId), summary, details: JSON.stringify(details), prev_hash: prev,
  };
  run(
    db,
    `INSERT INTO audit_log (ts, actor_id, actor_name, action, entity_type, entity_id, summary, details, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.ts, entry.actor_id, entry.actor_name, entry.action, entry.entity_type, entry.entity_id, entry.summary,
    entry.details, entry.prev_hash, hashOf(entry),
  );
}

export function listAudit(
  db: DB,
  f: { entityType?: string; entityId?: string | number; actorId?: number; search?: string; from?: string; to?: string; limit?: number } = {},
): AuditEntry[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (f.entityType) { where.push("entity_type = ?"); params.push(f.entityType); }
  if (f.entityId !== undefined) { where.push("entity_id = ?"); params.push(String(f.entityId)); }
  if (f.actorId) { where.push("actor_id = ?"); params.push(f.actorId); }
  if (f.from) { where.push("ts >= ?"); params.push(f.from); }
  if (f.to) { where.push("ts <= ?"); params.push(`${f.to}T23:59:59.999Z`); }
  if (f.search) { where.push("(summary LIKE ? OR action LIKE ? OR actor_name LIKE ?)"); params.push(...Array(3).fill(`%${f.search}%`)); }
  return all<AuditEntry>(
    db,
    `SELECT * FROM audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ts DESC, id DESC LIMIT ?`,
    ...params, f.limit ?? 500,
  );
}

export function verifyAuditChain(db: DB): { ok: boolean; checked: number; brokenAt?: number } {
  let prev = "GENESIS";
  const rows = all<AuditEntry>(db, "SELECT * FROM audit_log ORDER BY id");
  for (const r of rows) {
    if (r.prev_hash !== prev || hashOf(r) !== r.hash) return { ok: false, checked: rows.length, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, checked: rows.length };
}
