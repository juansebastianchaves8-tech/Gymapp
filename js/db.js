// IndexedDB access layer, built on the `idb` promise wrapper (loaded from
// CDN as an ES module, no bundler needed). This is the single source of
// truth for reads/writes while using the app.
import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';
import { uid, getWeekStart, isoDate } from './util.js';
import { DEFAULT_EXERCISES } from './exercises-seed.js';

const DB_NAME = 'gymapp';
const DB_VERSION = 1;
const SETTINGS_ID = 'main';

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('exercises')) {
          const s = db.createObjectStore('exercises', { keyPath: 'id' });
          s.createIndex('name', 'name');
        }
        if (!db.objectStoreNames.contains('routines')) {
          db.createObjectStore('routines', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('workoutSessions')) {
          const s = db.createObjectStore('workoutSessions', { keyPath: 'id' });
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('nutritionEntries')) {
          const s = db.createObjectStore('nutritionEntries', { keyPath: 'id' });
          s.createIndex('weekStartDate', 'weekStartDate', { unique: true });
        }
        if (!db.objectStoreNames.contains('sleepEntries')) {
          const s = db.createObjectStore('sleepEntries', { keyPath: 'id' });
          s.createIndex('weekStartDate', 'weekStartDate', { unique: true });
        }
        if (!db.objectStoreNames.contains('bodyMetrics')) {
          const s = db.createObjectStore('bodyMetrics', { keyPath: 'id' });
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// Runs once per app load: seeds default exercises + default settings row
// if this is a fresh install.
export async function ensureSeeded() {
  const db = await getDB();

  const exCount = await db.count('exercises');
  if (exCount === 0) {
    const tx = db.transaction('exercises', 'readwrite');
    for (const ex of DEFAULT_EXERCISES) {
      tx.store.put({ id: uid(), name: ex.name, muscleGroup: ex.muscleGroup, isCustom: false });
    }
    await tx.done;
  }

  const settings = await db.get('settings', SETTINGS_ID);
  if (!settings) {
    await db.put('settings', {
      id: SETTINGS_ID,
      weeklyWorkoutGoal: 4,
      nutritionTargets: { calories: null, protein: null, carbs: null, fat: null },
      streakCount: 0,
      lastStreakWeekChecked: isoDate(getWeekStart()),
    });
  }
}

// ---- Generic helpers ----
export async function getAll(store) {
  return (await getDB()).getAll(store);
}
export async function getOne(store, id) {
  return (await getDB()).get(store, id);
}
export async function put(store, value) {
  const db = await getDB();
  await db.put(store, value);
  return value;
}
export async function remove(store, id) {
  const db = await getDB();
  await db.delete(store, id);
}

// ---- Settings ----
export async function getSettings() {
  const db = await getDB();
  return db.get('settings', SETTINGS_ID);
}
export async function updateSettings(patch) {
  const db = await getDB();
  const current = (await db.get('settings', SETTINGS_ID)) || { id: SETTINGS_ID };
  const next = { ...current, ...patch, id: SETTINGS_ID };
  await db.put('settings', next);
  return next;
}

// ---- Exercises ----
export async function getExercises() {
  const db = await getDB();
  const all = await db.getAll('exercises');
  return all.sort((a, b) => a.name.localeCompare(b.name));
}
export async function addExercise(name, muscleGroup = 'Other') {
  const exercise = { id: uid(), name: name.trim(), muscleGroup, isCustom: true };
  await put('exercises', exercise);
  return exercise;
}

// ---- Routines ----
export async function getRoutines() {
  return getAll('routines');
}
export async function saveRoutine(routine) {
  const toSave = routine.id ? routine : { ...routine, id: uid() };
  await put('routines', toSave);
  return toSave;
}
export async function deleteRoutine(id) {
  return remove('routines', id);
}

// ---- Workout sessions ----
export async function getWorkoutSessions() {
  const all = await getAll('workoutSessions');
  return all.sort((a, b) => new Date(b.date) - new Date(a.date));
}
export async function saveWorkoutSession(session) {
  const toSave = session.id ? session : { ...session, id: uid() };
  await put('workoutSessions', toSave);
  return toSave;
}
export async function deleteWorkoutSession(id) {
  return remove('workoutSessions', id);
}

// ---- Nutrition entries (one per Mon-Sun week) ----
export async function getNutritionEntries() {
  const all = await getAll('nutritionEntries');
  return all.sort((a, b) => new Date(b.weekStartDate) - new Date(a.weekStartDate));
}
export async function saveNutritionEntry(entry) {
  // Enforce one entry per week: reuse existing id if a row for that
  // weekStartDate already exists.
  const all = await getAll('nutritionEntries');
  const existing = all.find((e) => e.weekStartDate === entry.weekStartDate && e.id !== entry.id);
  const toSave = { ...entry, id: entry.id || existing?.id || uid() };
  await put('nutritionEntries', toSave);
  return toSave;
}
export async function deleteNutritionEntry(id) {
  return remove('nutritionEntries', id);
}

// ---- Sleep entries (one per Mon-Sun week) ----
export async function getSleepEntries() {
  const all = await getAll('sleepEntries');
  return all.sort((a, b) => new Date(b.weekStartDate) - new Date(a.weekStartDate));
}
export async function saveSleepEntry(entry) {
  const all = await getAll('sleepEntries');
  const existing = all.find((e) => e.weekStartDate === entry.weekStartDate && e.id !== entry.id);
  const toSave = { ...entry, id: entry.id || existing?.id || uid() };
  await put('sleepEntries', toSave);
  return toSave;
}
export async function deleteSleepEntry(id) {
  return remove('sleepEntries', id);
}

// ---- Body metrics ----
export async function getBodyMetrics() {
  const all = await getAll('bodyMetrics');
  return all.sort((a, b) => new Date(b.date) - new Date(a.date));
}
export async function saveBodyMetric(entry) {
  const toSave = entry.id ? entry : { ...entry, id: uid() };
  await put('bodyMetrics', toSave);
  return toSave;
}
export async function deleteBodyMetric(id) {
  return remove('bodyMetrics', id);
}

// ---- Full-state export/import (used by both Drive sync and manual JSON) ----
export async function exportFullState() {
  const db = await getDB();
  const [exercises, routines, workoutSessions, nutritionEntries, sleepEntries, bodyMetrics, settings] = await Promise.all([
    db.getAll('exercises'),
    db.getAll('routines'),
    db.getAll('workoutSessions'),
    db.getAll('nutritionEntries'),
    db.getAll('sleepEntries'),
    db.getAll('bodyMetrics'),
    db.get('settings', SETTINGS_ID),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises, routines, workoutSessions, nutritionEntries, sleepEntries, bodyMetrics,
    settings: settings || null,
  };
}

// Replaces all local data with the given full-state snapshot (last-full-
// state-wins, single-device app: no merge logic).
export async function importFullState(state) {
  const db = await getDB();
  const stores = ['exercises', 'routines', 'workoutSessions', 'nutritionEntries', 'sleepEntries', 'bodyMetrics', 'settings'];
  const tx = db.transaction(stores, 'readwrite');
  for (const name of ['exercises', 'routines', 'workoutSessions', 'nutritionEntries', 'sleepEntries', 'bodyMetrics']) {
    await tx.objectStore(name).clear();
    for (const item of state[name] || []) {
      await tx.objectStore(name).put(item);
    }
  }
  await tx.objectStore('settings').clear();
  if (state.settings) {
    await tx.objectStore('settings').put({ ...state.settings, id: SETTINGS_ID });
  }
  await tx.done;
}
