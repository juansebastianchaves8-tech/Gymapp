import { getSettings, getWorkoutSessions, getExercises, getNutritionEntries, getSleepEntries } from '../db.js';
import { getCurrentWeekStatus } from '../streak.js';
import { el, isoDate, getWeekStart, round1, escapeHtml } from '../util.js';

function computeRecentPRs(sessionsAsc, exercises) {
  const runningMax = new Map();
  const prEvents = [];
  sessionsAsc.forEach((s) => {
    s.exercises.forEach((se) => {
      se.sets.forEach((set) => {
        const cur = runningMax.get(se.exerciseId) || 0;
        if (set.weight > cur) {
          runningMax.set(se.exerciseId, set.weight);
          prEvents.push({ exerciseId: se.exerciseId, weight: set.weight, reps: set.reps, date: s.date });
        }
      });
    });
  });
  const exName = (id) => exercises.find((e) => e.id === id)?.name || 'Unknown';
  return prEvents
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3)
    .map((p) => ({ ...p, name: exName(p.exerciseId) }));
}

export async function renderHome(container) {
  const [settings, sessions, exercises, nutritionEntries, sleepEntries, weekStatus] = await Promise.all([
    getSettings(), getWorkoutSessions(), getExercises(), getNutritionEntries(), getSleepEntries(), getCurrentWeekStatus(),
  ]);

  const sessionsAsc = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const recentPRs = computeRecentPRs(sessionsAsc, exercises);

  const currentWeekISO = isoDate(getWeekStart());
  const hasNutritionThisWeek = nutritionEntries.some((e) => e.weekStartDate === currentWeekISO);
  const hasSleepThisWeek = sleepEntries.some((e) => e.weekStartDate === currentWeekISO);

  const missingPrompts = [];
  if (!hasNutritionThisWeek) missingPrompts.push({ label: 'Log this week\'s nutrition', href: '#/nutrition' });
  if (!hasSleepThisWeek) missingPrompts.push({ label: 'Log this week\'s sleep', href: '#/sleep' });

  container.appendChild(el(`
    <div class="screen">
      <div class="hero">
        <div class="hero-number">${settings.streakCount || 0}</div>
        <div class="hero-label">week streak</div>
      </div>

      <div class="card">
        <div class="big-stat" style="padding:6px 8px;">
          <div class="num">${weekStatus.count}/${weekStatus.goal}</div>
          <div class="lbl">workouts this week ${weekStatus.onTrack ? '· on track' : ''}</div>
        </div>
      </div>

      ${missingPrompts.map((p) => `
        <div class="prompt-banner">
          <p>${escapeHtml(p.label)}</p>
          <a href="${p.href}" class="btn btn-ghost btn-sm">Log</a>
        </div>
      `).join('')}

      <div class="quick-actions">
        <a href="#/workout" class="btn btn-primary btn-block">Start Workout</a>
        <a href="#/body" class="btn btn-secondary btn-block">Log Weight</a>
      </div>

      <div class="section mt-16">
        <div class="section-title">Recent PRs</div>
        ${recentPRs.length === 0 ? '<div class="empty-state text-sm">No PRs yet. Get lifting.</div>' : `
          <ul class="pr-list">
            ${recentPRs.map((p) => `<li><span>${escapeHtml(p.name)}</span><span class="pr-weight">${round1(p.weight)} lbs × ${p.reps}</span></li>`).join('')}
          </ul>
        `}
      </div>
    </div>
  `));
}
