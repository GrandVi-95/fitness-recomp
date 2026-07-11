// ─── Home workout templates ───────────────────────────────────────────────────
// Every home exercise is a NEW Exercise row (unique Hebrew name), never a reuse
// of a gym exercise — set history is keyed by exerciseId, so this guarantees
// home logging can never overwrite or blend with gym weight/reps history.
// (הרמת ברכיים בתלייה exists in the gym plan too, but gets its own home row
// for the same reason.)

export interface HomeExerciseTemplate {
  name:          string
  primaryMuscle: string
  equipment:     string   // bodyweight | household (weighted bag, water bottles, table)
  trackingType:  "weight_reps" | "reps_only" | "duration"
  isCompound:    boolean
  targetSets:    number
  targetReps:    string   // reps, or seconds range for duration exercises
  restSeconds:   number
}

export interface HomeWorkoutTemplate {
  dayLabel:     string
  name:         string
  muscleGroups: string[]
  exercises:    HomeExerciseTemplate[]
}

export const HOME_WORKOUTS: HomeWorkoutTemplate[] = [
  {
    dayLabel: "A-Home",
    name: "אימון ביתי A",
    muscleGroups: ["chest", "legs", "back", "biceps", "core"],
    exercises: [
      { name: "שכיבות סמיכה קלאסיות",          primaryMuscle: "chest",      equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 4, targetReps: "10-20", restSeconds: 90 },
      { name: "ישיבת קיר (Wall Sit)",           primaryMuscle: "legs",       equipment: "bodyweight", trackingType: "duration",    isCompound: true,  targetSets: 3, targetReps: "30-60", restSeconds: 60 },
      { name: "מתח באחיזה הפוכה (Chin-ups)",    primaryMuscle: "back",       equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 4, targetReps: "5-10",  restSeconds: 120 },
      { name: "כפיפת מרפקים עם תיק משקל",       primaryMuscle: "biceps",     equipment: "household",  trackingType: "weight_reps", isCompound: false, targetSets: 3, targetReps: "10-15", restSeconds: 60 },
      { name: "חרק מת (Dead Bug)",              primaryMuscle: "core",       equipment: "bodyweight", trackingType: "reps_only",   isCompound: false, targetSets: 3, targetReps: "10-16", restSeconds: 45 },
    ],
  },
  {
    dayLabel: "B-Home",
    name: "אימון ביתי B",
    muscleGroups: ["hamstrings", "chest", "back", "triceps", "core"],
    exercises: [
      { name: "החלקת רגליים על רצפה (Sliding Leg Curls)", primaryMuscle: "hamstrings", equipment: "bodyweight", trackingType: "reps_only", isCompound: true,  targetSets: 3, targetReps: "8-12",  restSeconds: 90 },
      { name: "שכיבות סמיכה בשיפוע שלילי",       primaryMuscle: "chest",      equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 4, targetReps: "8-15",  restSeconds: 90 },
      { name: "מתח אחיזה רחבה (Pull-ups)",       primaryMuscle: "back",       equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 4, targetReps: "4-8",   restSeconds: 120 },
      { name: "שכיבות סמיכה יהלום / מקבילים על כיסא", primaryMuscle: "triceps", equipment: "bodyweight", trackingType: "reps_only", isCompound: true,  targetSets: 3, targetReps: "8-15",  restSeconds: 90 },
      { name: "הרמת ברכיים בתלייה (בית)",        primaryMuscle: "core",       equipment: "bodyweight", trackingType: "reps_only",   isCompound: false, targetSets: 3, targetReps: "8-15",  restSeconds: 60 },
    ],
  },
  {
    dayLabel: "C-Home",
    name: "אימון ביתי C",
    muscleGroups: ["back", "shoulders", "chest", "legs", "core"],
    exercises: [
      { name: "חתירה הפוכה תחת שולחן (Inverted Row)", primaryMuscle: "back",   equipment: "household",  trackingType: "reps_only",   isCompound: true,  targetSets: 4, targetReps: "8-12",  restSeconds: 90 },
      { name: "הרחקת כתפיים עם בקבוקי מים",     primaryMuscle: "shoulders",  equipment: "household",  trackingType: "weight_reps", isCompound: false, targetSets: 3, targetReps: "12-20", restSeconds: 60 },
      { name: "שכיבות סמיכה באחיזה רחבה",        primaryMuscle: "chest",      equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 4, targetReps: "10-18", restSeconds: 90 },
      { name: "סקוואט בולגרי (Bulgarian Split Squat)", primaryMuscle: "legs", equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 3, targetReps: "8-12",  restSeconds: 90 },
      { name: "פלאנק עם טפיחות כתף (Shoulder Taps)", primaryMuscle: "core",   equipment: "bodyweight", trackingType: "duration",    isCompound: false, targetSets: 3, targetReps: "20-40", restSeconds: 60 },
    ],
  },
]
