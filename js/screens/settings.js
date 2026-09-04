import { getSettings, updateSettings, exportFullState, importFullState } from '../db.js';
import { el } from '../util.js';
import { showToast } from '../components/toast.js';
import { isDriveConfigured, isSignedIn, connectDrive, disconnectDrive, triggerSync } from '../sync.js';

export async function renderSettings(container) {
  const settings = await getSettings();
  const targets = settings.nutritionTargets || {};
  const driveConfigured = isDriveConfigured();
  const signedIn = isSignedIn();

  container.appendChild(el(`
    <div class="screen">
      <h1 class="screen-title">Settings</h1>

      <div class="section">
        <div class="section-title">Streak Goal</div>
        <div class="card">
          <div class="field">
            <label>Weekly workout goal</label>
            <input type="number" min="1" id="goal-input" value="${settings.weeklyWorkoutGoal ?? 4}" />
            <div class="hint">Meet this many workouts Mon-Sun to keep your streak alive.</div>
          </div>
          <button type="button" id="save-goal-btn" class="btn btn-primary btn-block">Save Goal</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Nutrition Targets (optional)</div>
        <div class="card">
          <div class="field-row">
            <div class="field"><label>Calories</label><input type="number" min="0" id="t-cal" value="${targets.calories ?? ''}" /></div>
            <div class="field"><label>Protein (g)</label><input type="number" min="0" id="t-pro" value="${targets.protein ?? ''}" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Carbs (g)</label><input type="number" min="0" id="t-carb" value="${targets.carbs ?? ''}" /></div>
            <div class="field"><label>Fat (g)</label><input type="number" min="0" id="t-fat" value="${targets.fat ?? ''}" /></div>
          </div>
          <button type="button" id="save-targets-btn" class="btn btn-primary btn-block">Save Targets</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Cloud Sync</div>
        <div class="card">
          ${!driveConfigured ? `
            <p class="text-dim text-sm">Google Drive sync isn't set up yet. Add your OAuth Client ID to <code>js/config.js</code> once you've done the Google Cloud setup in the README, then reload.</p>
          ` : `
            <div class="card-row">
              <div>
                <div class="list-item-title">${signedIn ? 'Signed in' : 'Not signed in'}</div>
                <div class="list-item-sub">${signedIn ? 'Syncing to your Drive appDataFolder' : 'Sign in to back up and restore your data'}</div>
              </div>
              <button type="button" id="drive-btn" class="btn ${signedIn ? 'btn-secondary' : 'btn-primary'} btn-sm">${signedIn ? 'Sign Out' : 'Sign In'}</button>
            </div>
          `}
        </div>
      </div>

      <div class="section">
        <div class="section-title">Manual Backup</div>
        <div class="card">
          <p class="text-dim text-sm">Independent of Drive, export or restore a full JSON snapshot of your data.</p>
          <div style="display:flex; gap:10px; margin-top:10px;">
            <button type="button" id="export-btn" class="btn btn-secondary btn-block">Export JSON</button>
            <button type="button" id="import-btn" class="btn btn-secondary btn-block">Import JSON</button>
          </div>
          <input type="file" id="import-file" accept="application/json" hidden />
        </div>
      </div>

      <div class="section">
        <div class="section-title">Manage Past Entries</div>
        <div class="card">
          <ul class="list">
            <li class="list-item"><a href="#/workout/history">Workouts</a></li>
            <li class="list-item"><a href="#/nutrition">Nutrition</a></li>
            <li class="list-item"><a href="#/sleep">Sleep</a></li>
            <li class="list-item"><a href="#/body">Body Metrics</a></li>
          </ul>
        </div>
      </div>
    </div>
  `));

  container.querySelector('#save-goal-btn').addEventListener('click', async () => {
    const goal = parseInt(container.querySelector('#goal-input').value, 10);
    if (!goal || goal < 1) { showToast('Enter a valid goal'); return; }
    await updateSettings({ weeklyWorkoutGoal: goal });
    triggerSync();
    showToast('Goal saved');
  });

  container.querySelector('#save-targets-btn').addEventListener('click', async () => {
    const val = (id) => {
      const v = container.querySelector(id).value;
      return v ? Number(v) : null;
    };
    await updateSettings({
      nutritionTargets: {
        calories: val('#t-cal'), protein: val('#t-pro'), carbs: val('#t-carb'), fat: val('#t-fat'),
      },
    });
    triggerSync();
    showToast('Targets saved');
  });

  if (driveConfigured) {
    container.querySelector('#drive-btn').addEventListener('click', async () => {
      try {
        if (signedIn) {
          disconnectDrive();
          showToast('Signed out');
        } else {
          const result = await connectDrive();
          showToast(result.pulled ? 'Signed in, restored from Drive' : 'Signed in');
        }
      } catch (e) {
        console.error(e);
        showToast('Google sign-in failed');
      }
      container.innerHTML = '';
      renderSettings(container);
    });
  }

  container.querySelector('#export-btn').addEventListener('click', async () => {
    const state = await exportFullState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gymapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Exported');
  });

  const fileInput = container.querySelector('#import-file');
  container.querySelector('#import-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!confirm('Importing will replace all current data on this device. Continue?')) {
      fileInput.value = '';
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importFullState(data);
      triggerSync();
      showToast('Import complete');
      container.innerHTML = '';
      renderSettings(container);
    } catch (e) {
      console.error(e);
      showToast('Import failed: invalid file');
    }
    fileInput.value = '';
  });
}
