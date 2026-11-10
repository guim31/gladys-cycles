// -----------------------------------------------------------------------------
// The cycles: what a user types in their account (a model, a start date, a
// handover time, a custom pattern, shift hours) becomes a cycle, and a cycle
// becomes periods, computed day by day in the local time zone. Pure: no
// clock, no Gladys.
//
// A day of a cycle carries a code:
//   - custody: `me` or `other`, the parent who has the children from the
//     handover time of that day to the handover time of the next day;
//   - shift work: a shift (`morning`, `afternoon`, `night`, `day`, `on_call`)
//     starting that day, or `rest`.
// -----------------------------------------------------------------------------

import { addDays, daysBetween, localTime, parseDate, parseTime, weekday } from './time.js';

export const CUSTODY = 'custody';
export const SHIFT = 'shift';

/** Custody models: block lengths in days, the parents alternating at every block. */
const CUSTODY_BLOCKS = {
  custody_1_1: [7],
  custody_2_2_3: [2, 2, 3],
  custody_2_2_5_5: [2, 2, 5, 5],
  custody_3_4_4_3: [3, 4, 4, 3],
};

/** Weekend models: the weekends of the month (by their Saturday) with "me". */
const CUSTODY_WEEKENDS = {
  custody_weekends_1_3_5: [1, 3, 5],
  custody_weekends_2_4: [2, 4],
};

export const CUSTODY_TYPES = [
  ...Object.keys(CUSTODY_BLOCKS),
  ...Object.keys(CUSTODY_WEEKENDS),
  'custody_custom',
];

/** Shift codes of the custom patterns (French initials accepted for "day"). */
export const SHIFT_LETTERS = {
  M: 'morning',
  A: 'afternoon',
  N: 'night',
  D: 'day',
  J: 'day',
  O: 'on_call',
  R: 'rest',
};

/** Shift work models, written like a custom pattern. */
const SHIFT_PATTERNS = {
  shift_2x8: '5M 2R 5A 2R',
  shift_3x8: '5M 2R 5A 2R 5N 2R',
  shift_5x8: '2M 2A 2N 4R',
  shift_12h: '2D 2N 4R',
  on_call_2: '7O 7R',
  on_call_3: '7O 14R',
  on_call_4: '7O 21R',
};

export const SHIFT_TYPES = [...Object.keys(SHIFT_PATTERNS), 'shift_custom'];

export const CYCLE_TYPES = ['none', ...CUSTODY_TYPES, ...SHIFT_TYPES];

export const SHIFT_CODES = ['morning', 'afternoon', 'night', 'day', 'on_call'];

const H = (hours) => hours * 60;

/** Default shift hours, in minutes after midnight; an end before the start is the next day. */
const DEFAULT_HOURS = {
  morning: { start: H(6), end: H(14) },
  afternoon: { start: H(14), end: H(22) },
  night: { start: H(22), end: H(6) },
  day: { start: H(7), end: H(19) },
};

/** The 12-hour model works 07:00-19:00 then 19:00-07:00. */
const MODEL_HOURS = {
  shift_12h: { night: { start: H(19), end: H(7) } },
};

/** Default handover time: 18:00 for custody, 08:00 for on-call duty. */
const DEFAULT_TIME = { [CUSTODY]: H(18), [SHIFT]: H(8) };

// A cycle longer than this is a typing mistake: 20 weeks is already a lot.
export const MAX_PERIOD_DAYS = 140;
const MAX_BLOCK_DAYS = 31;

export const kindOf = (type) =>
  CUSTODY_TYPES.includes(type) ? CUSTODY : SHIFT_TYPES.includes(type) ? SHIFT : null;

/**
 * A custody pattern: block lengths separated by `/`, `-`, `,` or spaces
 * (`2/2/5/5`). `null` when invalid.
 */
export function parseBlocks(text) {
  const parts = String(text ?? '')
    .trim()
    .split(/[\s/,;-]+/)
    .filter(Boolean);
  if (parts.length === 0 || parts.some((part) => !/^\d{1,2}$/.test(part))) {
    return null;
  }
  const blocks = parts.map(Number);
  if (blocks.some((days) => days < 1 || days > MAX_BLOCK_DAYS)) {
    return null;
  }
  return blocks;
}

