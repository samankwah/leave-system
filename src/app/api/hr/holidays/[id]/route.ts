import { idParam, route } from "@/server/api";
import { deleteHoliday } from "@/server/services/adminService";

export const DELETE = route(["hr"], async ({ db, user, params }) => deleteHoliday(db, user, idParam(params)));
