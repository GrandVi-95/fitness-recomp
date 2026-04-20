import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"

const COOKIE_NAME = "fitness_auth"
const SALT = "fitness-recomp-2024"
const MAX_AGE = 30 * 24 * 60 * 60 // 30 days

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    const masterPassword = process.env.APP_MASTER_PASSWORD
    if (!masterPassword) {
      return NextResponse.json({ error: "שגיאת שרת — הסיסמה לא הוגדרה" }, { status: 500 })
    }

    if (!password || password !== masterPassword) {
      // Constant-time delay to slow brute force
      await new Promise((r) => setTimeout(r, 400))
      return NextResponse.json({ error: "סיסמה שגויה" }, { status: 401 })
    }

    const token = createHash("sha256")
      .update(masterPassword + SALT)
      .digest("hex")

    const response = NextResponse.json({ ok: true })
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: MAX_AGE,
      path: "/",
    })
    return response
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 })
  }
}
