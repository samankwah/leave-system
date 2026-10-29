import { cookies } from "next/headers";
import { logout, SESSION_COOKIE } from "@/server/auth";
import { getDb } from "@/server/instance";

export async function POST() {
  const jar = await cookies();
  await logout(await getDb(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
