/**
 * Helpers to bridge between the human-readable date strings used throughout
 * the app and the ISO-ish values that native `<input type="date">`,
 * `type="datetime-local"` and `type="time"` pickers expect.
 *
 * Display formats handled:
 *   - Date + time : `14 Jun 2026, 04:50`
 *   - Compact date: `25Jun2026`
 *   - Compact time: `1200`
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface Parsed {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hours: number;
  minutes: number;
  hasTime: boolean;
}

/** Parse a display date such as `14 Jun 2026, 04:50` or `25Jun2026`. */
function parseDisplayDate(value: string): Parsed | null {
  if (!value) return null;
  const m = value.match(
    /(\d{1,2})\s*([A-Za-z]{3,})\.?\s*(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/,
  );
  if (!m) return null;
  const day = Number(m[1]);
  const monthName = m[2].slice(0, 3).toLowerCase();
  const month = MONTHS.findIndex((mo) => mo.toLowerCase() === monthName) + 1;
  const year = Number(m[3]);
  if (month === 0) return null;
  const hasTime = m[4] !== undefined;
  return {
    year,
    month,
    day,
    hours: hasTime ? Number(m[4]) : 0,
    minutes: hasTime ? Number(m[5]) : 0,
    hasTime,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Display string -> `YYYY-MM-DD` for `<input type="date">`. */
export function toDateInput(value: string): string {
  const p = parseDisplayDate(value);
  if (!p) return '';
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `YYYY-MM-DD` -> compact display date such as `25Jun2026`. */
export function fromDateInput(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const [, year, month, day] = m;
  return `${day}${MONTHS[Number(month) - 1]}${year}`;
}

/** Display string -> `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`. */
export function toDateTimeInput(value: string): string {
  const p = parseDisplayDate(value);
  if (!p) return '';
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hours)}:${pad(p.minutes)}`;
}

/** `YYYY-MM-DDTHH:mm` -> display string such as `14 Jun 2026, 04:50`. */
export function fromDateTimeInput(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return '';
  const [, year, month, day, hours, minutes] = m;
  return `${day} ${MONTHS[Number(month) - 1]} ${year}, ${hours}:${minutes}`;
}

/** Compact time `1200` (or `12:00`) -> `HH:mm` for `<input type="time">`. */
export function toTimeInput(value: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 3) return '';
  const padded = digits.padStart(4, '0').slice(0, 4);
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
}

/** `HH:mm` -> compact time `1200`. */
export function fromTimeInput(iso: string): string {
  const m = iso.match(/^(\d{2}):(\d{2})$/);
  if (!m) return '';
  return `${m[1]}${m[2]}`;
}
