import { all, get, insertMany, nowIso, run, type DB } from "../db";

export interface Notification {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

/** One multi-row insert for all recipients. */
export async function notify(db: DB, userIds: (number | null | undefined)[], kind: string, title: string, body: string, link?: string, ts = nowIso()) {
  const ids = [...new Set(userIds.filter((u): u is number => typeof u === "number"))];
  await insertMany(db, "notifications", ["user_id", "kind", "title", "body", "link", "created_at"],
    ids.map((id) => [id, kind, title, body, link ?? null, ts]));
}

/** Newest first; pass `beforeId` to page backwards. */
export const listNotifications = (db: DB, userId: number, limit = 50, beforeId?: number) =>
  beforeId
    ? all<Notification>(db, "SELECT * FROM notifications WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?", userId, beforeId, limit)
    : all<Notification>(db, "SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?", userId, limit);

export const unreadCount = async (db: DB, userId: number) =>
  (await get<{ c: number }>(db, "SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = ? AND read_at IS NULL", userId))!.c;

export async function markRead(db: DB, userId: number, ids?: number[]) {
  if (ids?.length) {
    await run(db, `UPDATE notifications SET read_at = ? WHERE user_id = ? AND id IN (${ids.map(() => "?").join(",")})`, nowIso(), userId, ...ids);
  } else {
    await run(db, "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", nowIso(), userId);
  }
}
