import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })

export const metadata: Metadata = {
  title: "RecompOS",
  description:
    "AI-powered fitness & nutrition tracker for vegetarian body recomposition.",
}

export const viewport: Viewport = {
  themeColor: "#0f172a",
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
    <html lang="he" dir="rtl" className={geist.variable} suppressHydrationWarning>
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
