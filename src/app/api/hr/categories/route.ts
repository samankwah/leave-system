import { route } from "@/server/api";
import { saveCategory } from "@/server/services/adminService";

export const POST = route(["hr"], async ({ db, user, body }) => saveCategory(db, user, await body()));
