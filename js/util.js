// Shared helpers: ids, dates, week boundaries, formatting.

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

// Returns a Date set to local midnight for the given date (or today).
export function startOfDay(d = new Date()) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

// Monday of the week containing `d`, at local midnight. Week runs Mon-Sun.
export function getWeekStart(d = new Date()) {
  const day = startOfDay(d);
  const dow = day.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = dow === 0 ? -6 : 1 - dow; // shift back to Monday
  day.setDate(day.getDate() + diff);
  return day;
}

export function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function isoDate(d) {
  // YYYY-MM-DD in local time (not UTC, to avoid timezone day-shift).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDate(dateStrOrDate, opts = { month: 'short', day: 'numeric' }) {
  const d = typeof dateStrOrDate === 'string' ? new Date(dateStrOrDate) : dateStrOrDate;
  return d.toLocaleDateString(undefined, opts);
}

export function formatWeekLabel(weekStartDate) {
  const start = new Date(weekStartDate);
  const end = addDays(start, 6);
  return `${formatDate(start)} - ${formatDate(end)}`;
}

export function epley1RM(weight, reps) {
  if (!reps || reps <= 0) return weight;
  return weight * (1 + reps / 30);
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
