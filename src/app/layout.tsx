import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

// Cupertino-esque redesign (v1.15.0) — a clean, neutral sans-serif stack
// (Inter, falling back to the OS system font) replaces Geist app-wide.
const inter = Inter({ subsets: ["latin"], variable: "--font-geist" })

export const metadata: Metadata = {
  title: "RecompOS",
  description:
    "AI-powered fitness & nutrition tracker for vegetarian body recomposition.",
}

export const viewport: Viewport = {
  themeColor: "#F9FAFB",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl" className={inter.variable} suppressHydrationWarning>
      <body className="bg-[#F9FAFB] text-gray-900 antialiased tracking-tight min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
