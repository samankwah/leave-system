import { idParam, route } from "@/server/api";
import { resetPassword } from "@/server/services/adminService";

export const POST = route(["sysadmin"], ({ db, user, params }) => ({ tempPassword: resetPassword(db, user, idParam(params)) }));
