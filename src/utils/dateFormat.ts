const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export type DateInput = string | Date | null | undefined;

function parseDate(value: DateInput): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** e.g. 02 Jan 2026 */
export function formatDate(value: DateInput): string {
  const d = parseDate(value);
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTHS[d.getMonth()];
  return `${day} ${month} ${d.getFullYear()}`;
}

/** e.g. 3:45 PM */
export function formatTime(value: DateInput): string {
  const d = parseDate(value);
  if (!d) return '';
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours %= 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${ampm}`;
}

/** e.g. 02 Jan 2026, 3:45 PM */
export function formatDateTime(value: DateInput): string {
  const d = parseDate(value);
  if (!d) return '';
  return `${formatDate(d)}, ${formatTime(d)}`;
}
