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
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  fontSize: 12,
  color: "#111827",
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
}

export default function WeeklyCharts({ dailyNutrition, targetCalories, targetProtein }: Props) {
  return (
    <div className="space-y-5">
      {/* ── Calories ─────────────────────────────────────── */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs text-gray-500">קלוריות יומיות</p>
          <p className="text-[11px] text-[#FF9500]/70">יעד: {targetCalories} קק&quot;ל</p>
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={dailyNutrition} barSize={22} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              formatter={(val) => [`${Number(val)} קק"ל`, "קלוריות"]}
            />
            <ReferenceLine y={targetCalories} stroke="#FF9500" strokeDasharray="4 3" strokeOpacity={0.5} />
            <Bar dataKey="calories" radius={[4, 4, 0, 0]}>
              {dailyNutrition.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    !entry.hasData
                      ? "#F3F4F6"
                      : entry.calories >= targetCalories * 0.9 && entry.calories <= targetCalories * 1.1
                      ? "#34C759"
                      : "#FF9500"
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
          <p className="text-xs text-gray-500">חלבון יומי (גר&apos;)</p>
          <p className="text-[11px] text-[#007AFF]/70">יעד: {targetProtein} גר&apos;</p>
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={dailyNutrition} barSize={22} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              formatter={(val) => [`${Number(val)} גר'`, "חלבון"]}
            />
            <ReferenceLine y={targetProtein} stroke="#007AFF" strokeDasharray="4 3" strokeOpacity={0.5} />
            <Bar dataKey="protein" radius={[4, 4, 0, 0]}>
              {dailyNutrition.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    !entry.hasData
                      ? "#F3F4F6"
                      : entry.protein >= targetProtein
                      ? "#34C759"
                      : "#007AFF"
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
