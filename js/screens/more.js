import { el } from '../util.js';
import { isUpdateAvailable, applyUpdate, checkForUpdate } from '../swUpdate.js';

const ITEMS = [
  { label: 'Routines', sub: 'Create and start from saved routines', href: '#/routines' },
  { label: 'Workout History', sub: 'Edit or delete past workouts', href: '#/workout/history' },
  { label: 'Nutrition', sub: 'Weekly calories, protein, carbs, fat', href: '#/nutrition' },
  { label: 'Sleep', sub: 'Weekly hours slept and quality', href: '#/sleep' },
  { label: 'Body Metrics', sub: 'Weight and body fat percentage', href: '#/body' },
  { label: 'Settings', sub: 'Goals, targets, sync, backup', href: '#/settings' },
];

export async function renderMore(container) {
  container.appendChild(el(`
    <div class="screen">
      <h1 class="screen-title">More</h1>
      <ul class="list">
        ${ITEMS.map((i) => `
          <li class="list-item">
            <div class="list-item-main">
              <a class="list-item-title" href="${i.href}">${i.label}</a>
              <div class="list-item-sub">${i.sub}</div>
            </div>
          </li>
        `).join('')}
      </ul>

      <div class="section mt-16">
        <div class="section-title">App</div>
        <div class="card" id="update-card"></div>
      </div>
    </div>
  `));

  renderUpdateCard(container.querySelector('#update-card'));
}

function renderUpdateCard(cardEl) {
  if (!('serviceWorker' in navigator)) {
    cardEl.innerHTML = '<p class="text-dim text-sm">Offline support isn\'t available in this browser.</p>';
    return;
  }

  if (isUpdateAvailable()) {
    cardEl.innerHTML = `
      <div class="card-row">
        <div>
          <div class="list-item-title">Update available</div>
          <div class="list-item-sub">A new version is ready to install</div>
        </div>
        <button type="button" id="apply-update-btn" class="btn btn-primary btn-sm">Refresh</button>
      </div>
    `;
    cardEl.querySelector('#apply-update-btn').addEventListener('click', (e) => {
      e.currentTarget.textContent = 'Refreshing...';
      e.currentTarget.disabled = true;
      applyUpdate();
    });
  } else {
    cardEl.innerHTML = `
      <div class="card-row">
        <div class="list-item-title">You're up to date</div>
        <button type="button" id="check-update-btn" class="btn btn-secondary btn-sm">Check Now</button>
      </div>
    `;
    cardEl.querySelector('#check-update-btn').addEventListener('click', async (e) => {
      e.currentTarget.textContent = 'Checking...';
      e.currentTarget.disabled = true;
      await checkForUpdate();
      renderUpdateCard(cardEl);
    });
  }
}
