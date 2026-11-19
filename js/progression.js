// Weight carry-forward and PRs for strength exercises. Pure functions over
// saved workout sessions ({ date, exercises: [{ exerciseId, sets: [{ weight, reps }] }] }).

const PROGRESSION_STEP_LBS = 5;

// Heaviest set ever per exercise: Map of exerciseId -> { weight, reps, date }.
// On a tie the earliest set is kept, so the PR date is when it was first hit.
export function bestSetsByExercise(sessions) {
  const oldestFirst = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const best = new Map();
  for (const session of oldestFirst) {
    for (const se of session.exercises) {
      for (const set of se.sets) {
        const cur = best.get(se.exerciseId);
        if (!cur || set.weight > cur.weight) {
          best.set(se.exerciseId, { weight: set.weight, reps: set.reps, date: session.date });
        }
      }
    }
  }
  return best;
}

// Sets from the most recent session containing each exercise:
// Map of exerciseId -> [{ weight, reps }].
export function lastSetsByExercise(sessions) {
  const newestFirst = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
  const last = new Map();
  for (const session of newestFirst) {
    for (const se of session.exercises) {
      if (!last.has(se.exerciseId) && se.sets.length) last.set(se.exerciseId, se.sets);
    }
  }
  return last;
}

// Weight to start with next time, from last time's sets and the routine target
// ({ targetSets, targetSetsMax, targetReps, targetRepsMax }; ranges use their
// upper end). If at least the max number of sets reached the max reps, last
// set's weight + 5 lbs; otherwise last set's weight. Without a full target
// there's nothing to have hit, so it stays the same. null with no history.
export function suggestWeight(lastSets, target = {}) {
  if (!lastSets || lastSets.length === 0) return null;
  const lastWeight = lastSets[lastSets.length - 1].weight;
  const maxSets = target.targetSetsMax || target.targetSets;
  const maxReps = target.targetRepsMax || target.targetReps;
  if (!maxSets || !maxReps) return lastWeight;
  const setsAtMaxReps = lastSets.filter((s) => s.reps >= maxReps).length;
  return setsAtMaxReps >= maxSets ? lastWeight + PROGRESSION_STEP_LBS : lastWeight;
}
