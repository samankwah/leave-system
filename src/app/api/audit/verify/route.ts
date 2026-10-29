import { route } from "@/server/api";
import { verifyAuditChain } from "@/server/repos/audit";

/** Incremental chain check by default; `?full=1` re-verifies every record from the start. */
export const GET = route(["hr", "sysadmin"], async ({ db, req }) =>
  verifyAuditChain(db, { full: new URL(req.url).searchParams.get("full") === "1" }));
