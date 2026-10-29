import { route } from "@/server/api";
import { updatePolicy } from "@/server/services/adminService";

export const PUT = route(["hr"], async ({ db, user, body }) => {
  const b = await body();
  updatePolicy(db, user, String(b.key), b.value, b.status);
});
