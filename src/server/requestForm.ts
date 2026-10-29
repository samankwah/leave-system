import "server-only";
import { ServiceError } from "./errors";
import type { Attachment, RequestInput } from "./services/requestService";

/** Parses a leave request from multipart form data (with optional supporting document) or JSON. */
export async function readRequestForm(req: Request): Promise<{ input: RequestInput; attachment?: Attachment }> {
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const fd = await req.formData();
    const file = fd.get("attachment");
    const attachment = file instanceof File && file.size > 0
      ? { name: file.name, type: file.type, data: Buffer.from(await file.arrayBuffer()) }
      : undefined;
    return {
      input: {
        leaveType: String(fd.get("leaveType") ?? ""), start: String(fd.get("start") ?? ""),
        end: String(fd.get("end") ?? ""), reason: String(fd.get("reason") ?? ""),
      },
      attachment,
    };
  }
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) throw new ServiceError(400, "Invalid request body.");
  return { input: { leaveType: String(b.leaveType ?? ""), start: String(b.start ?? ""), end: String(b.end ?? ""), reason: String(b.reason ?? "") } };
}
