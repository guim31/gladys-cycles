// -----------------------------------------------------------------------------
// Synchronization: for every user who enabled the integration, one Gladys
// calendar per configured cycle, filled with the periods of a sliding window
// (a week back, `horizon_months` ahead). Every publication carries the
// window, so the core prunes what the cycle no longer produces: changing a
// setting never leaves duplicates behind.
//
// Identifiers: a calendar is `<user>:cycle-<slot>`, an event
// `<user>:cycle-<slot>:<start date>:<code>`, both under the integration
// prefix. Republishing the same window is a no-op upsert.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { HORIZON_MONTHS, languageOf, parseAccount } from './config.js';
import { STATE_TEXT, calendarDescription, defaultCalendarName, pick } from './i18n.js';
import { periods } from './patterns.js';
import { fold } from './scenes.js';
import { addDays, addMonths, localDate, localTime } from './time.js';

const logger = createLogger({ name: 'sync' });

// The core takes 500 events per request, and a window is one request.
export const MAX_EVENTS = 500;
// Days kept behind today, so that the calendar view shows the past week.
export const PAST_DAYS = 7;
// One colour per slot, so that two cycles of a user read apart.
export const COLORS = ['#1c7ed6', '#e8590c', '#2f9e44'];

/** A short reason for the logs, never a secret (there is none here). */
export const describe = (err) => err?.message ?? String(err);

/**
 * Write limiter: the core accepts 30 calendar writes per minute per
 * integration (429 beyond). Keeps a margin, waits when the minute is full.
 */
export function createLimiter({ now = Date.now, sleep, perMinute = 25 } = {}) {
  const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const stamps = [];
  return async function limit() {
    for (;;) {
      const t = now();
      while (stamps.length > 0 && stamps[0] <= t - 60_000) {
        stamps.shift();
      }
      if (stamps.length < perMinute) {
        stamps.push(t);
        return;
      }
      await wait(stamps[0] + 60_000 - t);
    }
  };
}

export class Syncer {
  /**
   * @param {object} options
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
   * @param {() => object} options.getConfig normalized admin settings
   * @param {() => number} options.now
   * @param {() => Promise<void>} [options.limit] write limiter
   */
  constructor({ gladys, getConfig, now, limit }) {
    this.gladys = gladys;
    this.getConfig = getConfig;
    this.now = now;
    this.limit = limit ?? (async () => {});
    /** userSelector → { selector, name, language, cycles: [...] } */
    this.users = new Map();
    this.ready = false;
    this.running = Promise.resolve();
  }

  /** Runs the synchronizations one after the other. */
  queue(task) {
    const run = this.running.then(task, task);
    this.running = run.catch(() => {});
    return run;
  }

  /** Every enabled user, re-read from the core (the resync contract). */
  syncAll() {
    return this.queue(async () => {
      const accounts = await this.gladys.getCalendarAccounts();
      const calendars = await this.gladys.getCalendars();
      const enabled = new Set(accounts.map((account) => account.user.selector));
      for (const selector of this.users.keys()) {
        if (!enabled.has(selector)) {
          this.users.delete(selector);
        }
      }
      const failures = [];
      for (const account of accounts) {
        const own = calendars.filter((calendar) => calendar.user === account.user.selector);
        try {
          await this.syncAccount(account, own);
        } catch (err) {
          failures.push(`${account.user.selector}: ${describe(err)}`);
        }
      }
      this.ready = true;
      if (failures.length > 0) {
        throw new Error(failures.join('; '));
      }
      return accounts.length;
    });
  }

  /** One user, after they enabled, disabled or changed their account. */
  syncUser(selector) {
    return this.queue(async () => {
      const account = (await this.gladys.getCalendarAccounts()).find(
        (entry) => entry.user.selector === selector,
      );
      if (!account) {
        // Disabled: the core already destroyed their calendars.
        this.users.delete(selector);
        return false;
      }
      await this.syncAccount(account, await this.gladys.getCalendars(selector));
      return true;
    });
  }

  calendarId(selector, slot) {
    return this.gladys.externalId(`${selector}:cycle-${slot}`);
  }

