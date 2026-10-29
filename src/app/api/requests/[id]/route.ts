import { idParam, route } from "@/server/api";
import { readRequestForm } from "@/server/requestForm";
import { resubmitRequest } from "@/server/services/requestService";

/** Edit and resubmit a request that was returned for revision. */
export const PUT = route(null, async ({ db, user, req, params }) => {
  const { input, attachment } = await readRequestForm(req);
  return resubmitRequest(db, user, idParam(params), input, attachment);
});
