// ─── Super-Set grouping ────────────────────────────────────────────────────
// Shared view-model helper: turns a flat, order-sorted exercise list into a
// list of WorkoutItems, where each item is either a single exercise or a
// super-set pair (two adjacent exercises sharing the same superSetId,
// performed back-to-back). The underlying storage stays flat (superSetId on
// each WorkoutExercise/SessionExercise row) — grouping is purely a runtime
// view transform, so historical SetLog data (keyed by exerciseId only) is
// completely unaffected and every exercise keeps independent tracking.

export interface SuperSettable {
  superSetId?: string | null
}

export type WorkoutItem<T> =
  | { type: "single"; exercise: T }
  | { type: "superset"; exercises: [T, T]; superSetId: string }

/** Groups an order-sorted list into singles and adjacent super-set pairs. */
export function groupIntoItems<T extends SuperSettable>(list: T[]): WorkoutItem<T>[] {
  const items: WorkoutItem<T>[] = []
  let i = 0
  while (i < list.length) {
    const ex = list[i]
    const next = list[i + 1]
    if (ex.superSetId && next?.superSetId === ex.superSetId) {
      items.push({ type: "superset", exercises: [ex, next], superSetId: ex.superSetId })
      i += 2
    } else {
      items.push({ type: "single", exercise: ex })
      i += 1
    }
  }
  return items
}

/** Flat-array index at which each item begins — needed to map an item back
 *  onto positional operations (store indices, reorder targets, etc). */
export function itemStartIndices<T extends SuperSettable>(list: T[]): number[] {
  const items = groupIntoItems(list)
  const starts: number[] = []
  let idx = 0
  for (const item of items) {
    starts.push(idx)
    idx += item.type === "superset" ? 2 : 1
  }
  return starts
}

/** Flattens WorkoutItems back into a flat, order-preserving list. */
export function flattenItems<T>(items: WorkoutItem<T>[]): T[] {
  return items.flatMap((it) => (it.type === "superset" ? it.exercises : [it.exercise]))
}
