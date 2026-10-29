import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/constants";
const PUBLIC = ["/login", "/api/auth/login"];

/**
 * Coarse gate only: bounces requests without a session cookie to the login page.
 * The session itself and every role check are verified on the server in pages and Route Handlers.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (req.cookies.get(SESSION_COOKIE)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
