import { idParam, route } from "@/server/api";
import { submitPlan } from "@/server/services/planService";

export const POST = route(null, async ({ db, user, params }) => submitPlan(db, user, idParam(params)));
