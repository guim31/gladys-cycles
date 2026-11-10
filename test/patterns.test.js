// -----------------------------------------------------------------------------
// The models, computed in Europe/Paris: handovers and shifts keep their wall
// clock time across the daylight saving changes, leap days count, a start
// date in the past (or the future) places the cycle exactly.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CYCLE_TYPES,
  buildCycle,
  dayCode,
  parseBlocks,
  parseHours,
  parseShiftPattern,
  periods,
  stateAt,
} from '../src/patterns.js';
import { parseDate, parseTime } from '../src/time.js';

process.env.TZ = 'Europe/Paris';

/** Periods as readable local strings: `me 2026-03-27 18:00 → 2026-03-30 18:00`. */
function readable(list) {
  const local = (ms) => {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return list.map((period) => `${period.code} ${local(period.start)} → ${local(period.end)}`);
}

test('2-2-3 alternates the long weekend, across the spring change', () => {
  // Monday 23 March 2026; clocks go forward on Sunday 29 March.
  const cycle = buildCycle(1, { type: 'custody_2_2_3', start: '2026-03-23' });
  assert.deepEqual(readable(periods(cycle, '2026-03-23', '2026-04-05')), [
    'me 2026-03-23 18:00 → 2026-03-25 18:00',
    'other 2026-03-25 18:00 → 2026-03-27 18:00',
    'me 2026-03-27 18:00 → 2026-03-30 18:00',
    'other 2026-03-30 18:00 → 2026-04-01 18:00',
    'me 2026-04-01 18:00 → 2026-04-03 18:00',
    'other 2026-04-03 18:00 → 2026-04-06 18:00',
  ]);
  // The weekend of the change lasts 71 hours, not 72: the handover stays at 18:00.
  const [, , weekend] = periods(cycle, '2026-03-23', '2026-04-05');
  assert.equal((weekend.end - weekend.start) / 3_600_000, 71);
});

test('one week in two, with "the other parent" on the start date and a handover time', () => {
  const cycle = buildCycle(1, {
    type: 'custody_1_1',
    start: '04/09/2026',
    time: '17h30',
    first: 'other',
  });
  assert.deepEqual(readable(periods(cycle, '2026-09-04', '2026-09-24')), [
    'other 2026-09-04 17:30 → 2026-09-11 17:30',
    'me 2026-09-11 17:30 → 2026-09-18 17:30',
    'other 2026-09-18 17:30 → 2026-09-25 17:30',
  ]);
});

test('a start date far in the past places the cycle, a future one leaves nothing before it', () => {
  const past = buildCycle(1, { type: 'custody_2_2_5_5', start: '2020-01-06' });
  // 2020-01-06 → 2026-10-12 is 2471 days: 2471 mod 14 = 7, the 2nd day of
  // the first 5-day block (me: days 4-8 of the period).
  assert.equal(dayCode(past, '2026-10-12'), 'me');
  assert.equal(dayCode(past, '2026-10-15'), 'other');

  const future = buildCycle(1, { type: 'custody_3_4_4_3', start: '2026-11-02' });
  assert.equal(dayCode(future, '2026-11-01'), null);
  assert.deepEqual(readable(periods(future, '2026-10-20', '2026-11-04')), [
    'me 2026-11-02 18:00 → 2026-11-05 18:00',
  ]);
});

test('leap days count: the cycle does not shift across 29 February', () => {
  const cycle = buildCycle(1, { type: 'custody_1_1', start: '2028-02-25' }); // a Friday
  assert.equal(dayCode(cycle, '2028-02-29'), 'me');
  assert.equal(dayCode(cycle, '2028-03-03'), 'other'); // Friday, one week later
  assert.equal(dayCode(cycle, '2028-03-10'), 'me');
});

test('weekends follow the Saturdays of the month, start date optional', () => {
  const cycle = buildCycle(1, { type: 'custody_weekends_1_3_5' });
  assert.deepEqual(readable(periods(cycle, '2026-01-01', '2026-02-02')), [
    'other 2025-12-21 18:00 → 2026-01-02 18:00',
    'me 2026-01-02 18:00 → 2026-01-04 18:00',
    'other 2026-01-04 18:00 → 2026-01-16 18:00',
    'me 2026-01-16 18:00 → 2026-01-18 18:00',
    'other 2026-01-18 18:00 → 2026-01-30 18:00',
    'me 2026-01-30 18:00 → 2026-02-01 18:00', // Saturday 31 January: the 5th
    'other 2026-02-01 18:00 → 2026-02-06 18:00',
  ]);
  const even = buildCycle(1, { type: 'custody_weekends_2_4', start: '2026-02-01' });
  assert.equal(dayCode(even, '2026-01-30'), null);
  assert.equal(dayCode(even, '2026-02-13'), 'me'); // Friday before the 2nd Saturday
  assert.equal(dayCode(even, '2026-02-15'), 'other'); // Sunday: back at the handover
});

test('5x8: two mornings, two afternoons, two nights, a night across the autumn change', () => {
  const cycle = buildCycle(1, { type: 'shift_5x8', start: '2026-10-20' });
  assert.deepEqual(readable(periods(cycle, '2026-10-24', '2026-11-01')), [
    'night 2026-10-24 22:00 → 2026-10-25 06:00',
    'night 2026-10-25 22:00 → 2026-10-26 06:00',
    'morning 2026-10-30 06:00 → 2026-10-30 14:00',
    'morning 2026-10-31 06:00 → 2026-10-31 14:00',
    'afternoon 2026-11-01 14:00 → 2026-11-01 22:00',
  ]);
  // Clocks go back on 25 October at 03:00: that night lasts 9 hours.
  const [first] = periods(cycle, '2026-10-24', '2026-10-24');
  assert.equal((first.end - first.start) / 3_600_000, 9);
});

test('12-hour shifts work 07:00-19:00 and 19:00-07:00, other hours can be typed', () => {
  const cycle = buildCycle(1, { type: 'shift_12h', start: '2026-10-12' });
  assert.deepEqual(readable(periods(cycle, '2026-10-12', '2026-10-14')), [
    'day 2026-10-12 07:00 → 2026-10-12 19:00',
    'day 2026-10-13 07:00 → 2026-10-13 19:00',
    'night 2026-10-14 19:00 → 2026-10-15 07:00',
  ]);
  const custom = buildCycle(1, {
    type: 'shift_12h',
    start: '2026-10-12',
    hours: 'D=08:00-20:00; N = 20h-8h',
  });
  assert.deepEqual(readable(periods(custom, '2026-10-14', '2026-10-14')), [
    'night 2026-10-14 20:00 → 2026-10-15 08:00',
  ]);
});

test('an on-call week is one period, from the handover time', () => {
  const cycle = buildCycle(1, { type: 'on_call_3', start: '2026-11-06', time: '8h' });
  assert.deepEqual(readable(periods(cycle, '2026-11-06', '2026-12-20')), [
    'on_call 2026-11-06 08:00 → 2026-11-13 08:00',
    'on_call 2026-11-27 08:00 → 2026-12-04 08:00',
    'on_call 2026-12-18 08:00 → 2026-12-25 08:00', // runs past the window: kept whole
  ]);
});

test('2x8 and 3x8 rest on weekends', () => {
  const twoBy8 = buildCycle(1, { type: 'shift_2x8', start: '2026-10-12' });
  const codes = (cycle, from, days) =>
    Array.from({ length: days }, (_, i) =>
      dayCode(cycle, new Date(Date.UTC(2026, 9, 12 + i)).toISOString().slice(0, 10)),
    );
  assert.deepEqual(codes(twoBy8, '2026-10-12', 14), [
    ...Array(5).fill('morning'),
    'rest',
    'rest',
    ...Array(5).fill('afternoon'),
    'rest',
    'rest',
  ]);
  const threeBy8 = buildCycle(1, { type: 'shift_3x8', start: '2026-10-12' });
  assert.equal(threeBy8.codes.length, 21);
  assert.equal(dayCode(threeBy8, '2026-10-26'), 'night');
});

test('custom patterns: custody blocks and shift letters', () => {
  assert.deepEqual(parseBlocks('2/2/5/5'), [2, 2, 5, 5]);
  assert.deepEqual(parseBlocks(' 7 '), [7]);
  for (const bad of ['', 'abc', '0/7', '2/40', '2//x']) {
    assert.equal(parseBlocks(bad), null, bad);
  }
  assert.deepEqual(parseShiftPattern('2m 1a, 1R'), ['morning', 'morning', 'afternoon', 'rest']);
  assert.deepEqual(parseShiftPattern('JJNN'), ['day', 'day', 'night', 'night']);
  for (const bad of ['', '4R', 'XX', '2M 0A', '99M 99R']) {
    assert.equal(parseShiftPattern(bad), null, bad);
  }
  const custody = buildCycle(2, { type: 'custody_custom', start: '2026-10-12', pattern: '3' });
  // One block of 3 days, alternating: me 3 days, other 3 days.
  assert.deepEqual(custody.sides, [true, true, true, false, false, false]);
});

test('shift hours, dates and times as people type them', () => {
  assert.deepEqual(parseHours(''), {});
  assert.deepEqual(parseHours('M=05:00-13:00'), { morning: { start: 300, end: 780 } });
  assert.equal(parseHours('O=08:00-08:00'), null);
  assert.equal(parseHours('M=25:00-13:00'), null);
  assert.equal(parseHours('nonsense'), null);
  assert.equal(parseDate('2026-09-04'), '2026-09-04');
  assert.equal(parseDate('4/9/2026'), '2026-09-04');
  assert.equal(parseDate('04.09.2026'), '2026-09-04');
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('29/02/2027'), null);
  assert.equal(parseDate('29/02/2028'), '2028-02-29');
  assert.equal(parseTime('18:00'), 1080);
  assert.equal(parseTime('18h'), 1080);
  assert.equal(parseTime('6h05'), 365);
  assert.equal(parseTime('24:00'), null);
});

