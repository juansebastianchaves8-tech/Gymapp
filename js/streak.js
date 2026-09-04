// Streak calculation. Week boundary is Monday-Sunday. A week "counts" if
// logged workout sessions that week >= weeklyWorkoutGoal. Consecutive met
// weeks increment the streak; a missed week resets it to 0. The current
// in-progress week is provisional and never affects the streak number
// until it closes (i.e. until a later app load sees it's fully in the past).
import { getSettings, updateSettings, getWorkoutSessions } from './db.js';
import { getWeekStart, addDays, isoDate } from './util.js';

function countWorkoutsInWeek(sessions, weekStartISO) {
  const start = new Date(weekStartISO);
  const end = addDays(start, 7);
  return sessions.filter((s) => {
    const d = new Date(s.date);
    return d >= start && d < end;
  }).length;
}

// Call on every app load. Walks forward from lastStreakWeekChecked,
// closing out any fully-elapsed weeks and updating streakCount for each,
// so a gap of several weeks away from the app still replays correctly.
export async function reconcileStreak() {
  let settings = await getSettings();
  const currentWeekStartISO = isoDate(getWeekStart());

  if (!settings.lastStreakWeekChecked) {
    settings = await updateSettings({ lastStreakWeekChecked: currentWeekStartISO });
  }

  const sessions = await getWorkoutSessions();
  let { streakCount = 0, lastStreakWeekChecked, weeklyWorkoutGoal = 4 } = settings;

  while (lastStreakWeekChecked < currentWeekStartISO) {
    const count = countWorkoutsInWeek(sessions, lastStreakWeekChecked);
    streakCount = count >= weeklyWorkoutGoal ? streakCount + 1 : 0;
    lastStreakWeekChecked = isoDate(addDays(new Date(lastStreakWeekChecked), 7));
  }

  settings = await updateSettings({ streakCount, lastStreakWeekChecked: currentWeekStartISO });
  return settings;
}

// Provisional status for the current, still-open week. Does not touch the
// stored streak.
export async function getCurrentWeekStatus() {
  const settings = await getSettings();
  const sessions = await getWorkoutSessions();
  const weekStartISO = isoDate(getWeekStart());
  const count = countWorkoutsInWeek(sessions, weekStartISO);
  const goal = settings.weeklyWorkoutGoal || 0;
  return { count, goal, onTrack: count >= goal, weekStartISO };
}
