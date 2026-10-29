import { idParam, route } from "@/server/api";
import { updateAccess } from "@/server/services/adminService";

export const PATCH = route(["sysadmin"], async ({ db, user, params, body }) => updateAccess(db, user, idParam(params), await body()));
