"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Lock, Eye, EyeOff } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!password.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "שגיאה בהתחברות")
        return
      }

      router.replace("/dashboard")
      router.refresh()
    } catch {
      setError("שגיאת רשת — אנא נסה שוב")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100">
            <Lock size={28} className="text-[#007AFF]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Recomp<span className="text-[#007AFF]">OS</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">הזן סיסמה להמשך</p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="סיסמה..."
              dir="ltr"
              className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-[#007AFF] pe-12"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 end-3 flex items-center px-2 text-gray-400 hover:text-gray-600 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <p className="text-sm text-[#FF3B30] text-center bg-red-50 rounded-xl py-2.5 px-4">
              {error}
            </p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !password.trim()}
            className="w-full bg-[#007AFF] hover:bg-[#007AFF]/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed rounded-full py-4 text-base font-bold text-white transition"
          >
            {loading ? (
              <span className="animate-spin inline-block">◌</span>
            ) : (
              "כניסה"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
