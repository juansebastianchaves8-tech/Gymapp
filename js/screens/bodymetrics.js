import { getBodyMetrics, saveBodyMetric, deleteBodyMetric, getSettings } from '../db.js';
import { el, uid, isoDate, formatDate } from '../util.js';
import { showToast } from '../components/toast.js';
import { triggerSync } from '../sync.js';
import { loadChartJs, CHART_COLORS, lineChart, goalDataset, createChartManager } from '../charts.js';

// Module-scoped for the same reason as nutrition.js/sleep.js: this screen
// re-renders itself in place on every save/delete.
const charts = createChartManager();

export async function renderBodyMetrics(container) {
  charts.destroyAll();
  const [entries, settings] = await Promise.all([getBodyMetrics(), getSettings()]);
  let editingId = null;

  container.appendChild(el(`
    <div class="screen">
      <h1 class="screen-title">Body Metrics</h1>

      <div class="card" id="entry-form">
        <h3 id="form-title">Log Entry</h3>
        <div class="field">
          <label>Date</label>
          <input type="date" id="f-date" value="${isoDate(new Date())}" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Weight (lbs)</label>
            <input type="number" min="0" step="0.1" id="f-weight" inputmode="decimal" />
          </div>
          <div class="field">
            <label>Body Fat % (optional)</label>
            <input type="number" min="0" max="100" step="0.1" id="f-bf" inputmode="decimal" />
          </div>
        </div>
        <div style="display:flex; gap:10px;">
          <button type="button" id="save-btn" class="btn btn-primary btn-block">Save Entry</button>
          <button type="button" id="cancel-btn" class="btn btn-secondary" hidden>Cancel</button>
        </div>
      </div>

      <div class="section mt-16">
        <div class="section-title">Trends</div>
        ${entries.length === 0 ? '<div class="empty-state">Log an entry to start seeing trends.</div>' : `
          <div class="chart-wrap"><h4>Body Weight (lbs)</h4><canvas id="chart-weight" height="200"></canvas></div>
          <div class="chart-wrap"><h4>Body Fat %</h4><canvas id="chart-bf" height="200"></canvas></div>
        `}
      </div>

      <div class="section">
        <div class="section-title">Entries</div>
        ${entries.length === 0 ? '<div class="empty-state">No entries yet.</div>' : '<ul class="list" id="entry-list"></ul>'}
      </div>
    </div>
  `));

  const els = {
    title: container.querySelector('#form-title'),
    date: container.querySelector('#f-date'),
    weight: container.querySelector('#f-weight'),
    bf: container.querySelector('#f-bf'),
    cancel: container.querySelector('#cancel-btn'),
  };

  function resetForm() {
    editingId = null;
    els.title.textContent = 'Log Entry';
    els.date.value = isoDate(new Date());
    els.weight.value = '';
    els.bf.value = '';
    els.cancel.hidden = true;
  }

  function loadIntoForm(entry) {
    editingId = entry.id;
    els.title.textContent = 'Edit Entry';
    els.date.value = isoDate(new Date(entry.date));
    els.weight.value = entry.weight ?? '';
    els.bf.value = entry.bodyFatPercentage ?? '';
    els.cancel.hidden = false;
  }

  els.cancel.addEventListener('click', resetForm);

  function reRender() { container.innerHTML = ''; renderBodyMetrics(container); }

  container.querySelector('#save-btn').addEventListener('click', async () => {
    const weight = els.weight.value ? Number(els.weight.value) : null;
    if (!els.date.value || weight === null) {
      showToast('Date and weight are required');
      return;
    }
    const bf = els.bf.value ? Number(els.bf.value) : null;
    await saveBodyMetric({
      id: editingId || uid(),
      date: new Date(els.date.value).toISOString(),
      weight,
      bodyFatPercentage: bf,
    });
    triggerSync();
    showToast('Entry saved');
    reRender();
  });

  if (entries.length) {
    const listEl = container.querySelector('#entry-list');
    entries.forEach((e) => {
      const row = el(`
        <li class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${formatDate(e.date, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            <div class="list-item-sub">${e.weight} lbs${e.bodyFatPercentage != null ? ` · ${e.bodyFatPercentage}% BF` : ''}</div>
          </div>
          <div class="list-item-actions">
            <button type="button" class="btn btn-secondary btn-sm edit-btn">Edit</button>
            <button type="button" class="icon-btn danger delete-btn" aria-label="Delete">✕</button>
          </div>
        </li>
      `);
      row.querySelector('.edit-btn').addEventListener('click', () => {
        loadIntoForm(e);
        window.scrollTo(0, 0);
      });
      row.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!confirm('Delete this entry?')) return;
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
      const asc = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
      const labels = asc.map((e) => formatDate(e.date));

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
