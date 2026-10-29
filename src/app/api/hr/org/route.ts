import { route } from "@/server/api";
import { addOrgUnit } from "@/server/services/adminService";

export const POST = route(["hr"], async ({ db, user, body }) => {
  const b = await body();
  addOrgUnit(db, user, b.kind === "office" ? "office" : "department", String(b.name ?? ""));
});
