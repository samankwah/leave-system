import type { Period } from "@/domain/types";
import { route } from "@/server/api";
import { savePlanDraft } from "@/server/services/planService";

/** Save (create or update) the signed-in employee's draft plan. */
export const POST = route(null, async ({ db, user, body }) => {
  const b = await body();
  return savePlanDraft(db, user, Number(b.year), (b.periods ?? []) as Period[]);
});
