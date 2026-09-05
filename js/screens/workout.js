import {
  getExercises, getRoutines, getWorkoutSessions, saveWorkoutSession, deleteWorkoutSession,
  getCardioSessions, saveCardioSession, deleteCardioSession,
} from '../db.js';
import { el, uid, isoDate, formatDate, escapeHtml } from '../util.js';
import { navigate } from '../router.js';
import { pickExercise } from '../components/exercisePicker.js';
import { pickRoutine } from '../components/routinePicker.js';
import { triggerSync } from '../sync.js';
import { showToast } from '../components/toast.js';

function tabsBar(active) {
  return `
    <div class="tabs">
      <button type="button" class="tab-strength-btn ${active === 'strength' ? 'active' : ''}">Strength</button>
      <button type="button" class="tab-cardio-btn ${active === 'cardio' ? 'active' : ''}">Cardio</button>
    </div>
  `;
}

// Dispatches to Strength or Cardio logging. Only the bare /workout route
// (no routine/session params) shows the toggle at all — starting from a
// routine or editing an existing strength session always opens directly in
// Strength mode with no tab chrome.
export async function renderWorkout(container, params) {
  const isBareRoute = !params.routineId && !params.sessionId;
  const activeTab = isBareRoute && params.query?.tab === 'cardio' ? 'cardio' : 'strength';
  if (activeTab === 'cardio') return renderCardioLog(container);
  return renderStrengthWorkout(container, params, isBareRoute);
}

