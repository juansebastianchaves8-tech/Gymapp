import { getNutritionEntries, saveNutritionEntry, deleteNutritionEntry, getSettings } from '../db.js';
import { el, getWeekStart, isoDate, formatWeekLabel } from '../util.js';
import { showToast } from '../components/toast.js';
import { triggerSync } from '../sync.js';

let chartInstances = [];
async function loadChartJs() {
  if (window.Chart) return window.Chart;
  const mod = await import('https://cdn.jsdelivr.net/npm/chart.js@4/+esm');
  const Chart = mod.Chart || mod.default;
  Chart.register(...(mod.registerables || []));
  window.Chart = Chart;
  return Chart;
}
function destroyCharts() { chartInstances.forEach((c) => c.destroy()); chartInstances = []; }

export async function renderNutrition(container) {
  destroyCharts();
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

  function reRender() {
    container.innerHTML = '';
    renderNutrition(container);
  }

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
      chartInstances.push(new Chart(calCanvas, {
        type: 'line',
        data: { labels, datasets: [{ data: asc.map((e) => e.avgCalories), borderColor: '#00c88c', backgroundColor: '#00c88c', tension: 0.25, spanGaps: true }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#232d38' }, ticks: { color: '#8b98a5' } }, y: { grid: { color: '#232d38' }, ticks: { color: '#8b98a5' } } } },
      }));
    }
    const macroCanvas = container.querySelector('#chart-macro');
    if (macroCanvas) {
      chartInstances.push(new Chart(macroCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Protein', data: asc.map((e) => e.avgProtein), borderColor: '#00c88c', backgroundColor: '#00c88c', tension: 0.25, spanGaps: true },
            { label: 'Carbs', data: asc.map((e) => e.avgCarbs), borderColor: '#4da6ff', backgroundColor: '#4da6ff', tension: 0.25, spanGaps: true },
            { label: 'Fat', data: asc.map((e) => e.avgFat), borderColor: '#ffb84d', backgroundColor: '#ffb84d', tension: 0.25, spanGaps: true },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, labels: { color: '#8b98a5' } } }, scales: { x: { grid: { color: '#232d38' }, ticks: { color: '#8b98a5' } }, y: { grid: { color: '#232d38' }, ticks: { color: '#8b98a5' } } } },
      }));
    }
    } catch (err) {
      console.warn('Chart.js failed to load (offline?):', err);
      container.querySelectorAll('.chart-wrap canvas').forEach((c) => {
        c.replaceWith(el('<p class="text-dim text-sm">Charts need a network connection the first time they load.</p>'));
      });
    }
  }

  return destroyCharts;
}
