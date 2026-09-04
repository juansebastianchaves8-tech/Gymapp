// Orchestrates Drive sync on top of drive.js: debounced push-on-change,
// pull-and-hydrate only for a genuinely fresh install, and the small
// header indicator. Silently does nothing whenever Drive isn't
// configured or the user isn't signed in.
import {
  isDriveConfigured, isSignedIn, signIn, signOut, pushStateToDrive, pullStateFromDrive,
} from './drive.js';
import {
  exportFullState, importFullState, getWorkoutSessions, getRoutines,
  getNutritionEntries, getSleepEntries, getBodyMetrics,
} from './db.js';

let debounceTimer = null;
let indicatorEl = null;

export function initSync() {
  indicatorEl = document.getElementById('sync-indicator');
  updateIndicator();
}

function setIndicator(state, text) {
  if (!indicatorEl) return;
  indicatorEl.hidden = false;
  indicatorEl.textContent = text;
  indicatorEl.className = `sync-indicator ${state}`;
}

function updateIndicator() {
  if (!indicatorEl) return;
  if (!isDriveConfigured()) { indicatorEl.hidden = true; return; }
  if (isSignedIn()) setIndicator('ok', 'Synced');
  else setIndicator('', 'Not signed in');
}

// Call after any local write. Debounces a full-state push to Drive so
// rapid successive edits (e.g. adding several sets) only trigger one
// upload.
export function triggerSync() {
  if (!isDriveConfigured() || !isSignedIn()) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doPush, 1500);
}

async function doPush() {
  try {
    setIndicator('syncing', 'Syncing...');
    const state = await exportFullState();
    await pushStateToDrive(state);
    setIndicator('ok', 'Synced');
  } catch (e) {
    console.warn('Drive sync failed:', e);
    setIndicator('error', 'Sync failed');
  }
}

async function isLocalDataEmpty() {
  const [sessions, routines, nutrition, sleep, body] = await Promise.all([
    getWorkoutSessions(), getRoutines(), getNutritionEntries(), getSleepEntries(), getBodyMetrics(),
  ]);
  return sessions.length === 0 && routines.length === 0 && nutrition.length === 0
    && sleep.length === 0 && body.length === 0;
}

// Called once on app boot. If a prior sign-in token is still valid, pushes
// current local state up so Drive reflects it. Never pulls here — a
// device with newer offline changes must not be clobbered by a stale
// Drive copy just because the app reopened.
export async function syncOnLoad() {
  updateIndicator();
  if (!isDriveConfigured() || !isSignedIn()) return;
  await doPush();
}

// Called from Settings when the user taps "Sign in with Google". Pulls
// and hydrates IndexedDB only when local data is empty (a fresh install
// with nothing to lose); otherwise treats this device's data as
// authoritative and pushes it up.
export async function connectDrive() {
  await signIn();
  updateIndicator();
  if (await isLocalDataEmpty()) {
    const remote = await pullStateFromDrive();
    if (remote) {
      await importFullState(remote);
      setIndicator('ok', 'Synced from Drive');
      return { pulled: true };
    }
  }
  await doPush();
  return { pulled: false };
}

export function disconnectDrive() {
  signOut();
  updateIndicator();
}

export { isDriveConfigured, isSignedIn };