async function renderStrengthWorkout(container, params, tabsActive) {
  const exercises = await getExercises();
  let routine = null;
  let existingSession = null;

  if (params.sessionId) {
    const sessions = await getWorkoutSessions();
    existingSession = sessions.find((s) => s.id === params.sessionId) || null;
    if (!existingSession) {
      container.appendChild(el('<div class="screen"><p>Workout not found.</p></div>'));
      return;
    }
  } else if (params.routineId) {
    const routines = await getRoutines();
    routine = routines.find((r) => r.id === params.routineId) || null;
  }

  const isEdit = Boolean(existingSession);
  const draft = { exercises: [], date: existingSession ? existingSession.date : new Date().toISOString() };

  if (existingSession) {
    for (const se of existingSession.exercises) {
      const ex = exercises.find((e) => e.id === se.exerciseId);
      draft.exercises.push({
        key: uid(),
        exerciseId: se.exerciseId,
        name: ex ? ex.name : 'Unknown exercise',
        targetSets: null,
        targetReps: null,
        sets: se.sets.map((s) => ({ weight: String(s.weight), reps: String(s.reps) })),
      });
    }
  } else if (routine) {
    for (const re of routine.exercises) {
      const ex = exercises.find((e) => e.id === re.exerciseId);
      draft.exercises.push({
        key: uid(),
        exerciseId: re.exerciseId,
        name: ex ? ex.name : 'Unknown exercise',
        targetSets: re.targetSets || null,
        targetReps: re.targetReps || null,
        sets: [{ weight: '', reps: '' }],
      });
    }
  }

  const title = isEdit ? 'Edit Workout' : (routine ? routine.name : 'Log Workout');
  const dateValue = new Date(draft.date);
  const dateInputValue = `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}-${String(dateValue.getDate()).padStart(2, '0')}`;

  // Two top-level siblings here (the scrolling screen + the fixed footer),
  // so build via innerHTML directly rather than the el() helper, which
  // only returns a single root node.
  container.innerHTML = `
    <div class="screen">
      <div class="row-between">
        <h1 class="screen-title">${escapeHtml(title)}</h1>
        ${!isEdit ? '<a href="#/workout/history" class="text-sm">History</a>' : ''}
      </div>
      ${tabsActive ? tabsBar('strength') : ''}
      ${isEdit ? `
        <div class="field">
          <label>Date</label>
          <input type="date" id="session-date" value="${dateInputValue}" />
        </div>
      ` : ''}
      <div id="exercise-list"></div>
      <button id="add-exercise-btn" type="button" class="btn btn-secondary btn-block">+ Add Exercise</button>
      <button id="add-routine-btn" type="button" class="btn btn-secondary btn-block mt-8">+ Add Routine</button>
      ${isEdit ? '<button id="delete-session-btn" type="button" class="btn btn-danger btn-block mt-8">Delete Workout</button>' : ''}
      <div style="height:80px"></div>
    </div>
    <div class="fixed-footer">
      <button id="finish-btn" type="button" class="btn btn-primary btn-block">${isEdit ? 'Save Changes' : 'Finish Workout'}</button>
    </div>
  `;

  if (tabsActive) {
    container.querySelector('.tab-cardio-btn').addEventListener('click', () => navigate('/workout?tab=cardio'));
  }

  const listEl = container.querySelector('#exercise-list');

  function renderList() {
    listEl.innerHTML = '';
    draft.exercises.forEach((de) => {
      listEl.appendChild(renderExerciseBlock(de));
    });
  }

  function renderExerciseBlock(de) {
    const target = de.targetSets || de.targetReps
      ? `<div class="hint">Target: ${de.targetSets || '?'} x ${de.targetReps || '?'}</div>`
      : '';
    const block = el(`
      <div class="exercise-block" data-key="${de.key}">
        <div class="exercise-header">
          <div>
            <h3>${escapeHtml(de.name)}</h3>
            ${target}
          </div>
          <button type="button" class="icon-btn danger remove-exercise-btn" aria-label="Remove exercise">✕</button>
        </div>
        <div class="set-rows"></div>
        <button type="button" class="add-set-btn">+ Add Set</button>
      </div>
    `);

    const setRows = block.querySelector('.set-rows');
    de.sets.forEach((s, si) => setRows.appendChild(renderSetRow(de, si)));

    block.querySelector('.remove-exercise-btn').addEventListener('click', () => {
      draft.exercises = draft.exercises.filter((x) => x.key !== de.key);
      renderList();
    });
    block.querySelector('.add-set-btn').addEventListener('click', () => {
      const last = de.sets[de.sets.length - 1];
      de.sets.push({ weight: last ? last.weight : '', reps: last ? last.reps : '' });
      renderList();
    });

    return block;
  }

  function renderSetRow(de, si) {
    const row = el(`
      <div class="set-row">
        <span class="set-idx">${si + 1}</span>
        <input type="number" inputmode="decimal" placeholder="lbs" step="0.5" min="0" value="${de.sets[si].weight}" />
        <input type="number" inputmode="numeric" placeholder="reps" min="0" value="${de.sets[si].reps}" />
        <button type="button" class="icon-btn remove-set-btn" aria-label="Remove set">−</button>
      </div>
    `);
    const [weightInput, repsInput] = row.querySelectorAll('input');
    weightInput.addEventListener('input', () => { de.sets[si].weight = weightInput.value; });
    repsInput.addEventListener('input', () => { de.sets[si].reps = repsInput.value; });
    row.querySelector('.remove-set-btn').addEventListener('click', () => {
      de.sets.splice(si, 1);
      renderList();
    });
    return row;
  }

  renderList();

  container.querySelector('#add-exercise-btn').addEventListener('click', async () => {
    const chosen = await pickExercise(exercises);
    if (!chosen) return;
    if (draft.exercises.some((d) => d.exerciseId === chosen.id)) {
      showToast('Already added');
      return;
    }
    draft.exercises.push({
      key: uid(),
      exerciseId: chosen.id,
      name: chosen.name,
      targetSets: null,
      targetReps: null,
      sets: [{ weight: '', reps: '' }],
    });
    renderList();
  });

  container.querySelector('#add-routine-btn').addEventListener('click', async () => {
    const routines = await getRoutines();
    const chosen = await pickRoutine(routines);
    if (!chosen) return;

    let added = 0;
    let skipped = 0;
    for (const re of chosen.exercises) {
      if (draft.exercises.some((d) => d.exerciseId === re.exerciseId)) { skipped++; continue; }
      const ex = exercises.find((e) => e.id === re.exerciseId);
      draft.exercises.push({
        key: uid(),
        exerciseId: re.exerciseId,
        name: ex ? ex.name : 'Unknown exercise',
        targetSets: re.targetSets || null,
        targetReps: re.targetReps || null,
        sets: [{ weight: '', reps: '' }],
      });
      added++;
    }
    renderList();

    if (added === 0) {
      showToast('Already added');
    } else if (skipped > 0) {
      showToast(`Added ${added} exercise${added === 1 ? '' : 's'} (${skipped} already added)`);
    } else {
      showToast(`Added ${added} exercise${added === 1 ? '' : 's'} from ${escapeHtml(chosen.name)}`);
    }
  });

  if (isEdit) {
    container.querySelector('#delete-session-btn').addEventListener('click', async () => {
      if (!confirm('Delete this workout?')) return;
      await deleteWorkoutSession(existingSession.id);
      triggerSync();
      showToast('Workout deleted');
      navigate('/workout/history');
    });
  }

  container.querySelector('#finish-btn').addEventListener('click', async () => {
    const sessionExercises = draft.exercises
      .map((de) => ({
        exerciseId: de.exerciseId,
        sets: de.sets
          .filter((s) => s.weight !== '' && s.reps !== '' && !Number.isNaN(parseFloat(s.weight)) && !Number.isNaN(parseInt(s.reps, 10)))
          .map((s) => ({ weight: parseFloat(s.weight), reps: parseInt(s.reps, 10) })),
      }))
      .filter((de) => de.sets.length > 0);

    if (sessionExercises.length === 0) {
      showToast('Log at least one complete set (weight + reps)');
      return;
    }

    let sessionDate = draft.date;
    if (isEdit) {
      const dateStr = container.querySelector('#session-date').value;
      if (dateStr) {
        const original = new Date(draft.date);
        const [y, m, d] = dateStr.split('-').map(Number);
        original.setFullYear(y, m - 1, d);
        sessionDate = original.toISOString();
      }
    }

    await saveWorkoutSession({
      id: isEdit ? existingSession.id : uid(),
      date: sessionDate,
      exercises: sessionExercises,
    });
    triggerSync();
    showToast(isEdit ? 'Workout updated' : 'Workout saved');
    navigate(isEdit ? '/workout/history' : '/home');
  });
}