test('an unreadable field names itself, an unused slot is nothing', () => {
  assert.equal(buildCycle(1, {}), null);
  assert.equal(buildCycle(1, { type: 'unknown' }), null);
  assert.equal(buildCycle(1, { type: 'custody_1_1' }).error, 'start');
  assert.equal(buildCycle(1, { type: 'custody_1_1', start: '31/02/2026' }).error, 'start');
  assert.equal(
    buildCycle(1, { type: 'custody_1_1', start: '2026-09-04', time: '25h' }).error,
    'time',
  );
  assert.equal(buildCycle(1, { type: 'custody_custom', start: '2026-09-04' }).error, 'pattern');
  assert.equal(
    buildCycle(1, { type: 'shift_5x8', start: '2026-09-04', hours: 'M=6-' }).error,
    'hours',
  );
  assert.deepEqual(periods(buildCycle(1, { type: 'custody_1_1' }), '2026-01-01', '2026-02-01'), []);
  // Every model of the manifest builds.
  for (const type of CYCLE_TYPES.filter((t) => t !== 'none' && !t.endsWith('custom'))) {
    const cycle = buildCycle(1, { type, start: '2026-01-05' });
    assert.equal(cycle.error, undefined, type);
    assert.ok(periods(cycle, '2026-01-05', '2026-03-01').length > 0, type);
  }
});

test('stateAt: the running period, then the next change', () => {
  const cycle = buildCycle(1, { type: 'shift_2x8', start: '2026-10-12' });
  const list = periods(cycle, '2026-10-12', '2026-10-20');
  const at = (iso) => stateAt(list, Date.parse(iso));
  assert.equal(at('2026-10-12T08:00:00+02:00').current.code, 'morning');
  assert.equal(at('2026-10-12T08:00:00+02:00').changeAt, Date.parse('2026-10-12T14:00:00+02:00'));
  const evening = at('2026-10-16T20:00:00+02:00'); // Friday evening: weekend off
  assert.equal(evening.current, null);
  assert.equal(evening.next.code, 'afternoon');
  assert.equal(evening.changeAt, Date.parse('2026-10-19T14:00:00+02:00'));
});
