import { addExercise } from '../db.js';
import { escapeHtml } from '../util.js';
import { openModal, closeModal } from './modal.js';

const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Other'];

// Opens a picker sheet over `exercises` (array, may be mutated in place
// when a new custom exercise is added). Resolves with the chosen exercise
// object, or null if dismissed.
export function pickExercise(exercises) {
  return new Promise((resolve) => {
    const sheet = openModal(`
      <h3>Add Exercise</h3>
      <div class="field">
        <input type="text" id="ex-search" placeholder="Search exercises..." autocomplete="off" />
      </div>
      <div id="ex-results" class="list" style="max-height:40vh; overflow-y:auto;"></div>
      <hr class="divider" />
      <div class="field-row">
        <div class="field" style="flex:2;">
          <label>New exercise name</label>
          <input type="text" id="ex-new-name" placeholder="e.g. Cable Crossover" />
        </div>
        <div class="field" style="flex:1;">
          <label>Group</label>
          <select id="ex-new-group">
            ${MUSCLE_GROUPS.map((g) => `<option value="${g}">${g}</option>`).join('')}
          </select>
        </div>
      </div>
      <button id="ex-new-btn" class="btn btn-secondary btn-block">+ Create &amp; Add</button>
    `);

    const searchInput = sheet.querySelector('#ex-search');
    const results = sheet.querySelector('#ex-results');
    const newNameInput = sheet.querySelector('#ex-new-name');

    function renderResults(filter) {
      const f = filter.trim().toLowerCase();
      const matches = f ? exercises.filter((e) => e.name.toLowerCase().includes(f)) : exercises;
      results.innerHTML = matches.slice(0, 60).map((e) => `
        <div class="list-item" data-id="${e.id}" style="cursor:pointer;">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(e.name)}</div>
            <div class="list-item-sub">${escapeHtml(e.muscleGroup || '')}</div>
          </div>
        </div>
      `).join('') || '<div class="empty-state text-sm">No matches. Add it below.</div>';

      results.querySelectorAll('.list-item').forEach((node) => {
        node.addEventListener('click', () => {
          const ex = exercises.find((e) => e.id === node.dataset.id);
          closeModal();
          resolve(ex || null);
        });
      });
    }

    renderResults('');
    searchInput.addEventListener('input', () => {
      renderResults(searchInput.value);
      if (searchInput.value && !newNameInput.value) newNameInput.value = searchInput.value;
    });

    sheet.querySelector('#ex-new-btn').addEventListener('click', async () => {
      const name = newNameInput.value.trim();
      if (!name) { newNameInput.focus(); return; }
      const group = sheet.querySelector('#ex-new-group').value;
      const created = await addExercise(name, group);
      exercises.push(created);
      closeModal();
      resolve(created);
    });

    const onDismiss = () => resolve(null);
    sheet.closest('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) onDismiss();
    });
  });
}
