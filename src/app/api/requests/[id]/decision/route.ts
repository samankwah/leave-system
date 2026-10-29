import { idParam, route } from "@/server/api";
import type { Decision } from "@/server/services/planService";
import { decideRequest } from "@/server/services/requestService";

export const POST = route(["manager", "hr"], async ({ db, user, params, body }) => {
  const b = await body();
  return decideRequest(db, user, idParam(params), b.decision as Decision, String(b.reason ?? ""));
});
