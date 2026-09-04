import { el } from '../util.js';

let current = null;

export function openModal(innerHTML) {
  closeModal();
  const backdrop = el(`<div class="modal-backdrop"><div class="modal-sheet">${innerHTML}</div></div>`);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.body.appendChild(backdrop);
  current = backdrop;
  return backdrop.querySelector('.modal-sheet');
}

export function closeModal() {
  if (current) {
    current.remove();
    current = null;
  }
}
