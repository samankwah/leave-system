import { idParam, route } from "@/server/api";
import { discardDraft } from "@/server/services/planService";

export const DELETE = route(null, async ({ db, user, params }) => discardDraft(db, user, idParam(params)));
