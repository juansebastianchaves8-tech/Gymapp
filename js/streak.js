// Streak calculation. Week boundary is Monday-Sunday. A week "counts" for a
// given category if its logged sessions that week >= that category's goal.
// Consecutive met weeks increment the streak; a missed week resets it to 0.
// The overall streak only advances on weeks where BOTH the workout goal and
// the cardio goal were met. The current in-progress week is provisional and
// never affects any streak number until it closes (i.e. until a later app
// load sees it's fully in the past).
import { getSettings, updateSettings, getWorkoutSessions, getCardioSessions } from './db.js';
import { getWeekStart, addDays, isoDate } from './util.js';

function countInWeek(sessions, weekStartISO) {
  const start = new Date(weekStartISO);
  const end = addDays(start, 7);
  return sessions.filter((s) => {
    const d = new Date(s.date);
    return d >= start && d < end;
  }).length;
}

// Call on every app load. Walks forward from lastStreakWeekChecked,
// closing out any fully-elapsed weeks and updating all three streak counts
// for each, so a gap of several weeks away from the app still replays
// correctly.
export async function reconcileStreak() {
  let settings = await getSettings();
  const currentWeekStartISO = isoDate(getWeekStart());

  if (!settings.lastStreakWeekChecked) {
    settings = await updateSettings({ lastStreakWeekChecked: currentWeekStartISO });
  }

  const [sessions, cardioSessions] = await Promise.all([getWorkoutSessions(), getCardioSessions()]);
  let {
    streakCount = 0,
    cardioStreakCount = 0,
    overallStreakCount = 0,
    lastStreakWeekChecked,
    weeklyWorkoutGoal = 4,
    cardioWeeklyGoal = 5,
  } = settings;

  while (lastStreakWeekChecked < currentWeekStartISO) {
    const workoutMet = countInWeek(sessions, lastStreakWeekChecked) >= weeklyWorkoutGoal;
    const cardioMet = countInWeek(cardioSessions, lastStreakWeekChecked) >= cardioWeeklyGoal;
    streakCount = workoutMet ? streakCount + 1 : 0;
    cardioStreakCount = cardioMet ? cardioStreakCount + 1 : 0;
    overallStreakCount = (workoutMet && cardioMet) ? overallStreakCount + 1 : 0;
    lastStreakWeekChecked = isoDate(addDays(new Date(lastStreakWeekChecked), 7));
  }

  settings = await updateSettings({
    streakCount, cardioStreakCount, overallStreakCount, lastStreakWeekChecked: currentWeekStartISO,
  });
  return settings;
}

// Provisional status for the current, still-open week. Does not touch any
// stored streak.
export async function getCurrentWeekStatus() {
  const settings = await getSettings();
  const [sessions, cardioSessions] = await Promise.all([getWorkoutSessions(), getCardioSessions()]);
  const weekStartISO = isoDate(getWeekStart());

  const workoutCount = countInWeek(sessions, weekStartISO);
  const workoutGoal = settings.weeklyWorkoutGoal || 0;
  const cardioCount = countInWeek(cardioSessions, weekStartISO);
  const cardioGoal = settings.cardioWeeklyGoal || 0;

  return {
    workout: { count: workoutCount, goal: workoutGoal, onTrack: workoutCount >= workoutGoal, weekStartISO },
    cardio: { count: cardioCount, goal: cardioGoal, onTrack: cardioCount >= cardioGoal, weekStartISO },
  };
}
