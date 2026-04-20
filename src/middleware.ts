import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const COOKIE_NAME = "fitness_auth"
const SALT = "fitness-recomp-2024"

async function computeToken(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + SALT)
  const buf = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next()
  }

  const masterPassword = process.env.APP_MASTER_PASSWORD
  if (!masterPassword) {
    return NextResponse.next()
  }

  const authCookie = request.cookies.get(COOKIE_NAME)
  if (!authCookie?.value) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const expectedToken = await computeToken(masterPassword)
  if (authCookie.value !== expectedToken) {
    const response = NextResponse.redirect(new URL("/login", request.url))
    response.cookies.delete(COOKIE_NAME)
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
}
