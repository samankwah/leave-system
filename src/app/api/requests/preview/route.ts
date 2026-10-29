import { route } from "@/server/api";
import { analyseRequestFor } from "@/server/services/requestService";

/** Authoritative server-side validation of a prospective request (used by the review summary). */
export const POST = route(null, async ({ db, user, body }) => {
  const b = await body();
  const id = b.requestId ? Number(b.requestId) : undefined;
  return analyseRequestFor(db, user.id, { start: String(b.start ?? ""), end: String(b.end ?? "") }, "submit", id);
});
