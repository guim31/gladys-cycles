// -----------------------------------------------------------------------------
// Scene triggers and action (manifest `scene_triggers` / `scene_actions`).
//
// The core already offers "an event is coming" and "is an event running" on
// any shared calendar, which these calendars feed. What the integration adds:
//
//   - trigger `custody_changed`: the children arrive or leave, at the
//     handover time, with the time of the next change;
//   - trigger `shift_changed`: a shift starts or ends, with its kind, to be
//     filtered in the scene (night shifts only…);
//   - action `cycle_status`: where a cycle stands now, the label of the
//     day and the next change, in minutes. `found` and `active` are numbers
//     (1/0): the core's "condition on variables" compares strictly.
//
// Like the core's calendar scenes, only SHARED calendars are involved: a
// scene is household business, a private calendar stays private.
// -----------------------------------------------------------------------------

import { STATE_TEXT, TEXT, formatWhen, pick } from './i18n.js';
import { CUSTODY, SHIFT_CODES, stateAt } from './patterns.js';
import { localDate, localTime, addDays } from './time.js';

export const TRIGGERS = {
  CUSTODY_CHANGED: 'custody_changed',
  SHIFT_CHANGED: 'shift_changed',
};
export const SCENE_TRIGGER_KEYS = Object.values(TRIGGERS);
export const CUSTODY_CHANGES = ['arrival', 'departure'];
export const SHIFT_CHANGES = ['start', 'end'];
export { SHIFT_CODES };

/** Lowercase, without accents nor extra blanks: "Garde  alternée" matches "garde alternee". */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** What a cycle is doing at `now`: the code of the running period, or `rest`. */
export function codeAt(entry, now) {
  return stateAt(entry.periods, now).current?.code ?? 'rest';
}

/**
 * Same period, by value: every synchronization rebuilds the periods (the
 * daily slide of the window), so they are never the same objects.
 */
export function samePeriod(a, b) {
  return (a?.code ?? null) === (b?.code ?? null) && (a?.start ?? null) === (b?.start ?? null);
}

/**
 * The scene events of a cycle that moved from one period to another between
 * two looks. `before` and `after` are the running periods (or null).
 * @returns {{ key: string, data: object }[]}
 */
export function transitionEvents(entry, before, after, language, now) {
  const text = pick(TEXT, language);
  const names = pick(STATE_TEXT, language);
  const base = { calendar: entry.name, user: entry.user };
  const events = [];
  if (entry.cycle.kind === CUSTODY) {
    const was = before?.code === 'me';
    const is = after?.code === 'me';
    if (was !== is) {
      const change = is ? 'arrival' : 'departure';
      const { changeAt } = stateAt(entry.periods, now);
      events.push({
        key: TRIGGERS.CUSTODY_CHANGED,
        data: {
          ...base,
          change,
          change_label: text[change],
          present: is ? 1 : 0,
          next_change: changeAt === null ? '' : formatWhen(changeAt, language),
        },
      });
    }
    return events;
  }
  const shiftData = (period, change) => ({
    ...base,
    change,
    change_label: text[change],
    shift: period.code,
    shift_label: names[period.code],
    start: formatWhen(period.start, language),
    end: formatWhen(period.end, language),
  });
  if (samePeriod(before, after)) {
    return events;
  }
  if (before) {
    events.push({ key: TRIGGERS.SHIFT_CHANGED, data: shiftData(before, 'end') });
  }
  if (after) {
    events.push({ key: TRIGGERS.SHIFT_CHANGED, data: shiftData(after, 'start') });
  }
  return events;
}

/**
 * Watches the shared cycles and reports their transitions. The first look at
 * a cycle (start-up, a new or edited account) only records where it stands:
 * a restart never fires a scene, and `reset()` makes a change of settings
 * silent too.
 */
export class TransitionWatcher {
  constructor() {
    /** `<user>\n<slot>` → the running period, or null */
    this.seen = new Map();
  }

  /** Forget a cycle's position: the next look records it silently. */
  reset(userSelector) {
    for (const key of this.seen.keys()) {
      if (key.startsWith(`${userSelector}\n`)) {
        this.seen.delete(key);
      }
    }
  }

  /**
   * @param {object[]} entries `syncer.sharedCycles()`
   * @returns {{ key: string, data: object }[]}
   */
  look(entries, language, now) {
    const events = [];
    const alive = new Set();
    for (const entry of entries) {
      const key = `${entry.userSelector}\n${entry.cycle.slot}`;
      alive.add(key);
      const current = stateAt(entry.periods, now).current;
      if (this.seen.has(key) && !samePeriod(this.seen.get(key), current)) {
        events.push(...transitionEvents(entry, this.seen.get(key), current, language, now));
      }
      this.seen.set(key, current);
    }
    for (const key of this.seen.keys()) {
      if (!alive.has(key)) {
        this.seen.delete(key);
      }
    }
    return events;
  }
}

/** The shared cycle a scene asks for: by calendar name, else the first one. */
export function findCycle(entries, calendar) {
  const wanted = fold(calendar);
  return entries.find((entry) => !wanted || fold(entry.name) === wanted);
}

/**
 * Where a cycle stands at `now`, for the `cycle_status` action and the widget.
 */
export function cycleStatus(entry, language, now) {
  const names = pick(STATE_TEXT, language);
  const { current, next, changeAt } = stateAt(entry.periods, now);
  const code = current?.code ?? 'rest';
  // Today: for shift work, the shift starting today (the "poste du jour",
  // a night shift belongs to the evening it starts); for custody, who has
  // the children at noon.
  const today = localDate(now);
  let todayCode;
  if (entry.cycle.kind === CUSTODY) {
    todayCode = stateAt(entry.periods, localTime(today, 12 * 60)).current?.code ?? 'rest';
  } else {
    const tomorrow = localTime(addDays(today, 1), 0);
    todayCode =
      entry.periods.find((period) => period.start >= localTime(today, 0) && period.start < tomorrow)
        ?.code ?? 'rest';
  }
  const nextCode = current ? (entry.cycle.kind === CUSTODY ? next?.code : 'rest') : next?.code;
  return {
    code,
    active: code === 'me' || SHIFT_CODES.includes(code) ? 1 : 0,
    state: names[code] ?? names.rest,
    today: names[todayCode] ?? names.rest,
    next_state: nextCode ? names[nextCode] : '',
    next_change: changeAt === null ? '' : formatWhen(changeAt, language),
    minutes_until_change:
      changeAt === null ? -1 : Math.max(0, Math.round((changeAt - now) / 60_000)),
  };
}

export const SCENE_ACTIONS = {
  /**
   * @param {{ syncer: import('./syncer.js').Syncer, config: object, now: number }} context
   * @param {{ calendar?: string }} fields
   */
  async cycle_status({ syncer, config, now }, fields = {}) {
    const entry = findCycle(syncer.sharedCycles(), fields.calendar);
    if (!entry) {
      return {
        found: 0,
        active: 0,
        state: '',
        today: '',
        next_state: '',
        next_change: '',
        minutes_until_change: -1,
        calendar: '',
      };
    }
    const { code, ...status } = cycleStatus(entry, config.language, now);
    void code;
    return { found: 1, ...status, calendar: entry.name };
  },
};
