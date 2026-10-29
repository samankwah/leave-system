import { route } from "@/server/api";
import { readRequestForm } from "@/server/requestForm";
import { submitRequest } from "@/server/services/requestService";

export const POST = route(null, async ({ db, user, req }) => {
  const { input, attachment } = await readRequestForm(req);
  return submitRequest(db, user, input, attachment);
});
