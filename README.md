# Gymapp

A personal Progressive Web App for tracking workouts, nutrition, sleep, and
body weight. Installs via Safari's "Add to Home Screen" on iPhone and runs
like a native app — no App Store, no backend server.

## Tech stack

- Plain HTML/CSS/JS, no build step
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) via the [`idb`](https://github.com/jakearchibald/idb) wrapper (loaded from jsDelivr) as the local source of truth
- [Chart.js](https://www.chartjs.org/) (loaded from jsDelivr) for graphs
- Google Identity Services + Drive API v3 (`appDataFolder`) for optional cloud sync
- A service worker for offline support and update handling

Everything runs client-side. There is no database server and no login
system beyond Google OAuth (which is itself optional).

## Running locally

Any static file server works, e.g.:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. The first load needs network access
(to fetch `idb` and Chart.js from jsDelivr) — after that, the service
worker caches everything for offline use.

## Deploying (GitHub Pages)

1. Push this repo to GitHub.
2. In the repo settings, enable **Pages** → deploy from the `main` branch (root).
3. GitHub serves the site at `https://<username>.github.io/<repo>/`. That's it — every push to `main` redeploys automatically.

### Shipping updates

The service worker uses a network-first strategy for the app's own files,
so a reload picks up new code automatically when possible. To guarantee
phones see an update (rather than serving a stale cached copy while
offline-first), bump the version string in two places on any deploy that
changes app files:

- `CACHE_VERSION` in `sw.js`
- `APP_VERSION` in `js/config.js`

Bumping `CACHE_VERSION` makes the browser install a fresh cache; once it's
ready, the app shows an "Update available" banner (instead of silently
swapping code out from under you) and the tap-to-refresh reloads onto the
new version.

## Google Drive sync setup (optional)

The app works fully offline on IndexedDB alone without any of this — Drive
sync is a bonus. Cloud sync stays silently disabled until you configure it:
no errors, no broken screens, just no sync indicator in the header.

When you're ready to turn it on:

1. Create a free [Google Cloud project](https://console.cloud.google.com/).
2. Enable the **Google Drive API** for that project.
3. Create an **OAuth 2.0 Client ID** of type **Web application**.
4. Under **Authorized JavaScript origins**, add the URL you deployed to (e.g. `https://<username>.github.io`) and `http://localhost:8000` (or whatever port you use locally) for testing.

Then drop the Client ID into `js/config.js`:

```js
export const GOOGLE_CLIENT_ID = 'your-client-id.apps.googleusercontent.com';
```

Reload the app and a **Sign In** button appears under Settings → Cloud
Sync. Data syncs as a single JSON file in your Drive's private
`appDataFolder` (invisible in your normal Drive UI, deleted if you revoke
the app's access) — last-full-state-wins, no multi-device merge logic,
since this is meant for one device.

Independent of Drive, Settings also has manual **Export/Import JSON** as a
second backup path.

## Data model

Everything lives in IndexedDB (`gymapp` database) across seven object
stores: `exercises`, `routines`, `workoutSessions`, `nutritionEntries`,
`sleepEntries`, `bodyMetrics`, `settings`. See `js/db.js` for the schema
and `js/exercises-seed.js` for the default exercise library seeded on
first run.

## Notes

- Weight is always in lbs.
- The workout week runs Monday–Sunday. Streak logic lives in `js/streak.js`.
- PRs are heaviest weight ever lifted per exercise (not formula-estimated). Estimated 1RM (shown on the Progress screen) uses the Epley formula.
- `scripts/gen-icons.js` regenerates the PWA icons in `icons/` if you want to change them (pure Node, no dependencies).
