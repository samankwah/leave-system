import { idParam, route } from "@/server/api";
import { unlockUser } from "@/server/services/adminService";

export const POST = route(["sysadmin"], ({ db, user, params }) => unlockUser(db, user, idParam(params)));
