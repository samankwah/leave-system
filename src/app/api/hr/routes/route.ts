import { route } from "@/server/api";
import { saveRoute } from "@/server/services/adminService";

export const POST = route(["hr"], async ({ db, user, body }) => saveRoute(db, user, await body()));
