"use client"

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"

interface DayNutrition {
  label: string
  day: string
  calories: number
  protein: number
  hasData: boolean
}

interface Props {
  dailyNutrition: DayNutrition[]
  targetCalories: number
  targetProtein: number
}

const TOOLTIP_STYLE = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2e8f0",
}

export default function WeeklyCharts({ dailyNutrition, targetCalories, targetProtein }: Props) {
  return (
    <div className="space-y-5">
      {/* ── Calories ─────────────────────────────────────── */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs text-slate-400">קלוריות יומיות</p>
          <p className="text-[11px] text-orange-400/70">יעד: {targetCalories} קק&quot;ל</p>
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={dailyNutrition} barSize={22} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
              formatter={(val) => [`${Number(val)} קק"ל`, "קלוריות"]}
            />
            <ReferenceLine y={targetCalories} stroke="#f97316" strokeDasharray="4 3" strokeOpacity={0.5} />
            <Bar dataKey="calories" radius={[4, 4, 0, 0]}>
              {dailyNutrition.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    !entry.hasData
                      ? "#1e293b"
                      : entry.calories >= targetCalories * 0.9 && entry.calories <= targetCalories * 1.1
                      ? "#22c55e"
                      : "#f97316"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Protein ──────────────────────────────────────── */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs text-slate-400">חלבון יומי (גר&apos;)</p>
          <p className="text-[11px] text-violet-400/70">יעד: {targetProtein} גר&apos;</p>
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={dailyNutrition} barSize={22} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
              formatter={(val) => [`${Number(val)} גר'`, "חלבון"]}
            />
            <ReferenceLine y={targetProtein} stroke="#8b5cf6" strokeDasharray="4 3" strokeOpacity={0.5} />
            <Bar dataKey="protein" radius={[4, 4, 0, 0]}>
              {dailyNutrition.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    !entry.hasData
                      ? "#1e293b"
                      : entry.protein >= targetProtein
                      ? "#22c55e"
                      : "#8b5cf6"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
