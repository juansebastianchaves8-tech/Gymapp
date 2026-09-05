import { getWorkoutSessions, getExercises, getBodyMetrics, getCardioSessions, getSettings } from '../db.js';
import { el, epley1RM, round1, getWeekStart, isoDate, formatDate, escapeHtml } from '../util.js';
import { loadChartJs, CHART_COLORS, lineChart, barChart, goalDataset, createChartManager } from '../charts.js';

export async function renderProgress(container) {
  const charts = createChartManager();

  const [sessions, exercises, bodyMetrics, cardioSessions, settings] = await Promise.all([
    getWorkoutSessions(), getExercises(), getBodyMetrics(), getCardioSessions(), getSettings(),
  ]);
  const sessionsAsc = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const cardioAsc = [...cardioSessions].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Exercises that actually have logged sets, most-logged first.
  const exerciseUsage = new Map();
  sessionsAsc.forEach((s) => s.exercises.forEach((se) => {
    exerciseUsage.set(se.exerciseId, (exerciseUsage.get(se.exerciseId) || 0) + 1);
  }));
  const loggedExercises = exercises
    .filter((e) => exerciseUsage.has(e.id))
    .sort((a, b) => exerciseUsage.get(b.id) - exerciseUsage.get(a.id));

  // Full PR list: heaviest weight ever per exercise.
  const prMap = new Map();
  sessionsAsc.forEach((s) => s.exercises.forEach((se) => {
    se.sets.forEach((set) => {
      const cur = prMap.get(se.exerciseId);
      if (!cur || set.weight > cur.weight) {
        prMap.set(se.exerciseId, { weight: set.weight, reps: set.reps, date: s.date });
      }
    });
  }));
  const prList = exercises
    .filter((e) => prMap.has(e.id))
    .map((e) => ({ ...prMap.get(e.id), name: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Workout frequency per week (all weeks that have at least one session).
  const weekCounts = new Map();
  sessionsAsc.forEach((s) => {
    const wk = isoDate(getWeekStart(new Date(s.date)));
    weekCounts.set(wk, (weekCounts.get(wk) || 0) + 1);
  });
  const weekKeys = [...weekCounts.keys()].sort();

  // Cardio frequency per week, same pattern.
  const cardioWeekCounts = new Map();
  cardioAsc.forEach((s) => {
    const wk = isoDate(getWeekStart(new Date(s.date)));
    cardioWeekCounts.set(wk, (cardioWeekCounts.get(wk) || 0) + 1);
  });
  const cardioWeekKeys = [...cardioWeekCounts.keys()].sort();

  container.appendChild(el(`
    <div class="screen">
      <h1 class="screen-title">Progress</h1>

      <div class="section">
        <div class="section-title">Per-Exercise Trends</div>
        ${loggedExercises.length === 0 ? '<div class="empty-state">Log some workouts to see trends here.</div>' : `
          <div class="field">
            <select id="exercise-select">
              ${loggedExercises.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')}
            </select>
          </div>
          <div class="chart-wrap"><h4>Top Set Weight (lbs)</h4><canvas id="chart-weight" height="220"></canvas></div>
          <div class="chart-wrap"><h4>Estimated 1RM (lbs, Epley)</h4><canvas id="chart-1rm" height="220"></canvas></div>
          <div class="chart-wrap"><h4>Total Volume (lbs)</h4><canvas id="chart-volume" height="220"></canvas></div>
        `}
      </div>

      <div class="section">
        <div class="section-title">Zone 2 Cardio</div>
        ${cardioAsc.length === 0 ? '<div class="empty-state">Log some cardio to see trends here.</div>' : `
          <div class="chart-wrap"><h4>Minutes</h4><canvas id="chart-cardio-minutes" height="220"></canvas></div>
          <div class="chart-wrap"><h4>Incline (%)</h4><canvas id="chart-cardio-incline" height="220"></canvas></div>
          <div class="chart-wrap"><h4>Distance (mi)</h4><canvas id="chart-cardio-distance" height="220"></canvas></div>
        `}
        ${cardioWeekKeys.length === 0 ? '' : '<div class="chart-wrap"><h4>Cardio sessions per week</h4><canvas id="chart-cardio-freq" height="220"></canvas></div>'}
      </div>

      <div class="section">
        <div class="section-title">Body Metrics</div>
        ${bodyMetrics.length === 0 ? '<div class="empty-state">No body metric entries yet.</div>' : `
          <div class="chart-wrap"><h4>Body Weight (lbs)</h4><canvas id="chart-bw" height="220"></canvas></div>
          <div class="chart-wrap"><h4>Body Fat %</h4><canvas id="chart-bf" height="220"></canvas></div>
        `}
      </div>

      <div class="section">
        <div class="section-title">Workout Frequency</div>
        ${weekKeys.length === 0 ? '<div class="empty-state">No workouts logged yet.</div>' : '<div class="chart-wrap"><h4>Workouts per week</h4><canvas id="chart-freq" height="220"></canvas></div>'}
      </div>

      <div class="section">
        <div class="section-title">Personal Records</div>
        ${prList.length === 0 ? '<div class="empty-state">No PRs yet, get lifting.</div>' : `
          <ul class="pr-list">
            ${prList.map((p) => `<li><span>${escapeHtml(p.name)}</span><span class="pr-weight">${round1(p.weight)} lbs × ${p.reps}</span></li>`).join('')}
          </ul>
        `}
      </div>
    </div>
  `));

  let Chart;
  try {
    Chart = await loadChartJs();
  } catch (err) {
    console.warn('Chart.js failed to load (offline?):', err);
    container.querySelectorAll('.chart-wrap canvas').forEach((c) => {
      c.replaceWith(el('<p class="text-dim text-sm">Charts need a network connection the first time they load.</p>'));
    });
    return charts.destroyAll;
  }

  function renderExerciseCharts(exerciseId) {
    const points = sessionsAsc
      .map((s) => {
        const se = s.exercises.find((x) => x.exerciseId === exerciseId);
        if (!se || se.sets.length === 0) return null;
        const topWeight = Math.max(...se.sets.map((st) => st.weight));
        const best1rm = Math.max(...se.sets.map((st) => epley1RM(st.weight, st.reps)));
        const volume = se.sets.reduce((sum, st) => sum + st.weight * st.reps, 0);
        return { date: s.date, topWeight, best1rm, volume };
      })
      .filter(Boolean);

    const labels = points.map((p) => formatDate(p.date));
    charts.register(lineChart(Chart, container.querySelector('#chart-weight'), labels, points.map((p) => round1(p.topWeight)), CHART_COLORS.accent, 'lbs'));
    charts.register(lineChart(Chart, container.querySelector('#chart-1rm'), labels, points.map((p) => round1(p.best1rm)), CHART_COLORS.accent2, 'lbs'));
    charts.register(barChart(Chart, container.querySelector('#chart-volume'), labels, points.map((p) => round1(p.volume)), CHART_COLORS.accent, 'lbs'));
  }

  if (loggedExercises.length) {
    const select = container.querySelector('#exercise-select');
    renderExerciseCharts(select.value);
    select.addEventListener('change', () => {
      charts.destroyById(['chart-weight', 'chart-1rm', 'chart-volume']);
      renderExerciseCharts(select.value);
    });
  }

  if (cardioAsc.length) {
    const labels = cardioAsc.map((c) => formatDate(c.date));
    charts.register(lineChart(Chart, container.querySelector('#chart-cardio-minutes'), labels, cardioAsc.map((c) => c.minutes ?? null), CHART_COLORS.accent, 'min'));
    charts.register(lineChart(Chart, container.querySelector('#chart-cardio-incline'), labels, cardioAsc.map((c) => c.incline ?? null), CHART_COLORS.accent2, '%'));
    charts.register(lineChart(Chart, container.querySelector('#chart-cardio-distance'), labels, cardioAsc.map((c) => c.distance ?? null), CHART_COLORS.accent3, 'mi'));
  }

  if (bodyMetrics.length) {
    const bmAsc = [...bodyMetrics].sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = bmAsc.map((b) => formatDate(b.date));
    const weightGoal = settings.targetWeight != null
      ? [goalDataset(settings.targetWeight, labels.length, CHART_COLORS.goal, 'Goal')] : [];
    const bodyFatGoal = settings.targetBodyFat != null
      ? [goalDataset(settings.targetBodyFat, labels.length, CHART_COLORS.goal, 'Goal')] : [];
    charts.register(lineChart(Chart, container.querySelector('#chart-bw'), labels, bmAsc.map((b) => b.weight ?? null), CHART_COLORS.accent, 'lbs', { extraDatasets: weightGoal }));
    charts.register(lineChart(Chart, container.querySelector('#chart-bf'), labels, bmAsc.map((b) => b.bodyFatPercentage ?? null), CHART_COLORS.accent2, '%', { extraDatasets: bodyFatGoal }));
  }

  if (weekKeys.length) {
    const labels = weekKeys.map((wk) => formatDate(wk));
    const goal = [goalDataset(settings.weeklyWorkoutGoal, labels.length, CHART_COLORS.goal, 'Goal')];
    charts.register(barChart(Chart, container.querySelector('#chart-freq'), labels, weekKeys.map((wk) => weekCounts.get(wk)), CHART_COLORS.accent, 'workouts', { extraDatasets: goal }));
  }

  if (cardioWeekKeys.length) {
    const labels = cardioWeekKeys.map((wk) => formatDate(wk));
    const goal = [goalDataset(settings.cardioWeeklyGoal, labels.length, CHART_COLORS.goal, 'Goal')];
    charts.register(barChart(Chart, container.querySelector('#chart-cardio-freq'), labels, cardioWeekKeys.map((wk) => cardioWeekCounts.get(wk)), CHART_COLORS.accent3, 'sessions', { extraDatasets: goal }));
  }

  return charts.destroyAll;
}
