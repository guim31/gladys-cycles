// -----------------------------------------------------------------------------
// Calendar-date helpers, in the container time zone. The Gladys supervisor
// injects TZ, the time zone of Gladys: a cycle is a sequence of LOCAL days,
// and a handover at 18:00 stays at 18:00 across a daylight saving change.
// -----------------------------------------------------------------------------

const pad = (number) => String(number).padStart(2, '0');

/** `YYYY-MM-DD` of a timestamp or Date, read in the local time zone. */
export function localDate(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM-DD`, `days` calendar days after (or before) `dateString`. */
export function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  return localDate(new Date(year, month - 1, day + days));
}

/** Same date, `months` later (clamped to the month length). */
export function addMonths(dateString, months) {
  const [year, month, day] = dateString.split('-').map(Number);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return localDate(target);
}

/** Whole calendar days from `fromDate` to `toDate` (`YYYY-MM-DD`), DST-safe. */
export function daysBetween(fromDate, toDate) {
  const [y1, m1, d1] = fromDate.split('-').map(Number);
  const [y2, m2, d2] = toDate.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Day of the week of a `YYYY-MM-DD` date: 0 Sunday … 6 Saturday. */
export function weekday(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Timestamp of a local wall-clock time. A time skipped by the spring change
 * (02:30 on the last Sunday of March in Paris) is moved forward by the hour
 * the clocks jump, the rule of the JavaScript Date.
 * @param {string} dateString `YYYY-MM-DD`
 * @param {number} minutes minutes after midnight, 0-1439
 */
export function localTime(dateString, minutes) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60).getTime();
}

/** `HH:MM` of a number of minutes after midnight. */
export function formatMinutes(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * A date typed by a user: `2026-09-04`, `04/09/2026`, `4.9.2026` or
 * `4-9-2026` (day first, the European order). `null` when it is not a real
 * calendar date.
 */
export function parseDate(text) {
  const value = String(text ?? '').trim();
  let year;
  let month;
  let day;
  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    [, year, month, day] = match.map(Number);
  } else if ((match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
    [, day, month, year] = match.map(Number);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 2000 ||
    year > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * A time of day typed by a user: `18:00`, `18h`, `18h30`, `18.30`, `6:05`,
 * `18`. Minutes after midnight, or `null`.
 */
export function parseTime(text) {
  const match = String(text ?? '')
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?:\s*[:h.]\s*(\d{2})?)?$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}
