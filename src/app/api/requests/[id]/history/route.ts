import { idParam, route } from "@/server/api";
import { forbidden, notFound } from "@/server/errors";
import { listAudit } from "@/server/repos/audit";
import { getRequest } from "@/server/repos/leave";
import { getUser } from "@/server/repos/users";

/** Activity timeline for one request, loaded when its detail drawer opens (owner, its approver, the owner's line manager or HR). */
export const GET = route(null, async ({ db, user, params }) => {
  const id = idParam(params);
  const req = await getRequest(db, id);
  if (!req) throw notFound("Leave request");
  if (req.employeeId !== user.id && req.approverId !== user.id && user.role !== "hr") {
    const owner = user.role === "manager" ? await getUser(db, req.employeeId) : undefined;
    if (owner?.managerId !== user.id) throw forbidden();
  }
  return (await listAudit(db, { entityType: "request", entityId: id })).map((a) => ({ id: a.id, ts: a.ts, actor: a.actor_name, summary: a.summary }));
});
