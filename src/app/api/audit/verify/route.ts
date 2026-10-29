import { route } from "@/server/api";
import { verifyAuditChain } from "@/server/repos/audit";

export const GET = route(["hr", "sysadmin"], ({ db }) => verifyAuditChain(db));
