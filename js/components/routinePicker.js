import { escapeHtml } from '../util.js';
import { openModal, closeModal } from './modal.js';

// Opens a picker sheet over a pre-fetched `routines` array. Resolves with
// the chosen routine object, or null if dismissed / none exist.
export function pickRoutine(routines) {
  return new Promise((resolve) => {
    const sheet = openModal(`
      <h3>Add Routine</h3>
      <div id="routine-results" class="list" style="max-height:50vh; overflow-y:auto;">
        ${routines.length === 0 ? '<div class="empty-state text-sm">No saved routines yet. Create one from the Routines screen.</div>' : ''}
      </div>
    `);

    const results = sheet.querySelector('#routine-results');
    if (routines.length) {
      results.innerHTML = routines.map((r) => `
        <div class="list-item" data-id="${r.id}" style="cursor:pointer;">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(r.name)}</div>
            <div class="list-item-sub">${r.exercises.length} exercise${r.exercises.length === 1 ? '' : 's'}</div>
          </div>
        </div>
      `).join('');

      results.querySelectorAll('.list-item').forEach((node) => {
        node.addEventListener('click', () => {
          const routine = routines.find((r) => r.id === node.dataset.id);
          closeModal();
          resolve(routine || null);
        });
      });
    }

    sheet.closest('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) resolve(null);
    });
  });
}
