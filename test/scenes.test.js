// -----------------------------------------------------------------------------
// Scene triggers, scene action and widget: shared calendars only, a scene at
// each real transition, none at start-up nor when the settings change.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { NOW, account, createWorld } from './helpers/world.js';

const MINUTE = 60_000;
const at = (iso) => Date.parse(iso);

// One week in two from Friday 9 October 2026, 18:00: at NOW (Monday 12,
// 08:00) the children are here, they leave on Friday 16 at 18:00.
const custody = { cycle_1_type: 'custody_1_1', cycle_1_start: '2026-10-09' };
// 2x8 from Monday 12 October: mornings 06:00-14:00 this week.
const shifts = { cycle_2_type: 'shift_2x8', cycle_2_start: '2026-10-12', cycle_2_name: 'Usine' };

async function sharedWorld(config = { ...custody, ...shifts }) {
  const world = await createWorld({ accounts: [account('alice', config)] });
  for (const calendar of [...world.fake.calendars]) {
    await world.share(calendar.name);
  }
  await world.app.tick();
  world.fake.sceneEvents.length = 0;
  return world;
}

test('no scene from a private calendar, nor at the first look', async () => {
  const world = await createWorld({ accounts: [account('alice', { ...custody, ...shifts })] });
  world.clock.now = at('2026-10-16T18:00:30+02:00');
  assert.equal(await world.app.tick(), 0);
  const ack = await world.fake.sceneAction('cycle_status', {});
  assert.equal(ack.data.outputs.found, 0);
  assert.equal(world.fake.sceneEvents.length, 0);
});

test('the children leave and come back at the handover time', async () => {
  const world = await sharedWorld();
  world.clock.now = at('2026-10-16T17:59:00+02:00');
  await world.app.tick();
  assert.equal(world.fake.sceneEvents.filter((e) => e.key === 'custody_changed').length, 0);

  world.clock.now = at('2026-10-16T18:00:20+02:00');
  await world.app.tick();
  const [left] = world.fake.sceneEvents.filter((e) => e.key === 'custody_changed');
  assert.deepEqual(left.data, {
    calendar: 'Garde alternée',
    user: 'Alice',
    change: 'departure',
    change_label: 'Départ des enfants',
    present: 0,
    next_change: 'ven. 23 oct., 18:00',
  });

  world.clock.now = at('2026-10-23T18:00:10+02:00');
  await world.app.tick();
  const back = world.fake.sceneEvents.filter((e) => e.key === 'custody_changed');
  assert.equal(back.length, 2);
  assert.equal(back[1].data.change, 'arrival');
  assert.equal(back[1].data.present, 1);
});

test('a shift starts and ends; a night off fires nothing', async () => {
  const world = await sharedWorld();
  world.clock.now = at('2026-10-12T14:00:10+02:00');
  await world.app.tick();
  world.clock.now = at('2026-10-12T20:00:00+02:00');
  await world.app.tick();
  world.clock.now = at('2026-10-13T06:00:05+02:00');
  await world.app.tick();
  const shifts = world.fake.sceneEvents.filter((e) => e.key === 'shift_changed');
  assert.deepEqual(
    shifts.map((e) => [e.data.change, e.data.shift, e.data.calendar]),
    [
      ['end', 'morning', 'Usine'],
      ['start', 'morning', 'Usine'],
    ],
  );
  assert.equal(shifts[1].data.shift_label, 'Poste du matin');
  assert.equal(shifts[1].data.start, 'mar. 13 oct., 06:00');
  assert.equal(shifts[1].data.end, 'mar. 13 oct., 14:00');
});

test('the daily slide of the window and an edit of the settings fire nothing', async () => {
  const world = await sharedWorld();
  await world.syncer.syncAll();
  assert.equal(await world.app.tick(), 0);
  // The start date moves by a week: the children are suddenly away, silently.
  await world.editAccount('alice', { ...custody, ...shifts, cycle_1_start: '2026-10-02' });
  assert.equal(world.fake.sceneEvents.length, 0);
  const ack = await world.fake.sceneAction('cycle_status', { calendar: 'garde alternee' });
  assert.equal(ack.data.outputs.active, 0);
});

test('cycle_status: now, today, the next change, by calendar name', async () => {
  const world = await sharedWorld();
  const custodyStatus = (await world.fake.sceneAction('cycle_status', {})).data.outputs;
  assert.deepEqual(custodyStatus, {
    found: 1,
    active: 1,
    state: 'Enfants chez moi',
    today: 'Enfants chez moi',
    next_state: "Enfants chez l'autre parent",
    next_change: 'ven. 16 oct., 18:00',
    minutes_until_change: (at('2026-10-16T18:00:00+02:00') - NOW) / MINUTE,
    calendar: 'Garde alternée',
  });
  world.clock.now = at('2026-10-12T15:00:00+02:00');
  const shiftStatus = (await world.fake.sceneAction('cycle_status', { calendar: 'USINE' })).data
    .outputs;
  assert.deepEqual(shiftStatus, {
    found: 1,
    active: 0,
    state: 'Repos',
    today: 'Poste du matin',
    next_state: 'Poste du matin',
    next_change: 'mar. 13 oct., 06:00',
    minutes_until_change: 15 * 60,
    calendar: 'Usine',
  });
  const missing = (await world.fake.sceneAction('cycle_status', { calendar: 'Nope' })).data.outputs;
  assert.equal(missing.found, 0);
});

test('the widget: states, then the coming changes, valid for the core', async () => {
  const world = await sharedWorld();
  const ack = await world.fake.widgetGet('cycles', {
    settings: { days: '3' },
    language: 'en',
    units: 'metric',
  });
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  const [status, list] = content.components;
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value, item.icon, item.color]),
    [
      ['Garde alternée', 'Children with me', 'home', 'success'],
      ['Usine', 'Morning shift', 'sunrise', 'success'],
    ],
  );
  assert.equal(list.type, 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.badge.text]),
    // Tuesday, Wednesday and Thursday mornings: the custody changes on Friday.
    Array(3).fill(['Morning shift', 'Usine']),
  );

  const hidden = await world.fake.widgetGet('cycles', {
    settings: { show_upcoming: false, calendars: 'usine' },
    language: 'de',
    units: 'metric',
  });
  assert.deepEqual(
    hidden.data.content.components.map((component) => component.type),
    ['status'],
  );
  assert.equal(hidden.data.content.components[0].items[0].value, 'Frühschicht');
});

test('the widget says when nothing is shared', async () => {
  const world = await createWorld({ accounts: [account('alice', custody)] });
  const ack = await world.fake.widgetGet('cycles', {
    settings: {},
    language: 'fr',
    units: 'metric',
  });
  assert.match(ack.data.content.components[0].text, /Aucun calendrier de cycle partagé/);
});

test('a transition seen hours late (a reconnection) fires nothing', async () => {
  const world = await sharedWorld();
  world.clock.now = at('2026-10-16T21:00:00+02:00'); // three hours after the handover
  assert.equal(await world.app.tick(), 0);
  const ack = await world.fake.sceneAction('cycle_status', {});
  assert.equal(ack.data.outputs.active, 0);
});
