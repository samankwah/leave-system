import { route } from "@/server/api";
import { revokeSession } from "@/server/services/adminService";

export const DELETE = route(["sysadmin"], ({ db, user, params }) => revokeSession(db, user, params.id));
