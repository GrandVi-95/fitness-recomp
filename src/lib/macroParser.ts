// ─── Parse macros out of pasted text (e.g. a ChatGPT meal plan) ────────────
// Pure, no AI call. Two formats:
//  1. Structured — one line per meal, which the user asks ChatGPT to append:
//       MACROS: name=אורז עם בשר צמחי, kcal=520, protein=38, carbs=55, fat=14, sugar=6, fiber=8, satfat=2
//     (several lines → several meals; field order doesn't matter)
//  2. Free text — "Protein: 35g", "חלבון: 35 גרם", "**Calories:** ~520 kcal",
//     "30–35 g" (→ midpoint). When a label appears several times (per-
//     ingredient breakdown + total), a line mentioning total/סה"כ wins, else
//     the LAST occurrence (ChatGPT puts the total at the end).

export interface ParsedMeal {
  name: string
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  sugar: number | null
  fiber: number | null
  saturatedFat: number | null
}

type Field = Exclude<keyof ParsedMeal, "name">

export const MACRO_PROMPT_LINE =
  "בסוף התשובה הוסף שורה אחת לכל ארוחה בפורמט הזה בדיוק: " +
  "MACROS: name=<שם הארוחה>, kcal=<קלוריות>, protein=<חלבון בגרם>, carbs=<פחמימות בגרם>, " +
  "fat=<שומן בגרם>, sugar=<סוכר בגרם>, fiber=<סיבים בגרם>, satfat=<שומן רווי בגרם>"

const STRUCTURED_KEYS: Record<string, Field> = {
  kcal: "calories", calories: "calories", cal: "calories",
  protein: "protein", p: "protein",
  carbs: "carbs", carb: "carbs", c: "carbs",
  fat: "fat", f: "fat",
  sugar: "sugar",
  fiber: "fiber", fibre: "fiber",
  satfat: "saturatedFat", saturatedfat: "saturatedFat", sat_fat: "saturatedFat",
}

// Order matters: saturated fat must be tried before plain fat.
const FREE_TEXT_LABELS: { field: Field; re: RegExp }[] = [
  { field: "saturatedFat", re: /(saturated\s*fat|sat\.?\s*fat|שומן\s*רווי)/i },
  { field: "calories",     re: /(calories|kcal|energy|קלוריות|קק["״']?ל|אנרגיה)/i },
  { field: "protein",      re: /(protein|חלבונים|חלבון)/i },
  { field: "carbs",        re: /(carbohydrates?|carbs?|פחמימות)/i },
  { field: "sugar",        re: /(sugars?|סוכרים|סוכר)/i },
  { field: "fiber",        re: /(fiber|fibre|סיבים(?:\s*תזונתיים)?)/i },
  { field: "fat",          re: /(fats?|שומנים|שומן)/i },
]

const NUM = String.raw`~?\s*(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?`

function toNum(a: string, b?: string): number {
  const x = parseFloat(a.replace(",", "."))
  if (!b) return x
  return (x + parseFloat(b.replace(",", "."))) / 2
}

function emptyMeal(name = ""): ParsedMeal {
  return { name, calories: null, protein: null, carbs: null, fat: null, sugar: null, fiber: null, saturatedFat: null }
}

function parseStructured(text: string): ParsedMeal[] {
  const meals: ParsedMeal[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = /MACROS\s*:?\s*(.+)$/i.exec(line.replace(/[*`]/g, ""))
    if (!m) continue
    const meal = emptyMeal()
    for (const part of m[1].split(/[,;|]/)) {
      const kv = /^\s*([A-Za-z_]+)\s*[=:]\s*(.+?)\s*$/.exec(part)
      if (!kv) continue
      const key = kv[1].toLowerCase()
      if (key === "name") {
        meal.name = kv[2].replace(/^["'<]|[">']$/g, "").trim().slice(0, 200)
        continue
      }
      const field = STRUCTURED_KEYS[key]
      const n = new RegExp(NUM).exec(kv[2])
      if (field && n) meal[field] = round1(toNum(n[1], n[2]))
    }
    if (meal.calories != null || meal.protein != null) meals.push(meal)
  }
  return meals
}

function parseFreeText(text: string): ParsedMeal | null {
  const meal = emptyMeal()
  const found: Partial<Record<Field, { value: number; isTotal: boolean }>> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[*`#>]/g, " ")
    const isTotal = /(total|סה["״']?כ|סך הכל|סיכום)/i.test(line)
    for (const { field, re } of FREE_TEXT_LABELS) {
      // label then number ("Protein: 35g") or number then label ("35g protein")
      // "after" allows only a separator (":", "=", "≈", or a table "|") or a
      // "(g)" unit note between label and number — so "480 calories, 32g
      // protein" isn't misread as calories=32.
      const after = new RegExp(re.source + String.raw`\s*(?:\([^)\d]*\))?\s*[:=≈|]?\s*` + NUM, "i").exec(line)
      const before = new RegExp(NUM + String.raw`\s*(?:g|gr|גרם|ג['׳]|kcal|קק["״']?ל)?\s*` + re.source, "i").exec(line)
      const m = after ?? before
      if (!m) continue
      const value = after ? toNum(after[2], after[3]) : toNum(before![1], before![2])
      const prev = found[field]
      if (!prev || isTotal || !prev.isTotal) found[field] = { value: round1(value), isTotal }
      // A line naming saturated fat must not also be read as plain fat.
      if (field === "saturatedFat") break
    }
  }
  for (const [k, v] of Object.entries(found)) meal[k as Field] = v!.value
  if (meal.calories == null && meal.protein == null) return null
  // Name: a short line with no digits and no nutrient/total label, preferring
  // a bold/heading line (ChatGPT's title, e.g. "**Rice with veggie meat**")
  // over plain lines; intro sentences ending in ":" are skipped.
  const candidates: { name: string; emphasized: boolean }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (trimmed.endsWith(":")) continue
    const line = trimmed.replace(/[*`#>_|:-]/g, " ").replace(/\s+/g, " ").trim()
    if (!line || line.length > 60 || /\d/.test(line)) continue
    if (/(total|סה["״']?כ|סך הכל|סיכום|nutrient|ערכים|macros?)/i.test(line)) continue
    if (FREE_TEXT_LABELS.some(({ re }) => re.test(line))) continue
    candidates.push({ name: line, emphasized: /^(#{1,6}\s|\*\*|__)/.test(trimmed) })
  }
  meal.name = (candidates.find((c) => c.emphasized) ?? candidates[0])?.name ?? ""
  return meal
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Parses pasted text into one or more meals (empty array when nothing found). */
export function parseMacrosText(text: string): ParsedMeal[] {
  const structured = parseStructured(text)
  if (structured.length > 0) return structured
  const free = parseFreeText(text)
  return free ? [free] : []
}

/**
 * Atwater sanity check: protein×4 + carbs×4 + fat×9 vs stated calories.
 * Returns the macro-derived kcal when it's off by more than ~15% (and 40
 * kcal), else null. A warning only — alcohol/sugar alcohols add energy.
 */
export function atwaterMismatch(m: Pick<ParsedMeal, "calories" | "protein" | "carbs" | "fat">): number | null {
  if (m.calories == null || m.protein == null || m.carbs == null || m.fat == null) return null
  const kcal = m.protein * 4 + m.carbs * 4 + m.fat * 9
  return Math.abs(kcal - m.calories) > Math.max(40, m.calories * 0.15) ? Math.round(kcal) : null
}
