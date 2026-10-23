// ─── Known products: exact saved values mixed into AI-estimated meals ──────
// "Known" = something the user already saved with real label values: a
// scanned product / recipe (Recipe — whole-package or whole-batch totals) or
// a protein powder (SavedProtein — per scoop). A chip is one portion of such
// a product; it's logged with its exact values, and only the rest of the meal
// is left to the AI. Pure — safe in client and server code.

export interface SavedProduct {
  key:          string            // "recipe:<id>" | "powder:<id>"
  kind:         "recipe" | "powder"
  name:         string
  // Totals of ONE base unit: the whole package/batch (recipe) or one scoop (powder)
  calories:     number
  protein:      number
  carbs:        number
  fat:          number
  sugar:        number | null
  // Recipe-only portioning hints
  packageGrams: number | null     // from "אריזה N גרם" when it came from a label scan
  servingPct:   number            // one serving / unit as % of the package (default 25)
}

export type PortionMode = "servings" | "grams" | "percent" | "scoops"

export interface KnownChip {
  productKey: string
  name:       string
  amount:     number
  mode:       PortionMode
  label:      string              // human-readable amount, e.g. "1 יח'", "150 גר'"
  calories:   number
  protein:    number
  carbs:      number
  fat:        number
  sugar:      number | null
}

interface RecipeRow {
  id: string
  name: string
  ingredients: string
  totalCalories: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
  totalSugar: number | null
  defaultServingPct: number
}

interface PowderRow {
  id: string
  name: string
  caloriesPerScoop: number
  proteinPerScoop: number
  carbsPerScoop: number
  fatPerScoop: number
  sugarPerScoop?: number | null
}

export function fromRecipe(r: RecipeRow): SavedProduct {
  const pkg = /אריזה\s+(\d+(?:\.\d+)?)\s*גרם/.exec(r.ingredients ?? "")
  return {
    key: `recipe:${r.id}`,
    kind: "recipe",
    name: r.name,
    calories: r.totalCalories,
    protein: r.totalProtein,
    carbs: r.totalCarbs,
    fat: r.totalFat,
    sugar: r.totalSugar,
    packageGrams: pkg ? parseFloat(pkg[1]) : null,
    servingPct: r.defaultServingPct > 0 ? r.defaultServingPct : 25,
  }
}

export function fromPowder(p: PowderRow): SavedProduct {
  return {
    key: `powder:${p.id}`,
    kind: "powder",
    name: p.name,
    calories: p.caloriesPerScoop,
    protein: p.proteinPerScoop,
    carbs: p.carbsPerScoop,
    fat: p.fatPerScoop,
    sugar: p.sugarPerScoop ?? null,
    packageGrams: null,
    servingPct: 100,
  }
}

/** Portion modes that make sense for a product, default first. */
export function portionModes(p: SavedProduct): PortionMode[] {
  if (p.kind === "powder") return ["scoops"]
  return p.packageGrams ? ["servings", "grams", "percent"] : ["servings", "percent"]
}

/** Fraction of the product's base unit (package/batch or scoop) eaten. */
export function portionFraction(p: SavedProduct, amount: number, mode: PortionMode): number {
  switch (mode) {
    case "scoops":   return amount
    case "servings": return (amount * p.servingPct) / 100
    case "percent":  return amount / 100
    case "grams":    return p.packageGrams ? amount / p.packageGrams : 0
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function makeChip(p: SavedProduct, amount: number, mode: PortionMode): KnownChip {
  const f = portionFraction(p, amount, mode)
  const unit = { scoops: "סקופ", servings: "מנה", percent: "%", grams: "גר'" }[mode]
  return {
    productKey: p.key,
    name: p.name,
    amount,
    mode,
    label: mode === "percent" ? `${amount}%` : `${amount} ${unit}`,
    calories: Math.round(p.calories * f),
    protein: r1(p.protein * f),
    carbs: r1(p.carbs * f),
    fat: r1(p.fat * f),
    sugar: p.sugar == null ? null : r1(p.sugar * f),
  }
}

// ── Name matching (for "use your saved X?" suggestions) ─────────────────────

// Words too generic to identify a product on their own.
const STOP = new Set([
  "של", "עם", "בלי", "גרם", "גר", "יח", "מנה", "כוס", "כף", "כפית", "קטן", "גדול",
  "the", "and", "with", "of", "cup", "gram", "grams", "piece", "pieces",
])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    // Strip common Hebrew one-letter prefixes (ו/ה/ב/ל/מ/ש/כ) from longer words.
    .map((w) => (w.length > 3 && /^[והבלמשכ]/.test(w) ? w.slice(1) : w))
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d/.test(w))
}

/**
 * Saved products whose name shares a meaningful word with `text`, best first.
 * `exclude` = product keys already chosen as chips.
 */
export function suggestProducts(text: string, products: SavedProduct[], exclude: Set<string> = new Set(), max = 3): SavedProduct[] {
  const words = new Set(tokens(text))
  if (words.size === 0) return []
  const scored = products
    .filter((p) => !exclude.has(p.key))
    .map((p) => {
      const pt = tokens(p.name)
      const hits = pt.filter((t) => [...words].some((w) => w === t || (w.length >= 4 && (t.startsWith(w) || w.startsWith(t)))))
      return { p, score: hits.length }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, max).map((x) => x.p)
}

/**
 * Removes the words of a product's name from free text (after the user swaps
 * "יוגורט" for their saved yogurt chip), cleaning up leftover separators.
 */
export function stripProductWords(text: string, product: SavedProduct): string {
  const pt = new Set(tokens(product.name))
  // Split on separators but keep a Hebrew "ו" (and) attached to its word, so
  // "ויוגורט" is removed whole rather than leaving a stray "ו".
  return text
    .split(/(,|\n| עם | (?=ו\S)| and | with )/)
    .filter((part) => {
      const ws = tokens(part)
      return !(ws.length > 0 && ws.every((w) => [...pt].some((t) => w === t || (w.length >= 4 && (t.startsWith(w) || w.startsWith(t))))))
    })
    .join("")
    .replace(/(\s*,\s*){2,}/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim()
    // Drop a dangling connector left at either end ("…, עם", "and …")
    .replace(/^(,|עם|and|with)\s+|\s+(,|עם|and|with)$/g, "")
    .replace(/^,|,$/g, "")
    .trim()
}
