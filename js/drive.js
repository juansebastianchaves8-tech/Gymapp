// Google Identity Services sign-in + Drive API v3 appDataFolder access.
// The whole module is a no-op (never throws, never blocks the app) when
// GOOGLE_CLIENT_ID is blank in js/config.js, so the app runs on
// IndexedDB alone until you've done the Google Cloud setup in README.md.
import { GOOGLE_CLIENT_ID, GOOGLE_DRIVE_SCOPE } from './config.js';

const TOKEN_STORAGE_KEY = 'gymapp_drive_token';
const FILE_NAME = 'gymapp-data.json';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let tokenClient = null;
let gisLoadPromise = null;
let accessToken = null;
let tokenExpiresAt = 0;

export function isDriveConfigured() {
  return Boolean(GOOGLE_CLIENT_ID);
}

function loadGisScript() {
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

function restoreStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return;
    const { token, expiresAt } = JSON.parse(raw);
    if (token && expiresAt > Date.now()) {
      accessToken = token;
      tokenExpiresAt = expiresAt;
    }
  } catch { /* ignore corrupt storage */ }
}

function storeToken(token, expiresInSec) {
  accessToken = token;
  tokenExpiresAt = Date.now() + expiresInSec * 1000;
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token, expiresAt: tokenExpiresAt }));
  } catch { /* storage unavailable, keep in-memory only */ }
}

export function isSignedIn() {
  if (!isDriveConfigured()) return false;
  if (!accessToken) restoreStoredToken();
  return Boolean(accessToken && tokenExpiresAt > Date.now());
}

export function getUserEmail() {
  // Not requested (only the appdata scope is used); left for future use.
  return null;
}

async function ensureTokenClient() {
  await loadGisScript();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: () => {}, // overridden per-call below
    });
  }
  return tokenClient;
}

export async function signIn() {
  if (!isDriveConfigured()) return false;
  const client = await ensureTokenClient();
  return new Promise((resolve, reject) => {
    client.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      storeToken(resp.access_token, resp.expires_in || 3600);
      resolve(true);
    };
    client.requestAccessToken({ prompt: isSignedIn() ? '' : 'consent' });
  });
}

export function signOut() {
  if (accessToken && window.google?.accounts?.oauth2?.revoke) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiresAt = 0;
  try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch { /* ignore */ }
}

async function authFetch(url, options = {}) {
  if (!isSignedIn()) throw new Error('Not signed in to Google Drive');
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    accessToken = null;
    throw new Error('Drive session expired, please sign in again');
  }
  return res;
}

async function findAppDataFile() {
  const url = 'https://www.googleapis.com/drive/v3/files'
    + `?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${encodeURIComponent(`name='${FILE_NAME}'`)}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
  const data = await res.json();
  return data.files && data.files[0] ? data.files[0] : null;
}

// Uploads the given state object as the single appDataFolder JSON file,
// creating it on first sync or overwriting it thereafter (last-full-
// state-wins, no versioning/merge).
export async function pushStateToDrive(state) {
  if (!isDriveConfigured() || !isSignedIn()) return false;
  const existing = await findAppDataFile();
  const body = JSON.stringify(state);
  const metadata = existing ? {} : { name: FILE_NAME, parents: ['appDataFolder'] };

  const boundary = 'gymapp-boundary';
  const multipartBody =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
    + `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n`
    + `--${boundary}--`;

  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const res = await authFetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipartBody,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
  return true;
}

// Fetches the appDataFolder JSON file's contents, or null if it doesn't
// exist yet (fresh account / first sign-in).
export async function pullStateFromDrive() {
  if (!isDriveConfigured() || !isSignedIn()) return null;
  const file = await findAppDataFile();
  if (!file) return null;
  const res = await authFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  return res.json();
}
