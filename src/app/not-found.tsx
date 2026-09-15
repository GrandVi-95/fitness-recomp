import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F9FAFB] text-gray-900 flex flex-col items-center justify-center px-6 text-center" dir="rtl">
      <p className="text-7xl font-black text-[#007AFF] mb-2">404</p>
      <h1 className="text-2xl font-bold mb-2">עמוד לא נמצא</h1>
      <p className="text-gray-500 text-sm mb-8 max-w-xs">
        הדף שחיפשת אינו קיים, אולי הכתובת שגויה.
      </p>
      <Link
        href="/dashboard"
        className="bg-[#007AFF] hover:bg-[#007AFF]/90 active:scale-95 rounded-full px-6 py-3 text-sm font-semibold text-white transition"
      >
        חזרה לדשבורד
      </Link>
    </div>
  )
}
