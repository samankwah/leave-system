import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/domain/types";
import { SESSION_COOKIE, userForToken } from "./auth";
import { getDb } from "./instance";
import type { User } from "./repos/users";

/**
 * The signed-in user, resolved once per request: the layout and the page share the result
 * (React `cache` is request-scoped), and the lookup itself is a single joined query.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userForToken(await getDb(), token);
});

/** For server pages: redirects to login when signed out and to the dashboard when the role is not allowed. */
export async function requireUser(roles?: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}
