import { route } from "@/server/api";
import { audit } from "@/server/repos/audit";
import { resetDemoData } from "@/server/instance";

/** Prototype convenience: wipes the database and reloads the synthetic demo data. */
export const POST = route(["sysadmin"], async ({ user }) => {
  const db = await resetDemoData();
  await audit(db, { id: null, name: user.fullName }, "system.reset", "system", null, "Reset all data to the synthetic demo dataset");
  return { ok: true };
});
