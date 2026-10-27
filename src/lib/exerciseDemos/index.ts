import { GYM_DEMOS } from "./gym"
import { HOME_DEMOS } from "./home"
import type { ExerciseDemo } from "./types"

export type { ExerciseDemo } from "./types"

const DEMOS: Record<string, ExerciseDemo> = { ...GYM_DEMOS, ...HOME_DEMOS }

/** Demo pictogram for an exercise, or null for custom exercises without one. */
export function getExerciseDemo(name: string): ExerciseDemo | null {
  return DEMOS[name.trim()] ?? null
}

export const DEMO_NAMES = Object.keys(DEMOS)