// Simple flat-record cardio logging (Zone 2 incline walk etc.) — modeled on
// the Body Metrics screen's form+list+edit+delete pattern rather than the
// multi-set strength logging above, since cardio entries are single
// records, not multi-exercise sessions. No charts here: cardio trends live
// entirely on the Progress screen.
async function renderCardioLog(container) {
  const entries = await getCardioSessions();
  let editingId = null;

  container.appendChild(el(`
    <div class="screen">
      <h1 class="screen-title">Zone 2 Cardio</h1>
      ${tabsBar('cardio')}

      <div class="card" id="entry-form">
        <h3 id="form-title">Log Cardio</h3>
        <div class="field">
          <label>Date</label>
          <input type="date" id="f-date" value="${isoDate(new Date())}" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Minutes</label>
            <input type="number" min="0" step="1" id="f-minutes" inputmode="numeric" />
          </div>
          <div class="field">
            <label>Incline (%)</label>
            <input type="number" min="0" step="0.5" id="f-incline" inputmode="decimal" />
          </div>
        </div>
        <div class="field">
          <label>Distance (mi)</label>
          <input type="number" min="0" step="0.1" id="f-distance" inputmode="decimal" />
        </div>
        <div style="display:flex; gap:10px;">
          <button type="button" id="save-btn" class="btn btn-primary btn-block">Save Entry</button>
          <button type="button" id="cancel-btn" class="btn btn-secondary" hidden>Cancel</button>
        </div>
      </div>

      <div class="section mt-16">
        <div class="section-title">Recent Cardio</div>
        ${entries.length === 0 ? '<div class="empty-state">No cardio logged yet.</div>' : '<ul class="list" id="entry-list"></ul>'}
      </div>
    </div>
  `));

  container.querySelector('.tab-strength-btn').addEventListener('click', () => navigate('/workout'));

  const els = {
    title: container.querySelector('#form-title'),
    date: container.querySelector('#f-date'),
    minutes: container.querySelector('#f-minutes'),
    incline: container.querySelector('#f-incline'),
    distance: container.querySelector('#f-distance'),
    cancel: container.querySelector('#cancel-btn'),
  };

  function resetForm() {
    editingId = null;
    els.title.textContent = 'Log Cardio';
    els.date.value = isoDate(new Date());
    els.minutes.value = '';
    els.incline.value = '';
    els.distance.value = '';
    els.cancel.hidden = true;
  }

  function loadIntoForm(entry) {
    editingId = entry.id;
    els.title.textContent = 'Edit Cardio';
    els.date.value = isoDate(new Date(entry.date));
    els.minutes.value = entry.minutes ?? '';
    els.incline.value = entry.incline ?? '';
    els.distance.value = entry.distance ?? '';
    els.cancel.hidden = false;
  }

  els.cancel.addEventListener('click', resetForm);

  function reRender() { container.innerHTML = ''; renderCardioLog(container); }

  container.querySelector('#save-btn').addEventListener('click', async () => {
    const minutes = els.minutes.value ? Number(els.minutes.value) : null;
    if (!els.date.value || minutes === null) {
      showToast('Date and minutes are required');
      return;
    }
    await saveCardioSession({
      id: editingId || uid(),
      date: new Date(els.date.value).toISOString(),
      minutes,
      incline: els.incline.value ? Number(els.incline.value) : null,
      distance: els.distance.value ? Number(els.distance.value) : null,
    });
    triggerSync();
    showToast('Cardio saved');
    reRender();
  });

  if (entries.length) {
    const listEl = container.querySelector('#entry-list');
    entries.forEach((e) => {
      const parts = [`${e.minutes} min`];
      if (e.incline != null) parts.push(`${e.incline}% incline`);
      if (e.distance != null) parts.push(`${e.distance} mi`);
      const row = el(`
        <li class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${formatDate(e.date, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            <div class="list-item-sub">${escapeHtml(parts.join(' · '))}</div>
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
        await deleteCardioSession(e.id);
        triggerSync();
        showToast('Deleted');
        reRender();
      });
      listEl.appendChild(row);
    });
  }
}
