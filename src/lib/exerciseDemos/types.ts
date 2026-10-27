// ─── Exercise demo pictograms — data model ────────────────────────────────────
// Each demo is a start → finish pair (or a single hold) of a simple figure
// rig. Poses are authored as joint ANGLES on fixed limb lengths so every
// figure keeps the same proportions; the renderer computes the joints.
//
// Coordinates: one panel is 160 × 180, y grows downward, floor at y = 170.
// Angles are absolute degrees in screen space: 0 = right, 90 = down,
// -90 = up, 180 = left. Side-view figures always face right.

export type Pt = [number, number]

export type Joint =
  | "head" | "neck" | "hip"
  | "shoulder0" | "shoulder1" | "elbow0" | "elbow1" | "wrist0" | "wrist1"
  | "knee0" | "knee1" | "ankle0" | "ankle1" | "toe0" | "toe1"

/** A fixed point, a joint, or a joint plus an [dx, dy] offset. */
export type P = Pt | Joint | [Joint, number, number]

// A limb is posed either by its two angles, or by a target point for the
// hand/ankle (`to`), solved with two-bone IK. `bend` picks which side the
// elbow/knee folds to: 1 = clockwise of the shoulder→target line, -1 = the
// other way. Unreachable targets straighten the limb towards them.

export interface ArmSpec {
  ua?: number         // upper arm angle (shoulder → elbow)
  fa?: number         // forearm angle (elbow → wrist)
  to?: Pt             // …or where the wrist should be
  bend?: 1 | -1
  far?: boolean       // the arm behind the body — drawn faded
}

export interface LegSpec {
  th?: number         // thigh angle (hip → knee)
  sh?: number         // shin angle (knee → ankle)
  to?: Pt             // …or where the ankle should be
  bend?: 1 | -1
  ft?: number         // foot angle (ankle → toe); side view defaults to 0
  thighScale?: number // foreshortening, e.g. 0.3 for a seated front view
  far?: boolean
}

/** machine = faded frame/seat, gear = solid bar/dumbbell/handle,
 *  cable = thin line, band = dashed resistance band, accent = solid orange
 *  (muscle highlight on a hand-drawn figure). */
export type Tone = "machine" | "gear" | "cable" | "band" | "accent"

export type Shape =
  | { k: "line"; pts: P[]; tone?: Tone; w?: number }
  | { k: "circle"; c: P; r: number; tone?: Tone }
  | { k: "rect"; c: P; w: number; h: number; tone?: Tone; rot?: number }

export interface Arrow { from: P; to: P; bend?: number }

/** A form cue: orange dot at `at`, leader line to a pill centred on `label`. */
export interface Cue { at: P; label: Pt; text: string }

export interface Pose {
  hip: Pt
  torso?: number      // hip → neck angle, default -90 (upright)
  view?: "side" | "front"
  arms: ArmSpec[]     // side: near first; front: figure's right (viewer's left) first
  legs: LegSpec[]
  props?: Shape[]     // drawn in this panel only (bar, dumbbell, cable…)
  figure?: false      // skip the rig, e.g. a top-down view drawn from props
  arrows?: Arrow[]
  cues?: Cue[]
}

export type Muscle =
  | "chest" | "lats" | "upperBack" | "abs" | "glutes"
  | "delts" | "rearDelts" | "biceps" | "triceps"
  | "quads" | "hamstrings" | "calves"

export interface ExerciseDemo {
  muscles: Muscle[]
  muscleLabel: string           // Hebrew, shown as the target tag
  scene?: Shape[]               // drawn in every panel (machine, bench…)
  poses: [Pose] | [Pose, Pose]  // one pose = isometric hold
}
