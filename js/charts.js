// Shared Chart.js bootstrapping, used by every screen with graphs
// (progress, nutrition, sleep, body metrics). Centralizes the CDN load,
// dark-theme styling, and goal-baseline-line support so all four screens
// stay visually and behaviorally consistent.

// Colors come from CSS variables in style.css, so charts follow the light or
// dark theme. Read when each chart is created.
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const CHART_COLORS = {
  get accent() { return cssVar('--chart-1'); },
  get accent2() { return cssVar('--chart-2'); },
  get accent3() { return cssVar('--chart-3'); },
  get grid() { return cssVar('--chart-grid'); },
  get text() { return cssVar('--chart-text'); },
  // One consistent, distinct color for every goal/target baseline across
  // every chart in the app — deliberately not reused for any actual data
  // series, so a goal line never reads as ambiguous with real progress.
  get goal() { return cssVar('--chart-goal'); },
};

// Draws each goal dataset as a dashed line across the full plot width. Drawing
// it as an ordinary line series fails in two cases: with a single data point
// there's no segment to draw, and it only spans from the first point to the
// last.
const goalLinePlugin = {
  id: 'goalLines',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.isGoal || !chart.isDatasetVisible(i)) return;
      const y = scales.y.getPixelForValue(ds.goalValue);
      if (y < chartArea.top || y > chartArea.bottom) return;
      ctx.save();
      ctx.strokeStyle = ds.borderColor;
      ctx.lineWidth = ds.borderWidth;
      ctx.setLineDash(ds.borderDash);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.restore();
    });
  },
};

let chartJsPromise = null;

export function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartJsPromise) {
    chartJsPromise = import('https://cdn.jsdelivr.net/npm/chart.js@4/+esm').then((mod) => {
      const Chart = mod.Chart || mod.default;
      Chart.register(...(mod.registerables || []), goalLinePlugin);
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
        // Room above and below the data, so a goal just outside the data's
        // range doesn't land on the edge of the plot where it can't be seen.
        grace: '10%',
        min: yMin,
        max: yMax,
        title: yLabel ? { display: true, text: yLabel, color: CHART_COLORS.text } : undefined,
      },
    },
  };
}

// A goal/target reference line. The dataset itself draws nothing: it keeps the
// goal in the legend and the y-axis range, and goalLinePlugin draws the line.
// `type: 'line'` makes this work when mixed into a bar chart too.
export function goalDataset(value, count, color = CHART_COLORS.goal, label = 'Target') {
  return {
    type: 'line',
    label,
    isGoal: true,
    goalValue: value,
    data: Array(count).fill(value),
    borderColor: color,
    borderDash: [6, 4],
    borderWidth: 2,
    showLine: false,
    pointRadius: 0,
    fill: false,
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
