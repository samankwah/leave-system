import { route } from "@/server/api";
import { addHoliday } from "@/server/services/adminService";

export const POST = route(["hr"], async ({ db, user, body }) => addHoliday(db, user, await body()));
