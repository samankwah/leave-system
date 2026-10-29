import "server-only";
import type { Role } from "@/domain/types";
import type { DB } from "./db";
import { ServiceError } from "./errors";
import { getDb } from "./instance";
import type { User } from "./repos/users";
import { getCurrentUser } from "./session";

interface HandlerCtx {
  user: User;
  db: DB;
  req: Request;
  params: Record<string, string>;
  body: () => Promise<Record<string, unknown>>;
}

/**
 * Wraps a Route Handler: authenticates the session, enforces roles on the server and
 * converts ServiceErrors (including rule violations with their warning messages) to JSON.
 */
export function route(roles: Role[] | null, handler: (ctx: HandlerCtx) => unknown | Promise<unknown>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      const user = await getCurrentUser();
      if (!user) return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
      if (roles && !roles.includes(user.role)) {
        return Response.json({ error: "You do not have permission to perform this action." }, { status: 403 });
      }
      const result = await handler({
        user,
        db: await getDb(),
        req,
        params: (await ctx.params) ?? {},
        body: async () => {
          try {
            return (await req.json()) as Record<string, unknown>;
          } catch {
            throw new ServiceError(400, "Invalid request body.");
          }
        },
      });
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof ServiceError) return Response.json({ error: e.message, issues: e.issues }, { status: e.status });
      console.error(e);
      return Response.json({ error: "An unexpected error occurred. Please try again." }, { status: 500 });
    }
  };
}

export const idParam = (params: Record<string, string>) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ServiceError(400, "Invalid id.");
  return id;
};
