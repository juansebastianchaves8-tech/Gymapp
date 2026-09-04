import { getRoutines, saveRoutine, deleteRoutine, getExercises } from '../db.js';
import { el, escapeHtml } from '../util.js';
import { navigate } from '../router.js';
import { pickExercise } from '../components/exercisePicker.js';
import { showToast } from '../components/toast.js';
import { triggerSync } from '../sync.js';

export async function renderRoutines(container) {
  const routines = await getRoutines();

  container.appendChild(el(`
    <div class="screen">
      <div class="row-between">
        <h1 class="screen-title">Routines</h1>
      </div>
      <button id="new-routine-btn" type="button" class="btn btn-primary btn-block mt-8">+ New Routine</button>
      <div class="section mt-16">
        ${routines.length === 0 ? '<div class="empty-state">No routines yet. Create one to speed up logging.</div>' : '<ul class="list" id="routine-list"></ul>'}
      </div>
    </div>
  `));

  container.querySelector('#new-routine-btn').addEventListener('click', () => navigate('/routines/new'));

  if (routines.length) {
    const listEl = container.querySelector('#routine-list');
    routines.forEach((r) => {
      const item = el(`
        <li class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(r.name)}</div>
            <div class="list-item-sub">${r.exercises.length} exercise${r.exercises.length === 1 ? '' : 's'}</div>
          </div>
          <div class="list-item-actions">
            <button type="button" class="btn btn-primary btn-sm start-btn">Start</button>
            <button type="button" class="btn btn-secondary btn-sm edit-btn">Edit</button>
          </div>
        </li>
      `);
      item.querySelector('.start-btn').addEventListener('click', () => navigate(`/workout/from/${r.id}`));
      item.querySelector('.edit-btn').addEventListener('click', () => navigate(`/routines/edit/${r.id}`));
      listEl.appendChild(item);
    });
  }
}

export async function renderRoutineEditor(container, params) {
  const isEdit = Boolean(params.id);
  const exercises = await getExercises();
  let routine = { id: null, name: '', exercises: [] };

  if (isEdit) {
    const routines = await getRoutines();
    const found = routines.find((r) => r.id === params.id);
    if (!found) {
      container.appendChild(el('<div class="screen"><p>Routine not found.</p></div>'));
      return;
    }
    routine = JSON.parse(JSON.stringify(found));
  }

  container.appendChild(el(`
    <div class="screen">
      <h1 class="screen-title">${isEdit ? 'Edit Routine' : 'New Routine'}</h1>
      <div class="field">
        <label>Routine name</label>
        <input type="text" id="routine-name" placeholder="e.g. Push Day A" value="${escapeHtml(routine.name)}" />
      </div>
      <div class="section-title">Exercises</div>
      <div id="routine-ex-list"></div>
      <button id="add-ex-btn" type="button" class="btn btn-secondary btn-block">+ Add Exercise</button>
      <div class="mt-16" style="display:flex; gap:10px;">
        <button id="save-btn" type="button" class="btn btn-primary btn-block">Save Routine</button>
      </div>
      ${isEdit ? '<button id="delete-btn" type="button" class="btn btn-danger btn-block mt-8">Delete Routine</button>' : ''}
      <div style="height:40px"></div>
    </div>
  `));

  const listEl = container.querySelector('#routine-ex-list');

  function renderExList() {
    listEl.innerHTML = '';
    if (routine.exercises.length === 0) {
      listEl.appendChild(el('<div class="empty-state text-sm">No exercises added yet.</div>'));
      return;
    }
    routine.exercises.forEach((re, idx) => {
      const ex = exercises.find((e) => e.id === re.exerciseId);
      const row = el(`
        <div class="exercise-block">
          <div class="exercise-header">
            <h3>${escapeHtml(ex ? ex.name : 'Unknown')}</h3>
            <button type="button" class="icon-btn danger remove-btn" aria-label="Remove">✕</button>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Target sets (optional)</label>
              <input type="number" min="0" class="target-sets" value="${re.targetSets ?? ''}" />
            </div>
            <div class="field">
              <label>Target reps (optional)</label>
              <input type="number" min="0" class="target-reps" value="${re.targetReps ?? ''}" />
            </div>
          </div>
        </div>
      `);
      row.querySelector('.remove-btn').addEventListener('click', () => {
        routine.exercises.splice(idx, 1);
        renderExList();
      });
      row.querySelector('.target-sets').addEventListener('input', (e) => {
        re.targetSets = e.target.value ? parseInt(e.target.value, 10) : null;
      });
      row.querySelector('.target-reps').addEventListener('input', (e) => {
        re.targetReps = e.target.value ? parseInt(e.target.value, 10) : null;
      });
      listEl.appendChild(row);
    });
  }
  renderExList();

  container.querySelector('#add-ex-btn').addEventListener('click', async () => {
    const chosen = await pickExercise(exercises);
    if (!chosen) return;
    if (routine.exercises.some((re) => re.exerciseId === chosen.id)) {
      showToast('Already in this routine');
      return;
    }
    routine.exercises.push({ exerciseId: chosen.id, targetSets: null, targetReps: null });
    renderExList();
  });

  container.querySelector('#save-btn').addEventListener('click', async () => {
    const name = container.querySelector('#routine-name').value.trim();
    if (!name) { showToast('Give the routine a name'); return; }
    if (routine.exercises.length === 0) { showToast('Add at least one exercise'); return; }
    routine.name = name;
    await saveRoutine(routine);
    triggerSync();
    showToast('Routine saved');
    navigate('/routines');
  });

  if (isEdit) {
    container.querySelector('#delete-btn').addEventListener('click', async () => {
      if (!confirm(`Delete "${routine.name}"?`)) return;
      await deleteRoutine(routine.id);
      triggerSync();
      showToast('Routine deleted');
      navigate('/routines');
    });
  }
}
