import { el } from '../util.js';

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
    </div>
  `));
}
