// Minimal hash router. Each route handler receives (container, params)
// and returns an optional cleanup function, called before the next route
// renders (used to destroy Chart.js instances etc).

const routes = [];
let cleanupFn = null;
let container = null;

export function registerRoute(pattern, handler) {
  // pattern like '/workout/from/:id' -> regex with named groups
  const paramNames = [];
  const regexStr = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  const regex = new RegExp(`^${regexStr}$`);
  routes.push({ regex, paramNames, handler });
}

export function navigate(hash) {
  window.location.hash = hash;
}

async function handleHashChange() {
  const hash = window.location.hash.slice(1) || '/home';
  const path = hash.split('?')[0];
  const queryStr = hash.includes('?') ? hash.split('?')[1] : '';
  const query = Object.fromEntries(new URLSearchParams(queryStr));

  if (typeof cleanupFn === 'function') {
    try { cleanupFn(); } catch (e) { console.error(e); }
    cleanupFn = null;
  }

  for (const route of routes) {
    const m = path.match(route.regex);
    if (m) {
      const params = {};
      route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
      container.innerHTML = '';
      updateActiveNav(path);
      try {
        const result = await route.handler(container, { ...params, query });
        if (typeof result === 'function') cleanupFn = result;
      } catch (err) {
        console.error('Screen failed to render:', err);
        container.innerHTML = `<div class="screen"><p>Something went wrong loading this screen. Try again, or reopen the app.</p><pre style="white-space:pre-wrap;color:#ff5d5d;font-size:0.75rem;">${(err && err.stack) || err}</pre></div>`;
      }
      window.scrollTo(0, 0);
      return;
    }
  }
  container.innerHTML = '<div class="screen"><p>Not found.</p></div>';
}

function updateActiveNav(path) {
  const top = '/' + (path.split('/')[1] || 'home');
  document.querySelectorAll('.navbar a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === `#${top}`);
  });
}

export function startRouter(containerEl) {
  container = containerEl;
  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();
}