  /**
   * The local days of the generated events, and the end of the pruned
   * window: always the longest horizon, so that shortening the horizon
   * removes the events beyond the new one.
   */
  window() {
    const today = localDate(this.now());
    return {
      fromDate: addDays(today, -PAST_DAYS),
      toDate: addMonths(today, Number(this.getConfig().horizon_months)),
      pruneTo: addMonths(today, Math.max(...HORIZON_MONTHS.map(Number))),
    };
  }

  async syncAccount(account, existing) {
    const { selector } = account.user;
    const language = languageOf(account.user.language, this.getConfig().language);
    const cycles = parseAccount(account.config);
    const { fromDate, toDate, pruneTo } = this.window();

    // Two cycles of a user under the same name (two default names, most
    // often) could not be told apart by the scenes: the later ones take
    // their slot number.
    const taken = new Set();
    const published = cycles.map((cycle) => {
      let name = (cycle.name || defaultCalendarName(cycle, language)).slice(0, 95);
      if (taken.has(fold(name))) {
        name = `${name} (${cycle.slot})`;
      }
      taken.add(fold(name));
      return { cycle, calendarId: this.calendarId(selector, cycle.slot), name };
    });
    if (published.length > 0) {
      await this.limit();
      await this.gladys.publishCalendars(
        selector,
        published.map(({ cycle, calendarId, name }) => ({
          external_id: calendarId,
          name,
          description: calendarDescription(cycle, language),
          color: COLORS[(cycle.slot - 1) % COLORS.length],
        })),
      );
    }
    // A slot set back to "none": its calendar goes, with its events.
    const kept = new Set(published.map((entry) => entry.calendarId));
    for (const calendar of existing) {
      if (!kept.has(calendar.external_id)) {
        await this.limit();
        await this.gladys.deleteCalendar(calendar.external_id);
      }
    }

    const states = [];
    const failures = [];
    const names = pick(STATE_TEXT, language);
    for (const entry of published) {
      const flags = existing.find((calendar) => calendar.external_id === entry.calendarId);
      let sync = flags?.sync !== false;
      let list = periods(entry.cycle, fromDate, toDate);
      let windowEnd = localTime(addDays(pruneTo, 1), 0);
      if (list.length > MAX_EVENTS) {
        list = list.slice(0, MAX_EVENTS);
        windowEnd = list[list.length - 1].end;
      }
      // `sync: false` is the user saying no: the core would answer 403.
      if (sync) {
        await this.limit();
        await this.gladys
          .publishCalendarEvents(
            entry.calendarId,
            list.map((period) => ({
              external_id: this.gladys.externalId(
                `${selector}:cycle-${entry.cycle.slot}:${period.startDate}:${period.code}`,
              ),
              name: names[period.code],
              start: new Date(period.start).toISOString(),
              end: new Date(period.end).toISOString(),
            })),
            {
              from: new Date(localTime(fromDate, 0)).toISOString(),
              to: new Date(windowEnd).toISOString(),
            },
          )
          .catch((err) => {
            // Switched off (403) or account disabled (404) since the list was
            // read: the user's notification follows. The other calendars go on.
            if (err?.status === 403 || err?.status === 404) {
              sync = false;
              return;
            }
            failures.push(`${entry.calendarId}: ${describe(err)}`);
          });
      }
      states.push({ ...entry, periods: list, shared: flags?.shared === true, sync });
    }
    this.users.set(selector, {
      selector,
      name: account.user.first_name || selector,
      language,
      cycles: states,
    });
    logger.debug(`${selector}: ${states.length} cycle(s) published up to ${toDate}`);
    if (failures.length > 0) {
      throw new Error(failures.join('; '));
    }
  }

  /**
   * The cycles of the shared calendars: the ones the household sees, the
   * only ones the scenes and the dashboard use (like the core's calendar
   * scenes). A calendar in error has no periods and is left out.
   */
  sharedCycles() {
    const list = [];
    for (const user of this.users.values()) {
      for (const entry of user.cycles) {
        if (entry.shared && entry.sync && !entry.cycle.error) {
          list.push({ ...entry, user: user.name, userSelector: user.selector });
        }
      }
    }
    return list;
  }

  /** Every cycle with a calendar, shared or not (the transition watcher keys). */
  allCycles() {
    return [...this.users.values()].flatMap((user) =>
      user.cycles.map((entry) => ({ ...entry, user: user.name, userSelector: user.selector })),
    );
  }
}
