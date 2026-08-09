// Seed: vegetarian food database + demo workout plan
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("🌱 Seeding database…")

  // ── Vegetarian protein food database ─────────────────────────
  const foods = [
    // Legumes
    { name: "Firm Tofu",        category: "legumes",            caloriesPer100: 76,  proteinPer100: 8.0,  carbsPer100: 1.9,  fatPer100: 4.8,  fiberPer100: 0.3, aliases: '["tofu","bean curd"]' },
    { name: "Edamame",          category: "legumes",            caloriesPer100: 121, proteinPer100: 11.9, carbsPer100: 8.9,  fatPer100: 5.2,  fiberPer100: 5.2, aliases: '["soy beans","edamame beans"]' },
    { name: "Red Lentils",      category: "legumes",            caloriesPer100: 116, proteinPer100: 9.0,  carbsPer100: 20.1, fatPer100: 0.4,  fiberPer100: 7.9, aliases: '["lentils","red dal"]' },
    { name: "Green Lentils",    category: "legumes",            caloriesPer100: 116, proteinPer100: 9.0,  carbsPer100: 20.1, fatPer100: 0.4,  fiberPer100: 7.9, aliases: '["lentils","puy lentils"]' },
    { name: "Black Beans",      category: "legumes",            caloriesPer100: 132, proteinPer100: 8.9,  carbsPer100: 23.7, fatPer100: 0.5,  fiberPer100: 8.7, aliases: '["black beans","black turtle beans"]' },
    { name: "Chickpeas",        category: "legumes",            caloriesPer100: 164, proteinPer100: 8.9,  carbsPer100: 27.4, fatPer100: 2.6,  fiberPer100: 7.6, aliases: '["garbanzo beans","hummus base"]' },
    { name: "Seitan",           category: "legumes",            caloriesPer100: 370, proteinPer100: 75.0, carbsPer100: 14.0, fatPer100: 1.9,  fiberPer100: 0.6, aliases: '["wheat gluten","wheat meat"]' },
    { name: "Tempeh",           category: "legumes",            caloriesPer100: 193, proteinPer100: 20.3, carbsPer100: 9.4,  fatPer100: 10.8, fiberPer100: 0.0, aliases: '["tempeh"]' },
    // Dairy & eggs
    { name: "Greek Yogurt",     category: "dairy",              caloriesPer100: 59,  proteinPer100: 10.0, carbsPer100: 3.6,  fatPer100: 0.4,  fiberPer100: 0.0, aliases: '["greek yogurt","protein yogurt","skyr"]' },
    { name: "Cottage Cheese",   category: "dairy",              caloriesPer100: 98,  proteinPer100: 11.1, carbsPer100: 3.4,  fatPer100: 4.3,  fiberPer100: 0.0, aliases: '["cottage cheese","quark"]' },
    { name: "Quark",            category: "dairy",              caloriesPer100: 68,  proteinPer100: 12.0, carbsPer100: 4.0,  fatPer100: 0.2,  fiberPer100: 0.0, aliases: '["quark","low fat quark"]' },
    { name: "Whole Egg",        category: "egg",                caloriesPer100: 155, proteinPer100: 12.6, carbsPer100: 1.1,  fatPer100: 10.6, fiberPer100: 0.0, aliases: '["egg","eggs","large egg"]' },
    { name: "Egg White",        category: "egg",                caloriesPer100: 52,  proteinPer100: 10.9, carbsPer100: 0.7,  fatPer100: 0.2,  fiberPer100: 0.0, aliases: '["egg white","egg whites","albumin"]' },
    // Protein supplements
    { name: "Whey Protein",     category: "protein_supplement", caloriesPer100: 380, proteinPer100: 80.0, carbsPer100: 8.0,  fatPer100: 5.0,  fiberPer100: 0.0, aliases: '["whey","whey protein powder","protein shake","protein powder"]' },
    { name: "Plant Protein",    category: "protein_supplement", caloriesPer100: 370, proteinPer100: 74.0, carbsPer100: 10.0, fatPer100: 5.0,  fiberPer100: 3.0, aliases: '["plant protein","vegan protein","pea protein","rice protein"]' },
    { name: "Casein Protein",   category: "protein_supplement", caloriesPer100: 375, proteinPer100: 78.0, carbsPer100: 8.0,  fatPer100: 2.0,  fiberPer100: 0.0, aliases: '["casein","slow protein","night protein"]' },
    // Grains & carbs
    { name: "Oats",             category: "grain",              caloriesPer100: 389, proteinPer100: 16.9, carbsPer100: 66.3, fatPer100: 6.9,  fiberPer100: 10.6, aliases: '["oatmeal","rolled oats","porridge","oats"]' },
    { name: "Quinoa (cooked)",  category: "grain",              caloriesPer100: 120, proteinPer100: 4.4,  carbsPer100: 21.3, fatPer100: 1.9,  fiberPer100: 2.8, aliases: '["quinoa"]' },
    { name: "Brown Rice (cooked)", category: "grain",           caloriesPer100: 123, proteinPer100: 2.7,  carbsPer100: 25.6, fatPer100: 1.0,  fiberPer100: 1.8, aliases: '["rice","brown rice"]' },
    // Nuts & seeds
    { name: "Peanut Butter",    category: "nuts_seeds",         caloriesPer100: 588, proteinPer100: 25.1, carbsPer100: 20.1, fatPer100: 49.9, fiberPer100: 6.0, aliases: '["peanut butter","pb"]' },
    { name: "Hemp Seeds",       category: "nuts_seeds",         caloriesPer100: 553, proteinPer100: 31.6, carbsPer100: 8.7,  fatPer100: 48.8, fiberPer100: 4.0, aliases: '["hemp seeds","hemp hearts"]' },
    { name: "Pumpkin Seeds",    category: "nuts_seeds",         caloriesPer100: 559, proteinPer100: 30.2, carbsPer100: 10.7, fatPer100: 49.1, fiberPer100: 6.0, aliases: '["pumpkin seeds","pepitas"]' },
  ]

  for (const food of foods) {
    await prisma.food.upsert({
      where: { name: food.name },
      update: food,
      create: { ...food, isVegetarian: true },
    })
  }
  console.log(`  ✓ ${foods.length} vegetarian foods seeded`)

  // ── Demo exercises — Ultimate Hypertrophy A/B/C split ──────────
  const exercises = [
    // Workout A — Chest, Quads, Biceps
    { name: "Barbell Bench Press",         primaryMuscle: "chest",      equipment: "barbell",  isCompound: true,  secondaryMuscles: '["shoulders","triceps"]' },
    { name: "Leg Press",                   primaryMuscle: "quads",      equipment: "machine",  isCompound: true,  secondaryMuscles: '["glutes"]' },
    { name: "Incline Barbell Bench Press", primaryMuscle: "chest",      equipment: "barbell",  isCompound: true,  secondaryMuscles: '["shoulders","triceps"]' },
    { name: "Leg Extensions",              primaryMuscle: "quads",      equipment: "machine",  isCompound: false, secondaryMuscles: '[]' },
    { name: "Seated Dumbbell Curls",       primaryMuscle: "biceps",     equipment: "dumbbell", isCompound: false, secondaryMuscles: '[]' },
    { name: "Seated Ab Machine",           primaryMuscle: "core",       equipment: "machine",  isCompound: false, secondaryMuscles: '[]' },
    // Workout B — Back, Shoulders, Triceps
    { name: "Lat Pulldown",                primaryMuscle: "back",       equipment: "cable",    isCompound: true,  secondaryMuscles: '["biceps"]' },
    { name: "Chest-Supported Row",         primaryMuscle: "back",       equipment: "machine",  isCompound: true,  secondaryMuscles: '["biceps"]' },
    { name: "Seated Lateral Raises",       primaryMuscle: "shoulders",  equipment: "dumbbell", isCompound: false, secondaryMuscles: '[]' },
    { name: "Cable Tricep Pushdown",       primaryMuscle: "triceps",    equipment: "cable",    isCompound: false, secondaryMuscles: '[]' },
    { name: "Pallof Press",                primaryMuscle: "core",       equipment: "cable",    isCompound: false, secondaryMuscles: '[]' },
    // Workout C — Full Body
    { name: "Seated Leg Curls",            primaryMuscle: "hamstrings", equipment: "machine",  isCompound: false, secondaryMuscles: '[]' },
    { name: "Dumbbell Pullover",           primaryMuscle: "back",       equipment: "dumbbell", isCompound: false, secondaryMuscles: '["chest","triceps"]' },
    { name: "Pec Deck Fly",                primaryMuscle: "chest",      equipment: "machine",  isCompound: false, secondaryMuscles: '[]' },
    { name: "Pull-Ups / Reverse Grip Pulldown", primaryMuscle: "back",  equipment: "bodyweight",isCompound: true, secondaryMuscles: '["biceps"]' },
    { name: "Hanging Leg Raises",          primaryMuscle: "core",       equipment: "bodyweight",isCompound: false, secondaryMuscles: '[]' },
  ]

  for (const ex of exercises) {
    await prisma.exercise.upsert({
      where: { name: ex.name },
      update: ex,
      create: ex,
    })
  }
  console.log(`  ✓ ${exercises.length} exercises seeded`)

  // ── Demo user ─────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { id: "demo-user" },
    update: {},
    create: {
      id: "demo-user",
      name: "Athlete",
      targetCalories: 2600,
      targetProtein: 185,
      muscleMassGoal: 5.0,
      splitType: "PPL",
      restSeconds: 90,
      userSettings: {
        create: {
          darkMode: true,
          proteinAlertEnabled: true,
          proteinAlertTime: "14:00",
          deloadThreshold: 3,
          fatiguePacingEnabled: true,
        },
      },
    },
  })
  console.log(`  ✓ Demo user created: ${user.name} (${user.id})`)

  // ── Demo PPL workout plan ─────────────────────────────────────
  const existingPlan = await prisma.workoutPlan.findFirst({
    where: { userId: user.id },
  })

  if (!existingPlan) {
    const allExercises = await prisma.exercise.findMany()
    const byName = Object.fromEntries(allExercises.map((e) => [e.name, e.id]))

    const plan = await prisma.workoutPlan.create({
      data: {
        userId: user.id,
        name: "Ultimate Hypertrophy",
        splitType: "CUSTOM",
        workouts: {
          create: [
            {
              name: "Workout A",
              dayLabel: "A",
              order: 0,
              muscleGroups: '["chest","quads","biceps"]',
              exercises: {
                create: [
                  { exerciseId: byName["Barbell Bench Press"],         order: 0, targetSets: 4, targetReps: "6-8",   restSeconds: 120 },
                  { exerciseId: byName["Leg Press"],                   order: 1, targetSets: 4, targetReps: "8-10",  restSeconds: 90  },
                  { exerciseId: byName["Incline Barbell Bench Press"], order: 2, targetSets: 3, targetReps: "8-12",  restSeconds: 90  },
                  { exerciseId: byName["Leg Extensions"],              order: 3, targetSets: 3, targetReps: "10-12", restSeconds: 90  },
                  { exerciseId: byName["Seated Dumbbell Curls"],       order: 4, targetSets: 3, targetReps: "10-12", restSeconds: 60, superSetId: "gym-a-ss1" },
                  { exerciseId: byName["Seated Ab Machine"],           order: 5, targetSets: 3, targetReps: "15-20", restSeconds: 60, superSetId: "gym-a-ss1" },
                ],
              },
            },
            {
              name: "Workout B",
              dayLabel: "B",
              order: 1,
              muscleGroups: '["back","shoulders","triceps"]',
              exercises: {
                create: [
                  { exerciseId: byName["Lat Pulldown"],          order: 0, targetSets: 4, targetReps: "8-10",  restSeconds: 90 },
                  { exerciseId: byName["Chest-Supported Row"],   order: 1, targetSets: 4, targetReps: "8-10",  restSeconds: 90 },
                  { exerciseId: byName["Seated Lateral Raises"], order: 2, targetSets: 3, targetReps: "12-15", restSeconds: 60 },
                  { exerciseId: byName["Cable Tricep Pushdown"], order: 3, targetSets: 3, targetReps: "10-12", restSeconds: 60, superSetId: "gym-b-ss1" },
                  { exerciseId: byName["Pallof Press"],          order: 4, targetSets: 3, targetReps: "10-12", restSeconds: 60, superSetId: "gym-b-ss1" },
                ],
              },
            },
            {
              name: "Workout C",
              dayLabel: "C",
              order: 2,
              muscleGroups: '["hamstrings","back","chest","core"]',
              exercises: {
                create: [
                  { exerciseId: byName["Seated Leg Curls"],                 order: 0, targetSets: 3, targetReps: "10-12", restSeconds: 90 },
                  { exerciseId: byName["Dumbbell Pullover"],                order: 1, targetSets: 3, targetReps: "10-12", restSeconds: 90 },
                  { exerciseId: byName["Pec Deck Fly"],                     order: 2, targetSets: 3, targetReps: "10-12", restSeconds: 90 },
                  { exerciseId: byName["Pull-Ups / Reverse Grip Pulldown"], order: 3, targetSets: 3, targetReps: "AMRAP",  restSeconds: 120 },
                  { exerciseId: byName["Hanging Leg Raises"],               order: 4, targetSets: 3, targetReps: "10-15", restSeconds: 60 },
                ],
              },
            },
          ],
        },
      },
    })
    console.log(`  ✓ Hypertrophy plan created: ${plan.name}`)
  }

  console.log("✅ Seed complete.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
