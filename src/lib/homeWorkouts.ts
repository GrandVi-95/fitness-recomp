// ─── Home workout templates ───────────────────────────────────────────────────
// Every home exercise is a NEW Exercise row (unique Hebrew name), never a reuse
// of a gym exercise — set history is keyed by exerciseId, so this guarantees
// home logging can never overwrite or blend with gym weight/reps history.
// (הרמת ברכיים בתלייה exists in the gym plan too, but gets its own home row
// for the same reason.)

export interface HomeExerciseTemplate {
  name:          string
  primaryMuscle: string
  equipment:     string   // bodyweight | household (resistance band, water bottles, table)
  trackingType:  "weight_reps" | "reps_only" | "duration"
  isCompound:    boolean
  targetSets:    number
  targetReps:    string   // reps, or seconds range for duration exercises
  restSeconds:   number
  // Exercises sharing the same superSetId are performed back-to-back with no
  // rest between them; sets/reps/weight tracking stays independent per exercise.
  superSetId?:   string
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
    muscleGroups: ["chest", "legs", "biceps", "core"],
    exercises: [
      { name: "שכיבות סמיכה קלאסיות",                    primaryMuscle: "chest",  equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 4, targetReps: "AMRAP", restSeconds: 90 },
      { name: "ישיבת קיר (Wall Sit)",                     primaryMuscle: "legs",   equipment: "bodyweight", trackingType: "duration",    isCompound: true,  targetSets: 4, targetReps: "30-45", restSeconds: 60 },
      { name: "שכיבות סמיכה בשיפוע שלילי",                primaryMuscle: "chest",  equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 3, targetReps: "AMRAP", restSeconds: 90 },
      { name: "סקוואט בולגרי (Bulgarian Split Squat)",    primaryMuscle: "legs",   equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 3, targetReps: "10-12", restSeconds: 90 },
      { name: "כפיפת מרפקים בישיבה עם גומייה (Band Seated Curls)", primaryMuscle: "biceps", equipment: "household", trackingType: "weight_reps", isCompound: false, targetSets: 3, targetReps: "10-15", restSeconds: 60, superSetId: "home-a-ss1" },
      { name: "חרק מת (Dead Bug)",                        primaryMuscle: "core",   equipment: "bodyweight", trackingType: "reps_only",   isCompound: false, targetSets: 3, targetReps: "10-12", restSeconds: 45, superSetId: "home-a-ss1" },
    ],
  },
  {
    dayLabel: "B-Home",
    name: "אימון ביתי B",
    muscleGroups: ["back", "shoulders", "triceps", "core"],
    exercises: [
      { name: "מתח אחיזה רחבה (Pull-ups)",                 primaryMuscle: "back",      equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 4, targetReps: "AMRAP", restSeconds: 120 },
      { name: "חתירה בישיבה עם גומייה (Band Seated Row)",  primaryMuscle: "back",      equipment: "household",  trackingType: "weight_reps", isCompound: true,  targetSets: 4, targetReps: "12-15", restSeconds: 90 },
      { name: "הרחקת כתפיים עם גומייה / בקבוקי מים (Band/Bottle Lateral Raises)", primaryMuscle: "shoulders", equipment: "household", trackingType: "weight_reps", isCompound: false, targetSets: 3, targetReps: "12-15", restSeconds: 60 },
      { name: "שכיבות סמיכה יהלום (Diamond Push-ups)",     primaryMuscle: "triceps",   equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 3, targetReps: "AMRAP", restSeconds: 90, superSetId: "home-b-ss1" },
      { name: "פאלוף פרס עם גומייה (Band Pallof Press)",   primaryMuscle: "core",      equipment: "household",  trackingType: "reps_only",   isCompound: false, targetSets: 3, targetReps: "10-12", restSeconds: 60, superSetId: "home-b-ss1" },
    ],
  },
  {
    dayLabel: "C-Home",
    name: "אימון ביתי C",
    muscleGroups: ["hamstrings", "back", "chest", "core"],
    exercises: [
      { name: "החלקת רגליים על רצפה (Sliding Leg Curls)", primaryMuscle: "hamstrings", equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 3, targetReps: "12-15", restSeconds: 90 },
      { name: "חתירה הפוכה תחת שולחן (Inverted Row)",     primaryMuscle: "back",       equipment: "household",  trackingType: "reps_only",   isCompound: true,  targetSets: 3, targetReps: "AMRAP", restSeconds: 90 },
      { name: "פרפר חזה עם גומייה (Band Chest Fly)",      primaryMuscle: "chest",      equipment: "household",  trackingType: "weight_reps", isCompound: false, targetSets: 3, targetReps: "12-15", restSeconds: 60 },
      { name: "מתח באחיזה הפוכה (Chin-ups)",              primaryMuscle: "back",       equipment: "bodyweight", trackingType: "reps_only",   isCompound: true,  targetSets: 3, targetReps: "AMRAP", restSeconds: 120 },
      { name: "הרמת ברכיים בתלייה (בית)",                 primaryMuscle: "core",       equipment: "bodyweight", trackingType: "reps_only",   isCompound: false, targetSets: 3, targetReps: "10-15", restSeconds: 60 },
    ],
  },
]
