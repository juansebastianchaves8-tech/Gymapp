import { getNutritionEntries, saveNutritionEntry, deleteNutritionEntry, getSettings } from '../db.js';
import { el, getWeekStart, isoDate, formatWeekLabel } from '../util.js';
import { showToast } from '../components/toast.js';
import { triggerSync } from '../sync.js';
import { loadChartJs, CHART_COLORS, lineChart, goalDataset, createChartManager } from '../charts.js';

// Module-scoped: this screen re-renders itself in place on every save/
// delete (see reRender() below), so the manager must persist across those
// calls rather than being recreated fresh each time, or the previous
// render's Chart.js instances would never get destroyed.
const charts = createChartManager();

export async function renderNutrition(container) {
  charts.destroyAll();
  const [entries, settings] = await Promise.all([getNutritionEntries(), getSettings()]);
  const targets = settings.nutritionTargets || {};
  const currentWeekISO = isoDate(getWeekStart());
  let editingWeek = currentWeekISO;

  container.appendChild(el(`
    <div class="screen">
      <h1 class="screen-title">Nutrition</h1>

      <div class="card" id="entry-form">
        <div class="row-between">
          <h3 id="form-week-label">Week of ${formatWeekLabel(currentWeekISO)}</h3>
          <button type="button" id="reset-week-btn" class="btn btn-ghost btn-sm" hidden>This Week</button>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Avg Calories${targets.calories ? ` (target ${targets.calories})` : ''}</label>
            <input type="number" min="0" id="f-calories" inputmode="numeric" />
          </div>
          <div class="field">
            <label>Avg Protein (g)${targets.protein ? ` (target ${targets.protein})` : ''}</label>
            <input type="number" min="0" id="f-protein" inputmode="numeric" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Avg Carbs (g)${targets.carbs ? ` (target ${targets.carbs})` : ''}</label>
            <input type="number" min="0" id="f-carbs" inputmode="numeric" />
          </div>
          <div class="field">
            <label>Avg Fat (g)${targets.fat ? ` (target ${targets.fat})` : ''}</label>
            <input type="number" min="0" id="f-fat" inputmode="numeric" />
          </div>
        </div>
        <button type="button" id="save-btn" class="btn btn-primary btn-block">Save Week</button>
      </div>

      <div class="section mt-16">
        <div class="section-title">Trend</div>
        ${entries.length < 1 ? '<div class="empty-state">Log a week to start seeing trends.</div>' : `
          <div class="chart-wrap"><h4>Avg Calories</h4><canvas id="chart-cal" height="200"></canvas></div>
          <div class="chart-wrap"><h4>Macros (g)</h4><canvas id="chart-macro" height="200"></canvas></div>
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
    calories: container.querySelector('#f-calories'),
    protein: container.querySelector('#f-protein'),
    carbs: container.querySelector('#f-carbs'),
    fat: container.querySelector('#f-fat'),
  };

  function loadWeekIntoForm(weekISO) {
    editingWeek = weekISO;
    els.label.textContent = `Week of ${formatWeekLabel(weekISO)}`;
    els.reset.hidden = weekISO === currentWeekISO;
    const existing = entries.find((e) => e.weekStartDate === weekISO);
    els.calories.value = existing ? existing.avgCalories ?? '' : '';
    els.protein.value = existing ? existing.avgProtein ?? '' : '';
    els.carbs.value = existing ? existing.avgCarbs ?? '' : '';
    els.fat.value = existing ? existing.avgFat ?? '' : '';
  }
  loadWeekIntoForm(currentWeekISO);

  els.reset.addEventListener('click', () => loadWeekIntoForm(currentWeekISO));

  function reRender() {
    container.innerHTML = '';
    renderNutrition(container);
  }

  container.querySelector('#save-btn').addEventListener('click', async () => {
    const entry = {
      weekStartDate: editingWeek,
      avgCalories: els.calories.value ? Number(els.calories.value) : null,
      avgProtein: els.protein.value ? Number(els.protein.value) : null,
      avgCarbs: els.carbs.value ? Number(els.carbs.value) : null,
      avgFat: els.fat.value ? Number(els.fat.value) : null,
    };
    const existing = entries.find((e) => e.weekStartDate === editingWeek);
    if (existing) entry.id = existing.id;
    await saveNutritionEntry(entry);
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
            <div class="list-item-sub">${e.avgCalories ?? '–'} kcal · P${e.avgProtein ?? '–'} C${e.avgCarbs ?? '–'} F${e.avgFat ?? '–'}</div>
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
        await deleteNutritionEntry(e.id);
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

      const calCanvas = container.querySelector('#chart-cal');
      if (calCanvas) {
        const calGoal = targets.calories ? [goalDataset(targets.calories, labels.length, CHART_COLORS.goal, 'Target')] : [];
        charts.register(lineChart(Chart, calCanvas, labels, asc.map((e) => e.avgCalories), CHART_COLORS.accent, null, { extraDatasets: calGoal }));
      }
      const macroCanvas = container.querySelector('#chart-macro');
      if (macroCanvas) {
        // All goal lines share the one consistent goal color (not each
        // macro's own color) so a goal never reads as ambiguous with the
        // actual progress line — they're distinguished from each other by
        // their label and vertical position, not by color.
        const macroGoals = [
          targets.protein ? goalDataset(targets.protein, labels.length, CHART_COLORS.goal, 'Protein Goal') : null,
          targets.carbs ? goalDataset(targets.carbs, labels.length, CHART_COLORS.goal, 'Carbs Goal') : null,
          targets.fat ? goalDataset(targets.fat, labels.length, CHART_COLORS.goal, 'Fat Goal') : null,
        ].filter(Boolean);
        const chart = new Chart(macroCanvas, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: 'Protein', data: asc.map((e) => e.avgProtein), borderColor: CHART_COLORS.accent, backgroundColor: CHART_COLORS.accent, tension: 0.25, spanGaps: true },
              { label: 'Carbs', data: asc.map((e) => e.avgCarbs), borderColor: CHART_COLORS.accent2, backgroundColor: CHART_COLORS.accent2, tension: 0.25, spanGaps: true },
              { label: 'Fat', data: asc.map((e) => e.avgFat), borderColor: CHART_COLORS.accent3, backgroundColor: CHART_COLORS.accent3, tension: 0.25, spanGaps: true },
              ...macroGoals,
            ],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, labels: { color: CHART_COLORS.text } } }, scales: { x: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text } }, y: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text } } } },
        });
        charts.register(chart);
      }
    } catch (err) {
      console.warn('Chart.js failed to load (offline?):', err);
      container.querySelectorAll('.chart-wrap canvas').forEach((c) => {
        c.replaceWith(el('<p class="text-dim text-sm">Charts need a network connection the first time they load.</p>'));
      });
    }
  }

  return charts.destroyAll;
}
