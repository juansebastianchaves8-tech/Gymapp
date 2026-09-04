import { getBodyMetrics, saveBodyMetric, deleteBodyMetric } from '../db.js';
import { el, uid, isoDate, formatDate } from '../util.js';
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

export async function renderBodyMetrics(container) {
  destroyCharts();
  const entries = await getBodyMetrics();
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
      const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#232d38' }, ticks: { color: '#8b98a5' } }, y: { grid: { color: '#232d38' }, ticks: { color: '#8b98a5' } } } };

      chartInstances.push(new Chart(container.querySelector('#chart-weight'), {
        type: 'line',
        data: { labels, datasets: [{ data: asc.map((e) => e.weight), borderColor: '#00c88c', backgroundColor: '#00c88c', tension: 0.25, spanGaps: true }] },
        options: opts,
      }));
      chartInstances.push(new Chart(container.querySelector('#chart-bf'), {
        type: 'line',
        data: { labels, datasets: [{ data: asc.map((e) => e.bodyFatPercentage ?? null), borderColor: '#4da6ff', backgroundColor: '#4da6ff', tension: 0.25, spanGaps: true }] },
        options: opts,
      }));
    } catch (err) {
      console.warn('Chart.js failed to load (offline?):', err);
      container.querySelectorAll('.chart-wrap canvas').forEach((c) => {
        c.replaceWith(el('<p class="text-dim text-sm">Charts need a network connection the first time they load.</p>'));
      });
    }
  }

  return destroyCharts;
}
