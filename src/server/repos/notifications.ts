import { all, get, nowIso, run, type DB } from "../db";

export interface Notification {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function notify(db: DB, userIds: (number | null | undefined)[], kind: string, title: string, body: string, link?: string, ts = nowIso()) {
  for (const id of new Set(userIds.filter((u): u is number => typeof u === "number"))) {
    run(db, "INSERT INTO notifications (user_id, kind, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, kind, title, body, link ?? null, ts);
  }
}

export const listNotifications = (db: DB, userId: number, limit = 100) =>
  all<Notification>(db, "SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?", userId, limit);

export const unreadCount = (db: DB, userId: number) =>
  get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL", userId)!.c;

export function markRead(db: DB, userId: number, ids?: number[]) {
  if (ids?.length) {
    run(db, `UPDATE notifications SET read_at = ? WHERE user_id = ? AND id IN (${ids.map(() => "?").join(",")})`, nowIso(), userId, ...ids);
  } else {
    run(db, "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", nowIso(), userId);
  }
}
