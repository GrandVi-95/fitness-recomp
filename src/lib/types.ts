// ─────────────────────────────────────────────────────────────
// Core domain types for the Fitness & Nutrition Tracking App
// Body Recomposition — vegetarian diet, +5 kg muscle target
// ─────────────────────────────────────────────────────────────

// ── User ─────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  name: string
  targetCalories: number     // kcal/day
  targetProtein: number      // g/day
  targetWeight: number | null
  muscleMassGoal: number     // +5 kg
  startWeight: number | null
  startMuscleMass: number | null
  splitType: SplitType
  restSeconds: number
  createdAt: Date
  settings?: UserSettingsData
}

export interface UserSettingsData {
  darkMode: boolean
  proteinAlertEnabled: boolean
  proteinAlertTime: string    // "HH:MM"
  deloadThreshold: number     // consecutive stalled weeks
  fatiguePacingEnabled: boolean
}

// ── Workouts ──────────────────────────────────────────────────

export type SplitType = "PPL" | "AB" | "FULL_BODY" | "CUSTOM"

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "legs"
  | "core"
  | "glutes"
  | "hamstrings"
  | "quads"
  | "calves"

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "kettlebell"
  | "resistance_band"

export interface Exercise {
  id: string
  name: string
  primaryMuscle: MuscleGroup
  secondaryMuscles: MuscleGroup[]
  equipment: Equipment
  instructions?: string
  isCompound: boolean
}

export interface WorkoutPlan {
  id: string
  userId: string
  name: string
  splitType: SplitType
  isActive: boolean
  createdAt: Date
  workouts: Workout[]
}

export interface Workout {
  id: string
  planId: string
  name: string
  dayLabel: string           // "Push" | "Pull" | "Legs" | "A" | "B"
  order: number
  muscleGroups: MuscleGroup[]
  exercises: WorkoutExercise[]
}

export interface WorkoutExercise {
  id: string
  workoutId: string
  exerciseId: string
  order: number
  targetSets: number
  targetReps: string         // "8-12" | "5" | "AMRAP"
  restSeconds: number
  notes?: string
  // Exercises sharing the same superSetId within a workout are performed
  // back-to-back with no rest between them; sets/reps/weight stay independent.
  superSetId?: string
  exercise: Exercise
  // Injected at runtime from previous session
  previousBest?: PreviousPerformance
}

export interface PreviousPerformance {
  sessionDate: Date
  sets: Array<{ reps: number; weightKg: number; rpe?: number }>
  topSetWeightKg: number
  totalVolume: number        // kg × reps summed across all working sets
}

// ── Session Logging ───────────────────────────────────────────

export type SessionStatus = "idle" | "active" | "resting" | "completed"

export interface WorkoutSession {
  id: string
  userId: string
  workoutId: string
  startedAt: Date
  completedAt?: Date
  durationMins?: number
  fatigueLevel?: number      // 1–5
  sleepHours?: number
  notes?: string
  sets: SetLog[]
}

export interface SetLog {
  id: string
  sessionId: string
  exerciseId: string
  setNumber: number
  reps: number
  weightKg: number
  rpe?: number               // 1–10
  isWarmup: boolean
  loggedAt: Date
}

/** In-memory state for the Live Gym Mode */
export interface LiveGymState {
  session: WorkoutSession
  workout: Workout
  currentExerciseIndex: number
  currentSetNumber: number
  status: SessionStatus
  restSecondsRemaining: number
  completedSets: SetLog[]
}

// ── Nutrition ─────────────────────────────────────────────────

export type MealType =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "pre_workout"
  | "post_workout"

export type FoodCategory =
  | "legumes"
  | "dairy"
  | "egg"
  | "protein_supplement"
  | "grain"
  | "vegetable"
  | "nuts_seeds"

export interface Food {
  id: string
  name: string
  category: FoodCategory
  isVegetarian: boolean
  caloriesPer100: number
  proteinPer100: number
  carbsPer100: number
  fatPer100: number
  fiberPer100: number
  aliases: string[]
}

export interface NutritionLog {
  id: string
  userId: string
  date: Date
  mealType: MealType
  rawInput?: string          // original NLP text
  notes?: string
  foodItems: NutritionFoodItem[]
  // Derived totals (computed from items)
  totals: MacroTotals
}

export interface NutritionFoodItem {
  id: string
  logId: string
  foodId?: string
  name: string
  quantity: number
  unit: string               // g | ml | piece | scoop | cup
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

export interface MacroTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

/** Aggregated daily nutrition summary */
export interface DailyNutritionSummary {
  date: string               // "YYYY-MM-DD"
  totals: MacroTotals
  targetCalories: number
  targetProtein: number
  meals: NutritionLog[]
  proteinPacingAlert: boolean  // true if behind by afternoon
}

/** Result from AI NLP parsing */
export interface ParsedFoodInput {
  rawText: string
  items: Array<{
    name: string
    quantity: number
    unit: string
    matchedFoodId?: string
    confidence: number       // 0–1
    macros: MacroTotals
  }>
  totalMacros: MacroTotals
}

// ── Body Metrics ──────────────────────────────────────────────

export interface BodyMetric {
  id: string
  userId: string
  date: Date
  weightKg: number
  bodyFatPct?: number
  muscleMassKg?: number      // derived from weight & body fat
  notes?: string
}

export interface ProgressPhoto {
  id: string
  userId: string
  date: Date
  url: string
  angle: "front" | "back" | "side_left" | "side_right"
  notes?: string
}

/** 7-day rolling average (smooths daily weight fluctuations) */
export interface WeeklyWeightAverage {
  weekStart: string          // "YYYY-MM-DD"
  averageWeight: number
  minWeight: number
  maxWeight: number
  dataPointCount: number
}

export interface RecompProgress {
  startDate: Date
  currentDate: Date
  startWeight: number
  currentWeight: number
  estimatedMuscleMassGain: number  // kg
  estimatedFatLoss: number         // kg
  progressTowardsGoal: number      // 0–100 %
  weeklyAverages: WeeklyWeightAverage[]
}

// ── Recovery & AI Insights ────────────────────────────────────

export interface MuscleVolumeWeekly {
  muscleGroup: MuscleGroup
  totalSets: number          // working sets this week
  totalReps: number
  totalVolumeKg: number      // weight × reps
  weekStart: string          // "YYYY-MM-DD"
}

export type RecoveryAlertType =
  | "deload_recommended"
  | "progress_stall"
  | "high_fatigue"
  | "poor_sleep"
  | "protein_behind"
  | "milestone_reached"

export interface RecoveryAlert {
  type: RecoveryAlertType
  severity: "info" | "warning" | "critical"
  title: string
  message: string
  actionLabel?: string
  createdAt: Date
}

// ── Dashboard ─────────────────────────────────────────────────

export interface DashboardData {
  user: UserProfile
  today: DailyNutritionSummary
  nextWorkout: Workout | null
  lastSession: WorkoutSession | null
  latestMetric: BodyMetric | null
  alerts: RecoveryAlert[]
  weeklyMuscleVolume: MuscleVolumeWeekly[]
}

// ── API Responses ─────────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}
