import { idParam, route } from "@/server/api";
import { cancelRequest } from "@/server/services/requestService";

export const POST = route(null, async ({ db, user, params, body }) => cancelRequest(db, user, idParam(params), String((await body()).reason ?? "")));
