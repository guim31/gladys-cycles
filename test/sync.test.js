// -----------------------------------------------------------------------------
// The synchronization end to end, against the SDK's fake Gladys: one calendar
// per configured cycle, a sliding window republished without duplicates, the
// user's `sync` toggle respected, a slot set back to "none" removed.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOW, account, createWorld } from './helpers/world.js';

const DAY = 86_400_000;
const custody = {
  cycle_1_type: 'custody_2_2_3',
  cycle_1_start: '2026-09-07',
  cycle_1_name: 'Garde Léo',
};
const shifts = { cycle_2_type: 'shift_5x8', cycle_2_start: '2026-10-01' };

test('every enabled user gets one calendar per cycle, in their language', async () => {
  const world = await createWorld({
    accounts: [account('alice', { ...custody, ...shifts }), account('bob', shifts, 'en')],
  });
  assert.deepEqual(
    world.fake.calendars.map((c) => [c.user, c.external_id, c.name, c.sync, c.shared]),
    [
      ['alice', 'ext:test-integration:alice:cycle-1', 'Garde Léo', true, false],
      ['alice', 'ext:test-integration:alice:cycle-2', 'Travail posté', true, false],
      ['bob', 'ext:test-integration:bob:cycle-2', 'Shift work', true, false],
    ],
  );
  const events = world.eventsOf('ext:test-integration:alice:cycle-1');
  assert.ok(events.length > 70, `${events.length} custody periods over 6 months`);
  for (const event of events) {
    assert.match(
      event.external_id,
      /^ext:test-integration:alice:cycle-1:\d{4}-\d{2}-\d{2}:(me|other)$/,
    );
    assert.ok(['Enfants chez moi', "Enfants chez l'autre parent"].includes(event.name));
  }
  // The window: from a week back to 6 months ahead (the default).
  assert.ok(Date.parse(events[0].end) > NOW - 7 * DAY - 3 * DAY);
  assert.ok(Date.parse(events.at(-1).start) <= NOW + 185 * DAY);
  assert.ok(Date.parse(events.at(-1).start) > NOW + 175 * DAY);
  const bobs = world.eventsOf('ext:test-integration:bob:cycle-2');
  assert.ok(bobs.every((event) => event.name.endsWith('shift')));
});

test('the window slides without duplicates, and a new setting replaces the events', async () => {
  const world = await createWorld({ accounts: [account('alice', custody)] });
  const id = 'ext:test-integration:alice:cycle-1';
  const before = world.eventsOf(id).length;

  world.clock.now = NOW + DAY;
  await world.syncer.syncAll();
  const ids = world.eventsOf(id).map((event) => event.external_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(Math.abs(ids.length - before) <= 1);

  // Another model in the same slot: the old periods are pruned by the window.
  await world.editAccount('alice', { ...custody, cycle_1_type: 'custody_1_1' });
  const weekly = world.eventsOf(id);
  assert.ok(weekly.length < before / 2, `${weekly.length} weekly periods`);
  for (let i = 1; i < weekly.length; i += 1) {
    assert.equal(weekly[i].start, weekly[i - 1].end, 'periods follow each other');
  }
});

test('a slot set back to "none" loses its calendar, a disabled user is forgotten', async () => {
  const world = await createWorld({ accounts: [account('alice', { ...custody, ...shifts })] });
  await world.editAccount('alice', { ...custody, cycle_2_type: 'none' });
  assert.deepEqual(world.fake.deletedCalendars, ['ext:test-integration:alice:cycle-2']);
  assert.deepEqual(
    world.fake.calendars.map((c) => c.external_id),
    ['ext:test-integration:alice:cycle-1'],
  );

  world.fake.calendarAccounts = [];
  world.fake.calendars = [];
  await world.fake.calendarAccountUpdated('alice');
  await world.app.idle();
  assert.equal(world.syncer.users.size, 0);
});

test('a calendar switched off by its owner is not filled, the others are', async () => {
  const world = await createWorld({ accounts: [account('alice', { ...custody, ...shifts })] });
  const off = world.fake.calendars.find((c) => c.external_id.endsWith('cycle-2'));
  off.sync = false;
  world.fake.calendarEvents = world.fake.calendarEvents.filter(
    (event) => event.calendar_external_id !== off.external_id,
  );
  world.clock.now = NOW + DAY;
  await world.fake.calendarAccountUpdated('alice');
  await world.app.idle();
  assert.equal(world.eventsOf(off.external_id).length, 0);
  assert.ok(world.eventsOf('ext:test-integration:alice:cycle-1').length > 0);
  assert.equal(
    world.fake.requests.filter((request) => request.status === 403).length,
    0,
    'no push to a calendar the user switched off',
  );
});

test('an unreadable setting empties the calendar and says why in its description', async () => {
  const world = await createWorld({ accounts: [account('alice', custody)] });
  await world.editAccount('alice', { ...custody, cycle_1_start: '31/02/2026' });
  const [calendar] = world.fake.calendars;
  assert.match(calendar.description, /date de départ illisible/);
  assert.equal(world.eventsOf(calendar.external_id).length, 0);
});

test('the horizon setting: a year of daily shifts in one request', async () => {
  const daily = {
    cycle_1_type: 'shift_custom',
    cycle_1_start: '2026-01-01',
    cycle_1_pattern: 'MAN',
  };
  const world = await createWorld({
    accounts: [account('alice', daily)],
    config: { horizon_months: '12' },
  });
  const events = world.eventsOf('ext:test-integration:alice:cycle-1');
  // One shift a day, a week back and twelve months ahead: under the 500 of a request.
  assert.ok(events.length >= 370 && events.length <= 375, `${events.length} shifts`);
  assert.ok(world.fake.requests.every((request) => request.status === 200));
});

test('a normal synchronization writes nothing at the info level', async (t) => {
  const world = await createWorld({ accounts: [account('alice', { ...custody, ...shifts })] });
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  for (const stream of [process.stdout, process.stderr]) {
    t.mock.method(stream, 'write', (chunk) => {
      lines.push(...String(chunk).split('\n').filter(Boolean));
      return true;
    });
  }
  world.clock.now = NOW + DAY;
  await world.syncer.syncAll();
  await world.app.tick();
  t.mock.restoreAll();
  if (previous === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = previous;
  }
  assert.deepEqual(lines, []);
});

test('the write limiter waits once 25 writes were made within a minute', async () => {
  const { createLimiter } = await import('../src/syncer.js');
  let now = 0;
  const waits = [];
  const limit = createLimiter({
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms);
      now += ms;
    },
  });
  for (let i = 0; i < 26; i += 1) {
    await limit();
  }
  assert.deepEqual(waits, [60_000]);
});