/** The custody day sequence of blocks: `true` = with me. */
function custodySides(blocks) {
  // An odd number of blocks swaps the parents on the next round (2/2/3: the
  // long weekend goes to each parent in turn): two rounds make the period.
  const rounds = blocks.length % 2 === 1 ? 2 : 1;
  const sides = [];
  let mine = true;
  for (let round = 0; round < rounds; round += 1) {
    for (const days of blocks) {
      for (let day = 0; day < days; day += 1) {
        sides.push(mine);
      }
      mine = !mine;
    }
  }
  return sides;
}

/**
 * A shift pattern: tokens `<count><letter>` (`5M 2R 5A 2R`), or letters one
 * per day (`MMAANNRRRR`). `null` when invalid.
 */
export function parseShiftPattern(text) {
  const compact = String(text ?? '')
    .toUpperCase()
    .replace(/[\s,;/]+/g, '');
  if (!/^(\d{0,2}[A-Z])+$/.test(compact)) {
    return null;
  }
  const codes = [];
  for (const [, count, letter] of compact.matchAll(/(\d{0,2})([A-Z])/g)) {
    const code = SHIFT_LETTERS[letter];
    const days = count === '' ? 1 : Number(count);
    if (!code || days < 1) {
      return null;
    }
    for (let day = 0; day < days; day += 1) {
      codes.push(code);
    }
    if (codes.length > MAX_PERIOD_DAYS) {
      return null;
    }
  }
  return codes.some((code) => code !== 'rest') ? codes : null;
}

/**
 * Shift hours typed by a user: `M=05:00-13:00; N=21h-5h`. Returns the
 * overrides by shift code, or `null` when a part cannot be read.
 */
export function parseHours(text) {
  const hours = {};
  const parts = String(text ?? '')
    .split(/[;,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^([a-z])\s*[=:]?\s*([\dh:.\s]+?)\s*[-–]\s*([\dh:.\s]+)$/i);
    const code = match && SHIFT_LETTERS[match[1].toUpperCase()];
    if (!code || code === 'rest' || code === 'on_call') {
      return null;
    }
    const start = parseTime(match[2]);
    const end = parseTime(match[3]);
    if (start === null || end === null || start === end) {
      return null;
    }
    hours[code] = { start, end };
  }
  return hours;
}

/**
 * One cycle of an account, from its raw fields.
 * @param {number} slot 1, 2 or 3
 * @param {{ type?: string, name?: string, start?: string, time?: string,
 *   pattern?: string, hours?: string, first?: string }} fields
 * @returns {null | { slot: number, type: string, kind: string, name: string,
 *   error?: string, start?: string|null, time?: number, sides?: boolean[],
 *   weekends?: number[], codes?: string[], hours?: object }}
 *   `null` for an unused slot; `error` names the first invalid field.
 */
export function buildCycle(slot, fields = {}) {
  const type = CYCLE_TYPES.includes(fields.type) ? fields.type : 'none';
  const kind = kindOf(type);
  if (!kind) {
    return null;
  }
  const cycle = { slot, type, kind, name: String(fields.name ?? '').trim() };
  const fail = (error) => ({ ...cycle, error });

  const startText = String(fields.start ?? '').trim();
  cycle.start = startText === '' ? null : parseDate(startText);
  if (startText !== '' && cycle.start === null) {
    return fail('start');
  }
  // Weekends follow the calendar; every other model counts from its start.
  if (cycle.start === null && !CUSTODY_WEEKENDS[type]) {
    return fail('start');
  }

  const timeText = String(fields.time ?? '').trim();
  cycle.time = timeText === '' ? DEFAULT_TIME[kind] : parseTime(timeText);
  if (cycle.time === null) {
    return fail('time');
  }

  if (kind === CUSTODY) {
    const flip = fields.first === 'other';
    if (CUSTODY_WEEKENDS[type]) {
      cycle.weekends = CUSTODY_WEEKENDS[type];
      cycle.flip = flip;
      return cycle;
    }
    const blocks = type === 'custody_custom' ? parseBlocks(fields.pattern) : CUSTODY_BLOCKS[type];
    if (!blocks) {
      return fail('pattern');
    }
    const sides = custodySides(blocks);
    if (sides.length > MAX_PERIOD_DAYS) {
      return fail('pattern');
    }
    cycle.sides = flip ? sides.map((mine) => !mine) : sides;
    return cycle;
  }

  const codes = parseShiftPattern(type === 'shift_custom' ? fields.pattern : SHIFT_PATTERNS[type]);
  if (!codes) {
    return fail('pattern');
  }
  const overrides = parseHours(fields.hours);
  if (!overrides) {
    return fail('hours');
  }
  cycle.codes = codes;
  cycle.hours = {
    ...DEFAULT_HOURS,
    ...MODEL_HOURS[type],
    ...overrides,
    // On-call duty runs from the handover time to the same time the next day.
    on_call: { start: cycle.time, end: cycle.time },
  };
  return cycle;
}

