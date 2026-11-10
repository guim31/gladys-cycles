// -----------------------------------------------------------------------------
// A test world: the SDK's fake Gladys (which checks the calendar contract like
// the core: enabled users, `sync: false` → 403, window overlap, prune), a
// settable clock and no timers. Times are read in Europe/Paris, the TZ the
// supervisor injects for a French instance.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';

process.env.TZ = 'Europe/Paris';

export const NOW = Date.parse('2026-10-12T06:00:00.000Z'); // Monday 12 October 2026, 08:00 in Paris

export function account(selector, config, language = 'fr') {
  const firstName = selector[0].toUpperCase() + selector.slice(1);
  return { user: { selector, first_name: firstName, language }, config };
}

/**
 * @param {object} [options]
 * @param {object[]} [options.accounts] calendar accounts
 * @param {object} [options.config] admin config
 * @param {object[]} [options.calendars] calendars already in Gladys
 * @param {number} [options.now]
 */
export async function createWorld(options = {}) {
  const clock = { now: options.now ?? NOW };
  const gladys = createFakeGladys({
    config: options.config ?? {},
    calendarAccounts: options.accounts ?? [],
    calendars: options.calendars ?? [],
    logger: options.logger,
  });
  const app = registerHandlers(gladys, {
    now: () => clock.now,
    sleep: async () => {},
    timers: false,
  });
  await gladys.connect();
  await app.idle();
  return {
    gladys,
    fake: gladys.fake,
    app,
    syncer: app.syncer,
    clock,
    eventsOf(calendarExternalId) {
      return gladys.fake.calendarEvents
        .filter((event) => event.calendar_external_id === calendarExternalId)
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    },
    calendarNamed(name) {
      return gladys.fake.calendars.find((calendar) => calendar.name === name);
    },
    /** The user shares a calendar (the toggle of "My calendars"). */
    async share(name, shared = true) {
      const calendar = gladys.fake.calendars.find((entry) => entry.name === name);
      calendar.shared = shared;
      await gladys.fake.calendarAccountUpdated(calendar.user);
      await app.idle();
    },
    async editAccount(selector, config) {
      const entry = gladys.fake.calendarAccounts.find((a) => a.user.selector === selector);
      entry.config = config;
      await gladys.fake.calendarAccountUpdated(selector);
      await app.idle();
    },
  };
}
