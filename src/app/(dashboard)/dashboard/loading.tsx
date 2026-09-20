// Automatic Suspense fallback for the Dashboard route segment — Next.js
// wraps `dashboard/page.tsx` in `<Suspense fallback={<DashboardLoading />}>`
// simply because this file exists here, so clicking "בית" navigates
// instantly and paints this skeleton while the Server Component's
// Promise.all (today's nutrition, latest metric, active plan, week
// streak, ...) is still resolving — instead of the whole tab bar feeling
// unresponsive until the server finishes.

const SKELETON = "animate-pulse bg-gray-200 rounded-3xl"

export default function DashboardLoading() {
  return (
    <div className="min-h-full bg-[#F9FAFB] px-6 py-9 space-y-6 max-w-lg mx-auto">
      {/* ברכה */}
      <div className="space-y-3">
        <div className={`${SKELETON} h-9 w-2/3`} />
        <div className={`${SKELETON} h-4 w-4/5`} />
      </div>

      {/* כרטיס תזונת היום */}
      <div className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className={`${SKELETON} h-4 w-24`} />
            <div className={`${SKELETON} h-3 w-36`} />
          </div>
          <div className={`${SKELETON} h-3 w-16 rounded-full`} />
        </div>

        <div className="space-y-2">
          <div className={`${SKELETON} h-3 w-full`} />
          <div className={`${SKELETON} h-1.5 w-full rounded-full`} />
        </div>

        <div className="flex justify-around pt-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${SKELETON} w-16 h-16 rounded-full`} />
          ))}
        </div>
      </div>

      {/* רשת סטטיסטיקות */}
      <div className="grid grid-cols-2 gap-3.5">
        <div className={`${SKELETON} h-[76px]`} />
        <div className={`${SKELETON} h-[76px]`} />
      </div>

      {/* מדד התמדה שבועי */}
      <div className="bg-white rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
        <div className={`${SKELETON} h-4 w-40`} />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={`${SKELETON} h-16 rounded-2xl`} />
          ))}
        </div>
      </div>
    </div>
  )
}
