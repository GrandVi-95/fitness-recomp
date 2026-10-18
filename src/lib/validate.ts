// ─── Tiny runtime validators for request bodies & AI output ────────────────
// Each returns the validated value or throws ValidationError; route handlers
// catch it and answer 400/422 BEFORE writing anything.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

/** Finite number within [min, max]. */
export function num(v: unknown, field: string, min: number, max: number): number {
  if (!isFiniteNumber(v) || v < min || v > max) {
    throw new ValidationError(`${field}: expected a number between ${min} and ${max}`)
  }
  return v
}

/** Like num() but undefined/null pass through as undefined. */
export function optNum(v: unknown, field: string, min: number, max: number): number | undefined {
  if (v === undefined || v === null) return undefined
  return num(v, field, min, max)
}

/** Integer within [min, max]. */
export function int(v: unknown, field: string, min: number, max: number): number {
  const n = num(v, field, min, max)
  if (!Number.isInteger(n)) throw new ValidationError(`${field}: expected an integer`)
  return n
}

export function optInt(v: unknown, field: string, min: number, max: number): number | undefined {
  if (v === undefined || v === null) return undefined
  return int(v, field, min, max)
}

export function str(v: unknown, field: string, maxLen: number, minLen = 0): string {
  if (typeof v !== "string" || v.length < minLen || v.length > maxLen) {
    throw new ValidationError(`${field}: expected a string of ${minLen}–${maxLen} chars`)
  }
  return v
}

export function optStr(v: unknown, field: string, maxLen: number): string | undefined {
  if (v === undefined || v === null) return undefined
  return str(v, field, maxLen)
}

export function bool(v: unknown, field: string): boolean {
  if (typeof v !== "boolean") throw new ValidationError(`${field}: expected true/false`)
  return v
}

export function optBool(v: unknown, field: string): boolean | undefined {
  if (v === undefined || v === null) return undefined
  return bool(v, field)
}

export function oneOf<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    throw new ValidationError(`${field}: expected one of ${allowed.join(", ")}`)
  }
  return v as T
}

export function optOneOf<T extends string>(v: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (v === undefined || v === null) return undefined
  return oneOf(v, field, allowed)
}

/** Reads a JSON body, rejecting payloads above `maxBytes` before parsing. */
export async function readJsonBody<T = unknown>(request: Request, maxBytes: number): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (declared > maxBytes) throw new ValidationError(`body too large (max ${maxBytes} bytes)`)
  const text = await request.text()
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new ValidationError(`body too large (max ${maxBytes} bytes)`)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ValidationError("invalid JSON body")
  }
}

/**
 * Validates one AI-produced food item: finite, non-negative, plausible values.
 * Sub-nutrients that are missing come back as null ("unknown"), not 0.
 * Macro energy is checked against stated calories (Atwater 4/4/9). Only
 * macros that EXCEED the stated calories are rejected (impossible); calories
 * above the macro energy are allowed — alcohol (7 kcal/g) and sugar alcohols
 * legitimately add energy the 4/4/9 macros don't show (e.g. beer, wine).
 */
export interface ValidFoodItem {
  name: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number | null
  sugar: number | null
  saturatedFat: number | null
}

export function validateFoodItem(raw: unknown, index: number): ValidFoodItem {
  if (!raw || typeof raw !== "object") throw new ValidationError(`items[${index}]: not an object`)
  const r = raw as Record<string, unknown>
  const f = (k: string) => `items[${index}].${k}`
  const name = str(r.name, f("name"), 200, 1)
  const quantity = num(r.quantity, f("quantity"), 0.01, 5000)
  const unit = typeof r.unit === "string" && r.unit.length <= 20 ? r.unit : "g"
  const calories = num(r.calories, f("calories"), 0, 5000)
  const protein = num(r.protein, f("protein"), 0, 400)
  const carbs = num(r.carbs, f("carbs"), 0, 800)
  const fat = num(r.fat, f("fat"), 0, 400)
  const sub = (k: string, max: number, parent: number): number | null => {
    if (r[k] === undefined || r[k] === null) return null
    return Math.min(num(r[k], f(k), 0, max), parent)
  }
  const atwater = protein * 4 + carbs * 4 + fat * 9
  if (atwater - calories > Math.max(40, calories * 0.35)) {
    throw new ValidationError(`${f("calories")}: ${calories} kcal doesn't match macros (~${Math.round(atwater)} kcal)`)
  }
  return {
    name,
    quantity,
    unit,
    calories,
    protein,
    carbs,
    fat,
    // Fibre isn't capped at carbs: many labels list carbohydrate excluding fibre.
    fiber: sub("fiber", 200, Infinity),
    sugar: sub("sugar", 400, carbs),
    saturatedFat: sub("saturatedFat", 200, fat),
  }
}
