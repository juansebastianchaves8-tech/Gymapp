import { el } from '../util.js';

let timer = null;

export function showToast(message, duration = 2200) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const toast = el(`<div class="toast">${message}</div>`);
  document.body.appendChild(toast);
  clearTimeout(timer);
  timer = setTimeout(() => toast.remove(), duration);
}
