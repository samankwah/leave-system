import { route } from "@/server/api";
import { approvalQueue } from "@/server/services/queries";

/** The 50 most recent decisions in the caller's scope, fetched only when the "Recently decided" tab opens. */
export const GET = route(["manager", "hr"], async ({ db, user }) => approvalQueue(db, user, "decided"));
