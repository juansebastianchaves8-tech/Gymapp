import { getBodyMetrics, saveBodyMetric, deleteBodyMetric, getSettings } from '../db.js';
import { el, getWeekStart, isoDate, parseLocalDate, formatWeekLabel } from '../util.js';
import { showToast } from '../components/toast.js';
import { triggerSync } from '../sync.js';
import { loadChartJs, CHART_COLORS, lineChart, goalDataset, createChartManager } from '../charts.js';

// Module-scoped for the same reason as nutrition.js/sleep.js: this screen
// re-renders itself in place on every save/delete.
const charts = createChartManager();

export async function renderBodyMetrics(container) {
  charts.destroyAll();
  const [entries, settings] = await Promise.all([getBodyMetrics(), getSettings()]);
  const currentWeekISO = isoDate(getWeekStart());
  let editingWeek = currentWeekISO;

  container.appendChild(el(`
    <div class="screen">
      <h1 class="screen-title">Body Metrics</h1>

      <div class="card" id="entry-form">
        <div class="row-between">
          <h3 id="form-week-label">Week of ${formatWeekLabel(currentWeekISO)}</h3>
          <button type="button" id="reset-week-btn" class="btn btn-ghost btn-sm" hidden>This Week</button>
        </div>
        <div class="field">
          <label>Date (any day in the week)</label>
          <input type="date" id="f-date" value="${isoDate(new Date())}" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Avg Weight (lbs)</label>
            <input type="number" min="0" step="0.1" id="f-weight" inputmode="decimal" />
          </div>
          <div class="field">
            <label>Avg Body Fat % (optional)</label>
            <input type="number" min="0" max="100" step="0.1" id="f-bf" inputmode="decimal" />
          </div>
        </div>
        <button type="button" id="save-btn" class="btn btn-primary btn-block">Save Week</button>
      </div>

      <div class="section mt-16">
        <div class="section-title">Trends</div>
        ${entries.length === 0 ? '<div class="empty-state">Log a week to start seeing trends.</div>' : `
          <div class="chart-wrap"><h4>Avg Body Weight (lbs)</h4><canvas id="chart-weight" height="200"></canvas></div>
          <div class="chart-wrap"><h4>Avg Body Fat %</h4><canvas id="chart-bf" height="200"></canvas></div>
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
    date: container.querySelector('#f-date'),
    weight: container.querySelector('#f-weight'),
    bf: container.querySelector('#f-bf'),
  };

  function loadWeekIntoForm(weekISO) {
    const previousHadEntry = entries.some((e) => e.weekStartDate === editingWeek);
    editingWeek = weekISO;
    els.label.textContent = `Week of ${formatWeekLabel(weekISO)}`;
    els.reset.hidden = weekISO === currentWeekISO;
    const existing = entries.find((e) => e.weekStartDate === weekISO);
    // Moving between weeks with nothing saved keeps numbers already typed, so
    // the date can be picked after filling in the form.
    if (existing || previousHadEntry) {
      els.weight.value = existing ? existing.weight ?? '' : '';
      els.bf.value = existing ? existing.bodyFatPercentage ?? '' : '';
    }
  }
  loadWeekIntoForm(currentWeekISO);

  els.reset.addEventListener('click', () => {
    els.date.value = isoDate(new Date());
    loadWeekIntoForm(currentWeekISO);
  });

  els.date.addEventListener('change', () => {
    // A cleared date input has no week to log against; restore the current one.
    if (!els.date.value) {
      els.date.value = editingWeek;
      return;
    }
    const weekISO = isoDate(getWeekStart(parseLocalDate(els.date.value)));
    if (weekISO !== editingWeek) loadWeekIntoForm(weekISO);
  });

  function reRender() { container.innerHTML = ''; renderBodyMetrics(container); }

  container.querySelector('#save-btn').addEventListener('click', async () => {
    const weight = els.weight.value ? Number(els.weight.value) : null;
    if (weight === null) {
      showToast('Weight is required');
      return;
    }
    const bf = els.bf.value ? Number(els.bf.value) : null;
    const entry = { weekStartDate: editingWeek, weight, bodyFatPercentage: bf };
    const existing = entries.find((e) => e.weekStartDate === editingWeek);
    if (existing) entry.id = existing.id;
    await saveBodyMetric(entry);
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
            <div class="list-item-sub">${e.weight} lbs${e.bodyFatPercentage != null ? ` · ${e.bodyFatPercentage}% BF` : ''}</div>
          </div>
          <div class="list-item-actions">
            <button type="button" class="btn btn-secondary btn-sm edit-btn">Edit</button>
            <button type="button" class="icon-btn danger delete-btn" aria-label="Delete">✕</button>
          </div>
        </li>
      `);
      row.querySelector('.edit-btn').addEventListener('click', () => {
        els.date.value = e.weekStartDate;
        loadWeekIntoForm(e.weekStartDate);
        window.scrollTo(0, 0);
      });
      row.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!confirm('Delete this week\'s entry?')) return;
        await deleteBodyMetric(e.id);
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

      const weightGoal = settings.targetWeight != null
        ? [goalDataset(settings.targetWeight, labels.length, CHART_COLORS.goal, 'Target')] : [];
      const bodyFatGoal = settings.targetBodyFat != null
        ? [goalDataset(settings.targetBodyFat, labels.length, CHART_COLORS.goal, 'Target')] : [];

      charts.register(lineChart(Chart, container.querySelector('#chart-weight'), labels, asc.map((e) => e.weight), CHART_COLORS.accent, null, { extraDatasets: weightGoal }));
      charts.register(lineChart(Chart, container.querySelector('#chart-bf'), labels, asc.map((e) => e.bodyFatPercentage ?? null), CHART_COLORS.accent2, null, { extraDatasets: bodyFatGoal }));
    } catch (err) {
      console.warn('Chart.js failed to load (offline?):', err);
      container.querySelectorAll('.chart-wrap canvas').forEach((c) => {
        c.replaceWith(el('<p class="text-dim text-sm">Charts need a network connection the first time they load.</p>'));
      });
    }
  }

  return charts.destroyAll;
}
