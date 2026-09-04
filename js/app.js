import { ensureSeeded } from './db.js';
import { reconcileStreak } from './streak.js';
import { registerRoute, startRouter } from './router.js';
import { initSync, syncOnLoad } from './sync.js';

import { renderHome } from './screens/home.js';
import { renderWorkout } from './screens/workout.js';
import { renderWorkoutHistory } from './screens/workoutHistory.js';
import { renderRoutines, renderRoutineEditor } from './screens/routines.js';
import { renderProgress } from './screens/progress.js';
import { renderNutrition } from './screens/nutrition.js';
import { renderSleep } from './screens/sleep.js';
import { renderBodyMetrics } from './screens/bodymetrics.js';
import { renderSettings } from './screens/settings.js';
import { renderMore } from './screens/more.js';

async function boot() {
  await ensureSeeded();
  await reconcileStreak();

  registerRoute('/home', renderHome);
  registerRoute('/workout', renderWorkout);
  registerRoute('/workout/from/:routineId', renderWorkout);
  registerRoute('/workout/history', renderWorkoutHistory);
  registerRoute('/workout/edit/:sessionId', renderWorkout);
  registerRoute('/routines', renderRoutines);
  registerRoute('/routines/new', renderRoutineEditor);
  registerRoute('/routines/edit/:id', renderRoutineEditor);
  registerRoute('/progress', renderProgress);
  registerRoute('/nutrition', renderNutrition);
  registerRoute('/sleep', renderSleep);
  registerRoute('/body', renderBodyMetrics);
  registerRoute('/settings', renderSettings);
  registerRoute('/more', renderMore);

  startRouter(document.getElementById('app'));

  initSync();
  // Best-effort push on load if already signed in; silent no-op otherwise.
  syncOnLoad().catch((e) => console.warn('Drive sync skipped:', e));

  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const doRegister = () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(reg);
          }
        });
      });
    }).catch((e) => console.warn('SW registration failed:', e));
  };

  // As a deferred module script, app.js can run after 'load' has already
  // fired (readyState is already 'complete' by then) — waiting on the
  // event in that case would mean it never registers.
  if (document.readyState === 'complete') {
    doRegister();
  } else {
    window.addEventListener('load', doRegister);
  }

  // Only reload when *we* asked the waiting worker to take over (the user
  // tapped the update banner). Without this guard, the activate handler's
  // clients.claim() also fires controllerchange on a plain first install
  // (no prior controller), which would reload the page immediately every
  // time the app is opened fresh.
  let updateRequested = false;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.requestSwUpdate = (reg) => {
    updateRequested = true;
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  };
}

function showUpdateBanner(reg) {
  const banner = document.getElementById('update-banner');
  const btn = document.getElementById('update-banner-btn');
  banner.hidden = false;
  btn.onclick = () => window.requestSwUpdate(reg);
}

boot();
