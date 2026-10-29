import fs from "node:fs";
import path from "node:path";
import { idParam, route } from "@/server/api";
import { forbidden, notFound } from "@/server/errors";
import { getRequestAttachment } from "@/server/repos/leave";
import { uploadsDir } from "@/server/services/requestService";

const TYPES: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg" };

export const GET = route(null, ({ db, user, params }) => {
  const a = getRequestAttachment(db, idParam(params));
  if (!a?.attachment_path) throw notFound("Attachment");
  if (a.employee_id !== user.id && a.approver_id !== user.id && user.role !== "hr") throw forbidden();
  const file = path.join(uploadsDir(), path.basename(a.attachment_path));
  if (!fs.existsSync(file)) throw notFound("Attachment");
  return new Response(fs.readFileSync(file), {
    headers: {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${(a.attachment_name ?? "attachment").replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});
