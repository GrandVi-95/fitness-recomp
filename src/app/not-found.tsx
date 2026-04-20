import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-6 text-center" dir="rtl">
      <p className="text-7xl font-black text-indigo-500 mb-2">404</p>
      <h1 className="text-2xl font-bold mb-2">עמוד לא נמצא</h1>
      <p className="text-slate-400 text-sm mb-8 max-w-xs">
        הדף שחיפשת אינו קיים, אולי הכתובת שגויה.
      </p>
      <Link
        href="/dashboard"
        className="bg-indigo-600 hover:bg-indigo-500 rounded-xl px-6 py-3 text-sm font-semibold transition-colors"
      >
        חזרה לדשבורד
      </Link>
    </div>
  )
}
