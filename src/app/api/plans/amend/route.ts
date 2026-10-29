import { route } from "@/server/api";
import { startAmendment } from "@/server/services/planService";

export const POST = route(null, async ({ db, user, body }) => startAmendment(db, user, Number((await body()).year)));
