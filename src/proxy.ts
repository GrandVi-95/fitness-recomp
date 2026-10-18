import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { AUTH_COOKIE_NAME, getMasterPassword, isValidCronRequest, verifySessionToken } from "@/lib/auth"

function unauthorized(request: NextRequest, message: string, status = 401) {
  // API callers get JSON, page navigations get the login screen.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status })
  }
  return NextResponse.redirect(new URL("/login", request.url))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next()
  }

  // Vercel Cron authenticates with a bearer secret, not the browser cookie.
  if (pathname.startsWith("/api/cron/") && isValidCronRequest(request)) {
    return NextResponse.next()
  }

  // Fail closed: without a configured password nobody is authenticated.
  if (!getMasterPassword()) {
    return unauthorized(request, "האימות לא הוגדר בשרת (APP_MASTER_PASSWORD)", 503)
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value
  if (!(await verifySessionToken(token))) {
    const response = unauthorized(request, "נדרשת התחברות")
    if (token) response.cookies.delete(AUTH_COOKIE_NAME)
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
}
