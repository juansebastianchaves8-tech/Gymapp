import { getSleepEntries, saveSleepEntry, deleteSleepEntry, getSettings } from '../db.js';
import { el, getWeekStart, isoDate, formatWeekLabel } from '../util.js';
import { showToast } from '../components/toast.js';
import { triggerSync } from '../sync.js';
import { loadChartJs, CHART_COLORS, lineChart, goalDataset, createChartManager } from '../charts.js';

// Module-scoped for the same reason as nutrition.js: this screen re-renders
// itself in place on every save/delete, so the manager must persist across
// those calls.
const charts = createChartManager();

export async function renderSleep(container) {
  charts.destroyAll();
  const [entries, settings] = await Promise.all([getSleepEntries(), getSettings()]);
  const currentWeekISO = isoDate(getWeekStart());
  let editingWeek = currentWeekISO;

  container.appendChild(el(`
    <div class="screen">
      <h1 class="screen-title">Sleep</h1>

      <div class="card" id="entry-form">
        <div class="row-between">
          <h3 id="form-week-label">Week of ${formatWeekLabel(currentWeekISO)}</h3>
          <button type="button" id="reset-week-btn" class="btn btn-ghost btn-sm" hidden>This Week</button>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Avg Hours Slept</label>
            <input type="number" min="0" max="24" step="0.1" id="f-hours" inputmode="decimal" />
          </div>
          <div class="field">
            <label>Avg Quality (1-5)</label>
            <input type="number" min="1" max="5" step="1" id="f-quality" inputmode="numeric" />
          </div>
        </div>
        <button type="button" id="save-btn" class="btn btn-primary btn-block">Save Week</button>
      </div>

      <div class="section mt-16">
        <div class="section-title">Trend</div>
        ${entries.length < 1 ? '<div class="empty-state">Log a week to start seeing trends.</div>' : `
          <div class="chart-wrap"><h4>Avg Hours Slept</h4><canvas id="chart-hours" height="200"></canvas></div>
          <div class="chart-wrap"><h4>Avg Sleep Quality (1-5)</h4><canvas id="chart-quality" height="200"></canvas></div>
        `}
      </div>

      <div class="section">
        <div class="section-title">Weekly Summary</div>
        ${entries.length === 0 ? '<div class="empty-state">No entries yet.</div>' : '<ul class="list" id="entry-list"></ul>'}
      </div>
    </div>
  `));

  const els = {
    label: container.querySelector('#form-week-label'),
    reset: container.querySelector('#reset-week-btn'),
    hours: container.querySelector('#f-hours'),
    quality: container.querySelector('#f-quality'),
  };

  function loadWeekIntoForm(weekISO) {
    editingWeek = weekISO;
    els.label.textContent = `Week of ${formatWeekLabel(weekISO)}`;
    els.reset.hidden = weekISO === currentWeekISO;
    const existing = entries.find((e) => e.weekStartDate === weekISO);
    els.hours.value = existing ? existing.avgHoursSlept ?? '' : '';
    els.quality.value = existing ? existing.avgQuality ?? '' : '';
  }
  loadWeekIntoForm(currentWeekISO);
  els.reset.addEventListener('click', () => loadWeekIntoForm(currentWeekISO));

  function reRender() { container.innerHTML = ''; renderSleep(container); }

  container.querySelector('#save-btn').addEventListener('click', async () => {
    const hours = els.hours.value ? Number(els.hours.value) : null;
    const quality = els.quality.value ? Number(els.quality.value) : null;
    if (quality !== null && (quality < 1 || quality > 5)) {
      showToast('Quality must be 1-5');
      return;
    }
    const entry = { weekStartDate: editingWeek, avgHoursSlept: hours, avgQuality: quality };
    const existing = entries.find((e) => e.weekStartDate === editingWeek);
    if (existing) entry.id = existing.id;
    await saveSleepEntry(entry);
    triggerSync();
    showToast('Week saved');
    reRender();
  });

  if (entries.length) {
    const listEl = container.querySelector('#entry-list');
    entries.forEach((e) => {
      const row = el(`
        <li class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${formatWeekLabel(e.weekStartDate)}</div>
            <div class="list-item-sub">${e.avgHoursSlept ?? '–'} hrs · quality ${e.avgQuality ?? '–'}/5</div>
          </div>
          <div class="list-item-actions">
            <button type="button" class="btn btn-secondary btn-sm edit-btn">Edit</button>
            <button type="button" class="icon-btn danger delete-btn" aria-label="Delete">✕</button>
          </div>
        </li>
      `);
      row.querySelector('.edit-btn').addEventListener('click', () => {
        loadWeekIntoForm(e.weekStartDate);
        window.scrollTo(0, 0);
      });
      row.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!confirm('Delete this week\'s entry?')) return;
        await deleteSleepEntry(e.id);
        triggerSync();
        showToast('Deleted');
        reRender();
      });
      listEl.appendChild(row);
    });
  }

  if (entries.length) {
    try {
      const Chart = await loadChartJs();
      const asc = [...entries].sort((a, b) => new Date(a.weekStartDate) - new Date(b.weekStartDate));
      const labels = asc.map((e) => formatWeekLabel(e.weekStartDate).split(' - ')[0]);

      const hoursGoal = settings.sleepHoursTarget != null
        ? [goalDataset(settings.sleepHoursTarget, labels.length, CHART_COLORS.goal, 'Target')] : [];
      charts.register(lineChart(Chart, container.querySelector('#chart-hours'), labels, asc.map((e) => e.avgHoursSlept), CHART_COLORS.accent, null, { extraDatasets: hoursGoal }));

      // No baseline on sleep quality — only avg hours has a settable target.
      charts.register(lineChart(Chart, container.querySelector('#chart-quality'), labels, asc.map((e) => e.avgQuality), CHART_COLORS.accent2, null, { yMin: 1, yMax: 5 }));
    } catch (err) {
      console.warn('Chart.js failed to load (offline?):', err);
      container.querySelectorAll('.chart-wrap canvas').forEach((c) => {
        c.replaceWith(el('<p class="text-dim text-sm">Charts need a network connection the first time they load.</p>'));
      });
    }
  }

  return charts.destroyAll;
}
