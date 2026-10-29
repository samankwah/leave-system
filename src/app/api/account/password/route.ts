import { route } from "@/server/api";
import { changeOwnPassword } from "@/server/services/adminService";

export const POST = route(null, async ({ db, user, body }) => {
  const b = await body();
  await changeOwnPassword(db, user, String(b.current ?? ""), String(b.next ?? ""));
});
