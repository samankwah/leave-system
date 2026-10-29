import { route } from "@/server/api";
import { listNotifications } from "@/server/repos/notifications";

/** Newest first; `?before=<id>` pages backwards, `?limit=` caps the page (max 100). */
export const GET = route(null, async ({ db, user, req }) => {
  const url = new URL(req.url);
  const before = Number(url.searchParams.get("before")) || undefined;
  const limit = Math.min(100, Number(url.searchParams.get("limit")) || 20);
  return listNotifications(db, user.id, limit, before);
});
