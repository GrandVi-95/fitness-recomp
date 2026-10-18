-- Plan C update (v1.17.0)
-- 1. Rename existing exercises (same ids → logged history carries over).
-- 2. Add the new exercises.
-- 3. Replace the exercise list of the live gym "C" workout(s).
-- Idempotent: safe to re-run; renames are skipped if the new name exists.

UPDATE "Exercise" SET "name" = 'High-Wide Leg Press', "secondaryMuscles" = '["quads","hamstrings"]'
WHERE "name" = 'Glute Drive Machine (or High/Wide Leg Press)'
  AND NOT EXISTS (SELECT 1 FROM "Exercise" WHERE "name" = 'High-Wide Leg Press');

UPDATE "Exercise" SET "name" = 'Pull-Ups / Assisted Pull-Ups'
WHERE "name" = 'Pull-Ups'
  AND NOT EXISTS (SELECT 1 FROM "Exercise" WHERE "name" = 'Pull-Ups / Assisted Pull-Ups');
-- Reps-based progression: assistance kg must not read as "stronger".
UPDATE "Exercise" SET "trackingType" = 'reps_only' WHERE "name" = 'Pull-Ups / Assisted Pull-Ups';

UPDATE "Exercise" SET "name" = 'Seated Leg Curl'
WHERE "name" = 'Seated Leg Curls'
  AND NOT EXISTS (SELECT 1 FROM "Exercise" WHERE "name" = 'Seated Leg Curl');

INSERT INTO "Exercise" ("id", "name", "primaryMuscle", "secondaryMuscles", "equipment", "isCompound", "trackingType") VALUES
  (gen_random_uuid()::text, 'High-Wide Leg Press',             'glutes',     '["quads","hamstrings"]', 'machine',    true,  'weight_reps'),
  (gen_random_uuid()::text, 'Pull-Ups / Assisted Pull-Ups',    'back',       '["biceps"]',             'bodyweight', true,  'reps_only'),
  (gen_random_uuid()::text, 'Pec Deck Fly',                    'chest',      '[]',                     'machine',    false, 'weight_reps'),
  (gen_random_uuid()::text, 'Seated Leg Curl',                 'hamstrings', '[]',                     'machine',    false, 'weight_reps'),
  (gen_random_uuid()::text, 'Cable Lateral Raises',            'shoulders',  '[]',                     'cable',      false, 'weight_reps'),
  (gen_random_uuid()::text, 'Preacher Curl',                   'biceps',     '[]',                     'machine',    false, 'weight_reps'),
  (gen_random_uuid()::text, 'Overhead Cable Tricep Extension', 'triceps',    '[]',                     'cable',      false, 'weight_reps'),
  (gen_random_uuid()::text, 'Hanging Leg Raises',              'core',       '[]',                     'bodyweight', false, 'weight_reps')
ON CONFLICT ("name") DO NOTHING;

-- Target: live (non-archived) gym workout with dayLabel 'C' in the demo user's active, non-archived plan.
CREATE TEMP TABLE plan_c_targets AS
SELECT w."id"
FROM "Workout" w
JOIN "WorkoutPlan" p ON p."id" = w."planId"
WHERE w."dayLabel" = 'C'
  AND w."environment" = 'gym'
  AND w."archivedAt" IS NULL
  AND p."userId" = 'demo-user'
  AND p."isActive" = true
  AND p."archivedAt" IS NULL;

UPDATE "Workout"
SET "muscleGroups" = '["glutes","quads","hamstrings","back","chest","shoulders","biceps","triceps","core"]'
WHERE "id" IN (SELECT "id" FROM plan_c_targets);

-- Template rows only — SetLog history references Exercise, not WorkoutExercise.
DELETE FROM "WorkoutExercise" WHERE "workoutId" IN (SELECT "id" FROM plan_c_targets);

-- Rest ranges stored as one value: 120–180 s → 150, 90–120 s → 105.
-- 6A/6B share superSetId 'C-SS1' (back-to-back, then one shared rest; 3 rounds).
INSERT INTO "WorkoutExercise" ("id", "workoutId", "exerciseId", "order", "targetSets", "targetReps", "restSeconds", "superSetId")
SELECT gen_random_uuid()::text, t."id", e."id", v.ord, v.sets, v.reps, v.rest, v.ss
FROM plan_c_targets t
CROSS JOIN (VALUES
  (0, 'High-Wide Leg Press',             3, '8-12',  150, NULL),
  (1, 'Pull-Ups / Assisted Pull-Ups',    3, '6-12',  150, NULL),
  (2, 'Pec Deck Fly',                    3, '10-15', 105, NULL),
  (3, 'Seated Leg Curl',                 3, '10-15', 105, NULL),
  (4, 'Cable Lateral Raises',            2, '12-20', 105, NULL),
  (5, 'Preacher Curl',                   3, '10-15', 105, 'C-SS1'),
  (6, 'Overhead Cable Tricep Extension', 3, '10-15', 105, 'C-SS1'),
  (7, 'Hanging Leg Raises',              3, '10-15', 105, NULL)
) AS v(ord, name, sets, reps, rest, ss)
JOIN "Exercise" e ON e."name" = v.name;

DROP TABLE plan_c_targets;
