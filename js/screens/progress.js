import { getWorkoutSessions, getExercises, getBodyMetrics } from '../db.js';
import { el, epley1RM, round1, getWeekStart, isoDate, formatDate, escapeHtml } from '../util.js';

let chartInstances = [];

async function loadChartJs() {
  if (window.Chart) return window.Chart;
  const mod = await import('https://cdn.jsdelivr.net/npm/chart.js@4/+esm');
  const Chart = mod.Chart || mod.default;
  Chart.register(...(mod.registerables || []));
  window.Chart = Chart;
  return Chart;
}

function destroyCharts() {
  chartInstances.forEach((c) => c.destroy());
  chartInstances = [];
}

const CHART_COLORS = {
  accent: '#00c88c',
  accent2: '#4da6ff',
  grid: '#232d38',
  text: '#8b98a5',
};

function baseOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text, maxRotation: 0, autoSkip: true } },
      y: {
        grid: { color: CHART_COLORS.grid },
        ticks: { color: CHART_COLORS.text },
        title: yLabel ? { display: true, text: yLabel, color: CHART_COLORS.text } : undefined,
      },
    },
  };
}

function lineChart(Chart, canvas, labels, data, color, yLabel) {
  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        backgroundColor: color,
        pointRadius: 3,
        tension: 0.25,
        spanGaps: true,
      }],
    },
    options: baseOptions(yLabel),
  });
  chartInstances.push(chart);
  return chart;
}

function barChart(Chart, canvas, labels, data, color, yLabel) {
  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: color }] },
    options: baseOptions(yLabel),
  });
  chartInstances.push(chart);
  return chart;
}

export async function renderProgress(container) {
  destroyCharts();
  const [sessions, exercises, bodyMetrics] = await Promise.all([
    getWorkoutSessions(), getExercises(), getBodyMetrics(),
  ]);
  const sessionsAsc = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));

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
    return destroyCharts;
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
    lineChart(Chart, container.querySelector('#chart-weight'), labels, points.map((p) => round1(p.topWeight)), CHART_COLORS.accent, 'lbs');
    lineChart(Chart, container.querySelector('#chart-1rm'), labels, points.map((p) => round1(p.best1rm)), CHART_COLORS.accent2, 'lbs');
    barChart(Chart, container.querySelector('#chart-volume'), labels, points.map((p) => round1(p.volume)), CHART_COLORS.accent, 'lbs');
  }

  if (loggedExercises.length) {
    const select = container.querySelector('#exercise-select');
    renderExerciseCharts(select.value);
    select.addEventListener('change', () => {
      // Only destroy/recreate the three per-exercise charts, not all charts.
      chartInstances = chartInstances.filter((c) => {
        const isPerExercise = ['chart-weight', 'chart-1rm', 'chart-volume'].includes(c.canvas.id);
        if (isPerExercise) c.destroy();
        return !isPerExercise;
      });
      renderExerciseCharts(select.value);
    });
  }

  if (bodyMetrics.length) {
    const bmAsc = [...bodyMetrics].sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = bmAsc.map((b) => formatDate(b.date));
    lineChart(Chart, container.querySelector('#chart-bw'), labels, bmAsc.map((b) => b.weight ?? null), CHART_COLORS.accent, 'lbs');
    lineChart(Chart, container.querySelector('#chart-bf'), labels, bmAsc.map((b) => b.bodyFatPercentage ?? null), CHART_COLORS.accent2, '%');
  }

  if (weekKeys.length) {
    const labels = weekKeys.map((wk) => formatDate(wk));
    barChart(Chart, container.querySelector('#chart-freq'), labels, weekKeys.map((wk) => weekCounts.get(wk)), CHART_COLORS.accent, 'workouts');
  }

  return destroyCharts;
}
