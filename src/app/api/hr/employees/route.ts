import { route } from "@/server/api";
import { saveEmployee } from "@/server/services/adminService";

export const POST = route(["hr"], async ({ db, user, body }) => saveEmployee(db, user, await body()));
