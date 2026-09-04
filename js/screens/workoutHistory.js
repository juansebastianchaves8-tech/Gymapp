import { getWorkoutSessions, getExercises, deleteWorkoutSession } from '../db.js';
import { el, escapeHtml, formatDate, round1 } from '../util.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';
import { triggerSync } from '../sync.js';

export async function renderWorkoutHistory(container) {
  const [sessions, exercises] = await Promise.all([getWorkoutSessions(), getExercises()]);
  const exName = (id) => exercises.find((e) => e.id === id)?.name || 'Unknown';

  container.appendChild(el(`
    <div class="screen">
      <h1 class="screen-title">Workout History</h1>
      ${sessions.length === 0 ? '<div class="empty-state">No workouts logged yet.</div>' : '<ul class="list" id="history-list"></ul>'}
      <div style="height:20px"></div>
    </div>
  `));

  if (!sessions.length) return;

  const listEl = container.querySelector('#history-list');
  sessions.forEach((s) => {
    const totalVolume = s.exercises.reduce((sum, se) => sum + se.sets.reduce((ss, st) => ss + st.weight * st.reps, 0), 0);
    const exNames = s.exercises.map((se) => exName(se.exerciseId)).join(', ');
    const item = el(`
      <li class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${formatDate(s.date, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          <div class="list-item-sub">${escapeHtml(exNames)}</div>
          <div class="list-item-sub">${round1(totalVolume)} lbs total volume</div>
        </div>
        <div class="list-item-actions">
          <button type="button" class="btn btn-secondary btn-sm edit-btn">Edit</button>
          <button type="button" class="icon-btn danger delete-btn" aria-label="Delete">✕</button>
        </div>
      </li>
    `);
    item.querySelector('.edit-btn').addEventListener('click', () => navigate(`/workout/edit/${s.id}`));
    item.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this workout?')) return;
      await deleteWorkoutSession(s.id);
      triggerSync();
      showToast('Workout deleted');
      item.remove();
    });
    listEl.appendChild(item);
  });
}
