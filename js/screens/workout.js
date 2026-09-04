import { getExercises, getRoutines, getWorkoutSessions, saveWorkoutSession, deleteWorkoutSession } from '../db.js';
import { el, uid, escapeHtml } from '../util.js';
import { navigate } from '../router.js';
import { pickExercise } from '../components/exercisePicker.js';
import { triggerSync } from '../sync.js';
import { showToast } from '../components/toast.js';

export async function renderWorkout(container, params) {
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
      ${isEdit ? `
        <div class="field">
          <label>Date</label>
          <input type="date" id="session-date" value="${dateInputValue}" />
        </div>
      ` : ''}
      <div id="exercise-list"></div>
      <button id="add-exercise-btn" type="button" class="btn btn-secondary btn-block">+ Add Exercise</button>
      ${isEdit ? '<button id="delete-session-btn" type="button" class="btn btn-danger btn-block mt-8">Delete Workout</button>' : ''}
      <div style="height:80px"></div>
    </div>
    <div class="fixed-footer">
      <button id="finish-btn" type="button" class="btn btn-primary btn-block">${isEdit ? 'Save Changes' : 'Finish Workout'}</button>
    </div>
  `;

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
