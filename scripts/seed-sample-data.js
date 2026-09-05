// Dev-only helper: populates IndexedDB with realistic sample data for
// local testing (workouts, routines, nutrition, sleep, body metrics).
// Not loaded by the app itself — run from the browser console while the
// app is open:
//
//   import('./scripts/seed-sample-data.js').then(m => m.seed()).then(() => location.reload());
//
import * as db from '../js/db.js';
import { getWeekStart, addDays, isoDate, uid } from '../js/util.js';

function pick(arr, i) { return arr[i % arr.length]; }

export async function seed() {
  await db.ensureSeeded();
  const exercises = await db.getExercises();
  const byName = (name) => exercises.find((e) => e.name === name);

  const bench = byName('Barbell Bench Press');
  const incline = byName('Incline Dumbbell Press');
  const ohp = byName('Overhead Press');
  const row = byName('Barbell Row');
  const pullup = byName('Pull-Up');
  const lat = byName('Lat Pulldown');
  const squat = byName('Back Squat');
  const rdl = byName('Romanian Deadlift');
  const legPress = byName('Leg Press');
  const curl = byName('Barbell Curl');
  const tricep = byName('Triceps Pushdown');
  const deadlift = byName('Deadlift');

  // ---- Routines ----
  const pushRoutine = await db.saveRoutine({
    name: 'Push Day',
    exercises: [
      { exerciseId: bench.id, targetSets: 4, targetReps: 8 },
      { exerciseId: incline.id, targetSets: 3, targetReps: 10 },
      { exerciseId: ohp.id, targetSets: 3, targetReps: 8 },
      { exerciseId: tricep.id, targetSets: 3, targetReps: 12 },
    ],
  });
  const pullRoutine = await db.saveRoutine({
    name: 'Pull Day',
    exercises: [
      { exerciseId: deadlift.id, targetSets: 3, targetReps: 5 },
      { exerciseId: row.id, targetSets: 4, targetReps: 8 },
      { exerciseId: pullup.id, targetSets: 3, targetReps: null },
      { exerciseId: lat.id, targetSets: 3, targetReps: 10 },
      { exerciseId: curl.id, targetSets: 3, targetReps: 12 },
    ],
  });
  const legRoutine = await db.saveRoutine({
    name: 'Leg Day',
    exercises: [
      { exerciseId: squat.id, targetSets: 4, targetReps: 6 },
      { exerciseId: rdl.id, targetSets: 3, targetReps: 8 },
      { exerciseId: legPress.id, targetSets: 3, targetReps: 12 },
    ],
  });
  void pushRoutine; void pullRoutine; void legRoutine;

  // ---- 8 weeks of workout history, progressive overload, ~4x/week ----
  const today = new Date();
  const currentWeekStart = getWeekStart(today);
  const WEEKS = 8;

  for (let w = WEEKS - 1; w >= 0; w--) {
    const weekStart = addDays(currentWeekStart, -7 * w);
    const weekIndex = WEEKS - 1 - w; // 0 = oldest week, increases -> progressive overload
    const sessionsThisWeek = w === 0 ? 2 : 4; // current (incomplete) week only has 2 so far

    const dayOffsets = [0, 1, 3, 4].slice(0, sessionsThisWeek);
    const templates = [
      { name: 'push', exercises: [[bench, 135], [incline, 50], [ohp, 75], [tricep, 40]] },
      { name: 'pull', exercises: [[deadlift, 185], [row, 115], [pullup, 0], [lat, 100], [curl, 45]] },
      { name: 'legs', exercises: [[squat, 165], [rdl, 135], [legPress, 270]] },
      { name: 'push2', exercises: [[bench, 135], [ohp, 75], [incline, 50]] },
    ];

    for (let d = 0; d < dayOffsets.length; d++) {
      const date = addDays(weekStart, dayOffsets[d]);
      if (date > today) continue;
      const template = pick(templates, d);
      const progress = weekIndex * 2.5; // ~2.5 lb/week progression

      const sessionExercises = template.exercises.map(([ex, baseWeight]) => {
        const isBodyweight = baseWeight === 0;
        const weight = isBodyweight ? 0 : Math.round((baseWeight + progress) / 2.5) * 2.5;
        const sets = [];
        const numSets = 3 + (d % 2);
        for (let s = 0; s < numSets; s++) {
          const reps = isBodyweight ? 8 + Math.floor(Math.random() * 4) : 6 + Math.floor(Math.random() * 5);
          const setWeight = isBodyweight ? 0 : weight - (s === numSets - 1 ? 5 : 0);
          sets.push({ weight: setWeight, reps });
        }
        return { exerciseId: ex.id, sets };
      });

      await db.saveWorkoutSession({
        id: uid(),
        date: date.toISOString(),
        exercises: sessionExercises,
      });
    }
  }

  // ---- Body metrics: weekly weigh-ins, gentle downward trend ----
  for (let w = WEEKS - 1; w >= 0; w--) {
    const date = addDays(currentWeekStart, -7 * w + 1);
    if (date > today) continue;
    const weekIndex = WEEKS - 1 - w;
    await db.saveBodyMetric({
      id: uid(),
      date: date.toISOString(),
      weight: Math.round((186 - weekIndex * 0.6) * 10) / 10,
      bodyFatPercentage: Math.round((19 - weekIndex * 0.3) * 10) / 10,
    });
  }

  // ---- Nutrition + sleep: one entry per week ----
  for (let w = WEEKS - 1; w >= 0; w--) {
    const weekStartISO = isoDate(addDays(currentWeekStart, -7 * w));
    if (w === 0) continue; // leave current week blank so the Home prompt shows
    const weekIndex = WEEKS - 1 - w;
    // No explicit id: saveNutritionEntry/saveSleepEntry dedupe by
    // weekStartDate themselves, so re-running this script updates the
    // same week in place instead of creating duplicates.
    await db.saveNutritionEntry({
      weekStartDate: weekStartISO,
      avgCalories: 2400 + weekIndex * 20,
      avgProtein: 170 + (weekIndex % 3) * 5,
      avgCarbs: 230 - (weekIndex % 2) * 10,
      avgFat: 70,
    });
    await db.saveSleepEntry({
      weekStartDate: weekStartISO,
      avgHoursSlept: Math.round((6.8 + (weekIndex % 3) * 0.3) * 10) / 10,
      avgQuality: 3 + (weekIndex % 3 === 0 ? 1 : 0),
    });
  }

  // ---- Settings: goal + nutrition targets ----
  await db.updateSettings({
    weeklyWorkoutGoal: 4,
    nutritionTargets: { calories: 2500, protein: 180, carbs: 220, fat: 70 },
  });

  console.log('Sample data seeded: 3 routines, ~%d workout sessions, %d weeks of body metrics/nutrition/sleep.', WEEKS * 4, WEEKS);
  return true;
}

