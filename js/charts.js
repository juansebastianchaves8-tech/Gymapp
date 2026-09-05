// Shared Chart.js bootstrapping, used by every screen with graphs
// (progress, nutrition, sleep, body metrics). Centralizes the CDN load,
// dark-theme styling, and goal-baseline-line support so all four screens
// stay visually and behaviorally consistent.

export const CHART_COLORS = {
  accent: '#00c88c',
  accent2: '#4da6ff',
  accent3: '#ffb84d',
  grid: '#232d38',
  text: '#8b98a5',
  // One consistent, distinct color for every goal/target baseline across
  // every chart in the app — deliberately not reused for any actual data
  // series, so a goal line never reads as ambiguous with real progress.
  goal: '#c084fc',
};

let chartJsPromise = null;

export function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartJsPromise) {
    chartJsPromise = import('https://cdn.jsdelivr.net/npm/chart.js@4/+esm').then((mod) => {
      const Chart = mod.Chart || mod.default;
      Chart.register(...(mod.registerables || []));
      window.Chart = Chart;
      return Chart;
    });
  }
  return chartJsPromise;
}

export function baseOptions(yLabel, { showLegend = false, yMin, yMax } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: showLegend, labels: { color: CHART_COLORS.text } } },
    scales: {
      x: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text, maxRotation: 0, autoSkip: true } },
      y: {
        grid: { color: CHART_COLORS.grid },
        ticks: { color: CHART_COLORS.text },
        min: yMin,
        max: yMax,
        title: yLabel ? { display: true, text: yLabel, color: CHART_COLORS.text } : undefined,
      },
    },
  };
}

// A dashed, pointless reference-line dataset for showing a goal/target
// value. `type: 'line'` makes this work when mixed into a bar chart too.
export function goalDataset(value, count, color = CHART_COLORS.goal, label = 'Target') {
  return {
    type: 'line',
    label,
    data: Array(count).fill(value),
    borderColor: color,
    borderDash: [6, 4],
    borderWidth: 2,
    pointRadius: 0,
    fill: false,
    tension: 0,
  };
}

export function lineChart(Chart, canvas, labels, data, color, yLabel, { extraDatasets = [], yMin, yMax } = {}) {
  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { data, borderColor: color, backgroundColor: color, pointRadius: 3, tension: 0.25, spanGaps: true },
        ...extraDatasets,
      ],
    },
    options: baseOptions(yLabel, { showLegend: extraDatasets.length > 0, yMin, yMax }),
  });
  return chart;
}

export function barChart(Chart, canvas, labels, data, color, yLabel, { extraDatasets = [] } = {}) {
  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: color }, ...extraDatasets] },
    options: baseOptions(yLabel, { showLegend: extraDatasets.length > 0 }),
  });
  return chart;
}

// Tracks Chart.js instances for a single screen render so they can be torn
// down cleanly (on route change, or a selective redraw like Progress's
// per-exercise dropdown). Create a fresh one per render call — don't share
// across renders.
export function createChartManager() {
  let instances = [];
  return {
    register(chart) {
      instances.push(chart);
      return chart;
    },
    destroyAll() {
      instances.forEach((c) => c.destroy());
      instances = [];
    },
    destroyById(canvasIds) {
      instances = instances.filter((c) => {
        const match = canvasIds.includes(c.canvas.id);
        if (match) c.destroy();
        return !match;
      });
    },
  };
}
