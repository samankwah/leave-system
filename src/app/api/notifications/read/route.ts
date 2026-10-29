import { route } from "@/server/api";
import { markRead } from "@/server/repos/notifications";

export const POST = route(null, async ({ db, user, body }) => {
  const ids = (await body()).ids;
  await markRead(db, user.id, Array.isArray(ids) ? ids.map(Number) : undefined);
});
