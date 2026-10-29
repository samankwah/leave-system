import { idParam, route } from "@/server/api";
import { forbidden, notFound } from "@/server/errors";
import { getRequestAttachment } from "@/server/repos/leave";

/** Streams a supporting document (stored in Postgres) to the requester, their approver or HR. */
export const GET = route(null, async ({ db, user, params }) => {
  const a = await getRequestAttachment(db, idParam(params));
  if (!a?.attachment_data) throw notFound("Attachment");
  if (a.employee_id !== user.id && a.approver_id !== user.id && user.role !== "hr") throw forbidden();
  return new Response(new Uint8Array(a.attachment_data), {
    headers: {
      "Content-Type": a.attachment_type ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${(a.attachment_name ?? "attachment").replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