/** The code of a local day, or `null` before the start of the cycle. */
export function dayCode(cycle, date) {
  if (cycle.start && date < cycle.start) {
    return null;
  }
  if (cycle.weekends) {
    // Friday and Saturday open the weekend; it belongs to the month of its
    // Saturday ("the first weekend" is the one of the first Saturday).
    const day = weekday(date);
    let mine = false;
    if (day === 5 || day === 6) {
      const saturday = day === 5 ? addDays(date, 1) : date;
      const rank = Math.ceil(Number(saturday.slice(8, 10)) / 7);
      mine = cycle.weekends.includes(rank);
    }
    return mine !== Boolean(cycle.flip) ? 'me' : 'other';
  }
  const sequence = cycle.sides ?? cycle.codes;
  const index = daysBetween(cycle.start, date) % sequence.length;
  const value = sequence[index];
  if (cycle.sides) {
    return value ? 'me' : 'other';
  }
  return value;
}

// Periods are computed from this many days before the window and after it,
// so that one running at its start or its end (a custody week, an on-call
// week) keeps its real start and end.
const MARGIN_DAYS = 2 * MAX_BLOCK_DAYS;

/**
 * The periods of a cycle overlapping the local days `fromDate` to `toDate`
 * (both included), sorted. A custody period runs from a handover to the
 * next; a shift from its start to its end; consecutive on-call days make one
 * period. Rest days make none.
 * @returns {{ code: string, start: number, end: number, startDate: string }[]}
 */
export function periods(cycle, fromDate, toDate) {
  if (cycle.error) {
    return [];
  }
  const windowStart = localTime(fromDate, 0);
  const windowEnd = localTime(addDays(toDate, 1), 0);
  const list = [];
  let previous = null;
  const lastDate = addDays(toDate, MARGIN_DAYS);
  for (let date = addDays(fromDate, -MARGIN_DAYS); date <= lastDate; date = addDays(date, 1)) {
    const code = dayCode(cycle, date);
    if (code === null || code === 'rest') {
      previous = null;
      continue;
    }
    let start;
    let end;
    if (cycle.kind === CUSTODY) {
      start = localTime(date, cycle.time);
      end = localTime(addDays(date, 1), cycle.time);
    } else {
      const hours = cycle.hours[code];
      start = localTime(date, hours.start);
      end = localTime(addDays(date, hours.end <= hours.start ? 1 : 0), hours.end);
    }
    if (previous && previous.code === code && previous.end === start) {
      previous.end = end;
      continue;
    }
    previous = { code, start, end, startDate: date };
    list.push(previous);
  }
  return list.filter((period) => period.end > windowStart && period.start < windowEnd);
}

/**
 * Where a cycle stands at `now`, from its periods: the running period (or
 * `null` between two shifts), and the next change.
 * @param {{ code: string, start: number, end: number }[]} list sorted
 * @param {number} now
 */
export function stateAt(list, now) {
  const current = list.find((period) => period.start <= now && now < period.end) ?? null;
  const next = list.find((period) => period.start >= (current ? current.end : now)) ?? null;
  const changeAt = current ? current.end : (next?.start ?? null);
  return { current, next, changeAt };
}
