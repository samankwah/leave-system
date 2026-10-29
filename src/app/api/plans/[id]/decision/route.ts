import { idParam, route } from "@/server/api";
import { decidePlan, type Decision } from "@/server/services/planService";

export const POST = route(["manager", "hr"], async ({ db, user, params, body }) => {
  const b = await body();
  return decidePlan(db, user, idParam(params), b.decision as Decision, String(b.reason ?? ""));
});
