import { NextRequest, NextResponse } from "next/server"
import {
  AUTH_COOKIE_NAME,
  SESSION_TTL_MS,
  clearLoginFailures,
  clientKeyFromRequest,
  createSessionToken,
  getMasterPassword,
  loginRetryAfterSecs,
  recordLoginFailure,
  safeEqual,
} from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const masterPassword = getMasterPassword()
    if (!masterPassword) {
      return NextResponse.json({ error: "שגיאת שרת — הסיסמה לא הוגדרה" }, { status: 500 })
    }

    const clientKey = clientKeyFromRequest(request)
    const retryAfter = loginRetryAfterSecs(clientKey)
    if (retryAfter > 0) {
      return NextResponse.json(
        { error: `יותר מדי ניסיונות — נסה שוב בעוד ${Math.ceil(retryAfter / 60)} דקות` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      )
    }

    const { password } = await request.json()
    if (typeof password !== "string" || !safeEqual(password, masterPassword)) {
      recordLoginFailure(clientKey)
      return NextResponse.json({ error: "סיסמה שגויה" }, { status: 401 })
    }

    clearLoginFailures(clientKey)
    const token = await createSessionToken()
    if (!token) {
      return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_TTL_MS / 1000,
      path: "/",
    })
    return response
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 })
  }
}
