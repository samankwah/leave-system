import { idParam, route } from "@/server/api";
import { deleteRoute } from "@/server/services/adminService";

export const DELETE = route(["hr"], ({ db, user, params }) => deleteRoute(db, user, idParam(params)));