// Cardio-only seed: adds Zone 2 incline-walk sessions on top of whatever's
// already in the database, without touching workouts/nutrition/sleep/body
// metrics (those don't dedupe by content, so re-running `seed()` would
// duplicate them — this is safe to run standalone or repeatedly since it
// just appends more cardio rows and overwrites the same settings fields).
export async function seedCardio() {
  await db.ensureSeeded();
  const today = new Date();
  const currentWeekStart = getWeekStart(today);
  const WEEKS = 8;

  // Varying session counts per week (oldest -> newest) against a goal of
  // 5/week, so some weeks meet it and some fall short — gives the cardio
  // streak something real to advance and reset against.
  const sessionsPerWeek = [3, 5, 5, 4, 5, 6, 5, 2];

  for (let w = WEEKS - 1; w >= 0; w--) {
    const weekStart = addDays(currentWeekStart, -7 * w);
    const weekIndex = WEEKS - 1 - w;
    const count = w === 0 ? 3 : sessionsPerWeek[weekIndex];
    const dayOffsets = [0, 1, 2, 3, 4, 5, 6].slice(0, count);

    for (let d = 0; d < dayOffsets.length; d++) {
      const date = addDays(weekStart, dayOffsets[d]);
      if (date > today) continue;
      const minutes = 25 + weekIndex + Math.floor(Math.random() * 6);
      const incline = Math.round((2 + weekIndex * 0.3) * 2) / 2;
      const distance = Math.round((1.2 + weekIndex * 0.08 + Math.random() * 0.3) * 10) / 10;
      await db.saveCardioSession({
        id: uid(),
        date: date.toISOString(),
        minutes,
        incline,
        distance,
      });
    }
  }

  // Fill in the new goal/target settings too, so the baseline lines have
  // something to show.
  await db.updateSettings({
    cardioWeeklyGoal: 5,
    sleepHoursTarget: 7.5,
    targetWeight: 175,
    targetBodyFat: 15,
  });

  console.log('Cardio sample data seeded across %d weeks.', WEEKS);
  return true;
}
