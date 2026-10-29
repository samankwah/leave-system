import { cookies } from "next/headers";
import { login, SESSION_COOKIE, SESSION_HOURS } from "@/server/auth";
import { ServiceError } from "@/server/errors";
import { getDb } from "@/server/instance";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { login?: string; password?: string };
    const { token, user } = login(getDb(), body.login ?? "", body.password ?? "", req.headers.get("user-agent") ?? "");
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_HOURS * 3600,
    });
    return Response.json({ ok: true, role: user.role });
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: "Sign-in failed due to a server error." }, { status: 500 });
  }
}