test('a shorter horizon removes the events beyond it', async () => {
  const world = await createWorld({
    accounts: [account('alice', custody)],
    config: { horizon_months: '12' },
  });
  const id = 'ext:test-integration:alice:cycle-1';
  const lastOf = () => Date.parse(world.eventsOf(id).at(-1).start);
  assert.ok(lastOf() > NOW + 360 * DAY);
  await world.fake.configUpdated({ horizon_months: '3' });
  await world.app.idle();
  assert.ok(lastOf() < NOW + 95 * DAY);
});

test('two cycles under the same name get their slot number', async () => {
  const world = await createWorld({
    accounts: [
      account('alice', {
        cycle_1_type: 'custody_1_1',
        cycle_1_start: '2026-09-04',
        cycle_3_type: 'custody_weekends_2_4',
      }),
    ],
  });
  assert.deepEqual(
    world.fake.calendars.map((c) => c.name),
    ['Garde alternée', 'Garde alternée (3)'],
  );
});

test('a calendar switched off during the synchronization does not stop the others', async (t) => {
  const world = await createWorld({ accounts: [account('alice', { ...custody, ...shifts })] });
  const original = world.gladys.publishCalendarEvents.bind(world.gladys);
  t.mock.method(world.gladys, 'publishCalendarEvents', async (id, events, window) => {
    if (id.endsWith('cycle-1')) {
      const err = new Error('calendar sync disabled');
      err.status = 403;
      throw err;
    }
    return original(id, events, window);
  });
  world.clock.now = NOW + DAY;
  await world.syncer.syncAll();
  const calls = world.gladys.publishCalendarEvents.mock.calls.map((call) => call.arguments[0]);
  assert.deepEqual(calls, [
    'ext:test-integration:alice:cycle-1',
    'ext:test-integration:alice:cycle-2',
  ]);
  const [first] = world.syncer.users.get('alice').cycles;
  assert.equal(first.sync, false);
});

test('a failed first synchronization is retried', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { createFakeGladys } = await import('@gladysassistant/integration-sdk/testing');
  const { registerHandlers } = await import('../src/app.js');
  const gladys = createFakeGladys({ calendarAccounts: [account('alice', custody)] });
  let fail = true;
  const original = gladys.getCalendarAccounts.bind(gladys);
  t.mock.method(gladys, 'getCalendarAccounts', async () => {
    if (fail) {
      throw new Error('core starting');
    }
    return original();
  });
  const app = registerHandlers(gladys, { now: () => NOW, sleep: async () => {} });
  await gladys.connect();
  await app.idle();
  assert.equal(app.syncer.ready, false);
  fail = false;
  t.mock.timers.tick(30_000);
  await new Promise((resolve) => setImmediate(resolve));
  await app.idle();
  assert.equal(app.syncer.ready, true);
  assert.equal(gladys.fake.calendars.length, 1);
  await app.stop();
});
