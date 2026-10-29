import crypto from "node:crypto";
import { all, get, insertMany, lockKeys, nowIso, run, type DB } from "../db";

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

type Draft = Omit<AuditEntry, "id" | "hash" | "prev_hash">;

const hashOf = (e: Omit<AuditEntry, "id" | "hash">) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify([e.ts, e.actor_id, e.actor_name, e.action, e.entity_type, e.entity_id, e.summary, e.details, e.prev_hash]))
    .digest("hex");

const COLUMNS = ["ts", "actor_id", "actor_name", "action", "entity_type", "entity_id", "summary", "details", "prev_hash", "hash"];
const pending = new WeakMap<DB, Draft[]>();

/** Appends buffered entries to the chain: one lock, one read of the tip, one multi-row insert. */
async function flush(t: DB, drafts: Draft[]) {
  await lockKeys(t, ["audit-chain"]);
  let prev = (await get<{ hash: string }>(t, "SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1"))?.hash ?? "GENESIS";
  const rows = drafts.map((d) => {
    const entry = { ...d, prev_hash: prev };
    prev = hashOf(entry);
    return [entry.ts, entry.actor_id, entry.actor_name, entry.action, entry.entity_type, entry.entity_id, entry.summary, entry.details, entry.prev_hash, prev];
  });
  await insertMany(t, "audit_log", COLUMNS, rows);
}

/**
 * Records a hash-chained audit entry. The table rejects UPDATE/DELETE via a trigger, and each
 * record's hash covers the previous one, so edits made outside the app are detectable.
 *
 * Inside a transaction the entry is buffered and appended just before COMMIT, so the global
 * `audit-chain` lock is held only for that final append — not for the whole business operation.
 * A rolled-back transaction leaves no audit entry.
 */
export async function audit(
  db: DB,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | number | null,
  summary: string,
  details: Record<string, unknown> = {},
  ts = nowIso(),
): Promise<void> {
  const draft: Draft = {
    ts, actor_id: actor.id, actor_name: actor.name, action, entity_type: entityType,
    entity_id: entityId === null ? null : String(entityId), summary, details: JSON.stringify(details),
  };
  if (!db.inTx) {
    await db.transaction((t) => flush(t, [draft]));
    return;
  }
  let list = pending.get(db);
  if (!list) {
    const drafts: Draft[] = [];
    list = drafts;
    pending.set(db, drafts);
    db.beforeCommit((t) => flush(t, drafts));
  }
  list.push(draft);
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

export interface ChainCheck { ok: boolean; checked: number; verifiedNow: number; incremental: boolean; brokenAt?: number }

const CHECKPOINT = "audit_checkpoint";
const BATCH = 2000;

/**
 * Verifies the hash chain. By default it is incremental: it re-checks the stored checkpoint record
 * and then only records added since, so the cost doesn't grow with the size of the log.
 * `full: true` re-verifies everything from the first record, in batches.
 */
export async function verifyAuditChain(db: DB, opts: { full?: boolean } = {}): Promise<ChainCheck> {
  const cp = opts.full ? undefined : await get<{ value: string }>(db, "SELECT value FROM meta WHERE key = ?", CHECKPOINT);
  let lastId = 0;
  let prev = "GENESIS";
  if (cp) {
    const c = JSON.parse(cp.value) as { id: number; hash: string };
    const row = await get<AuditEntry>(db, "SELECT * FROM audit_log WHERE id = ?", c.id);
    const total = (await get<{ c: number }>(db, "SELECT COUNT(*)::int AS c FROM audit_log"))!.c;
    if (!row || row.hash !== c.hash || hashOf(row) !== row.hash) return { ok: false, checked: total, verifiedNow: 1, incremental: true, brokenAt: c.id };
    lastId = c.id;
    prev = c.hash;
  }
  let verified = 0;
  for (;;) {
    const rows = await all<AuditEntry>(db, "SELECT * FROM audit_log WHERE id > ? ORDER BY id LIMIT ?", lastId, BATCH);
    for (const r of rows) {
      verified++;
      if (r.prev_hash !== prev || hashOf(r) !== r.hash) {
        const total = (await get<{ c: number }>(db, "SELECT COUNT(*)::int AS c FROM audit_log"))!.c;
        return { ok: false, checked: total, verifiedNow: verified, incremental: !!cp, brokenAt: r.id };
      }
      prev = r.hash;
      lastId = r.id;
    }
    if (rows.length < BATCH) break;
  }
  if (lastId) {
    await run(db, "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      CHECKPOINT, JSON.stringify({ id: lastId, hash: prev }));
  }
  const total = (await get<{ c: number }>(db, "SELECT COUNT(*)::int AS c FROM audit_log"))!.c;
  return { ok: true, checked: total, verifiedNow: verified, incremental: !!cp };
}
