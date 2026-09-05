// Tracks service worker update state for the More screen instead of a
// persistent top banner. The banner approach kept reappearing on every
// launch in some browsers' PWA/standalone modes (iOS Safari's service
// worker lifecycle events are known to be unreliable there), which was
// more confusing than a quiet, checkable status would be.
let currentReg = null;
let pendingReg = null;

export function setRegistration(reg) {
  currentReg = reg;
}

export function markUpdateAvailable(reg) {
  pendingReg = reg;
}

export function isUpdateAvailable() {
  return Boolean(pendingReg);
}

// Applies a pending update. Posts skipWaiting to the waiting worker, then
// reloads shortly after regardless of whether controllerchange actually
// fires — the service worker's network-first strategy means a plain
// reload alone already fetches fresh app files when online, so this is a
// safe fallback even if the message never takes effect.
export function applyUpdate() {
  const reg = pendingReg;
  if (!reg) return;
  let refreshing = false;
  const reload = () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
  if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(reload, 800);
}

// Manual "check now": asks the browser to re-fetch sw.js and compare. A
// genuine change triggers the normal updatefound/installed flow wired in
// app.js, which calls markUpdateAvailable().
export async function checkForUpdate() {
  if (!currentReg) return false;
  try {
    await currentReg.update();
  } catch {
    // Offline or transient failure; nothing to surface here.
  }
  return isUpdateAvailable();
}
