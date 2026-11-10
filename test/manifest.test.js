// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  CYCLE_COUNT,
  CYCLE_FIELDS,
  DEFAULT_CONFIG,
  FIRST_OPTIONS,
  HORIZON_MONTHS,
  LANGUAGES,
  accountKey,
} from '../src/config.js';
import { registerHandlers } from '../src/app.js';
import { CYCLE_TYPES } from '../src/patterns.js';
import {
  CUSTODY_CHANGES,
  SCENE_ACTIONS,
  SCENE_TRIGGER_KEYS,
  SHIFT_CHANGES,
  SHIFT_CODES,
} from '../src/scenes.js';
import { CYCLES_WIDGET, WIDGET_DAYS } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionsOf = (field) => field.options.map((option) => option.value);
const field = (list, key) => list.find((entry) => entry.key === key);

test('a local calendar integration, for Gladys 5.2.0 and later', () => {
  // `type: "calendar"` and `account_schema` came with 5.2.0.
  assert.equal(manifest.type, 'calendar');
  assert.equal(manifest.gladys_version, '>=5.2.0');
  assert.deepEqual(manifest.categories, ['services']);
  // Everything is computed in the container: no network at all.
  assert.deepEqual(manifest.transports, ['local']);
});

test('the account offers the same fields for every cycle slot', () => {
  const fields = manifest.account_schema;
  assert.equal(fields[0].type, 'section');
  for (let slot = 1; slot <= CYCLE_COUNT; slot += 1) {
    assert.equal(field(fields, accountKey(slot, 'section')).type, 'section');
    for (const name of CYCLE_FIELDS) {
      const entry = field(fields, accountKey(slot, name));
      assert.ok(entry, accountKey(slot, name));
      assert.equal(entry.required, undefined, 'a slot can stay unused');
    }
    assert.deepEqual(optionsOf(field(fields, accountKey(slot, 'type'))), CYCLE_TYPES);
    assert.equal(field(fields, accountKey(slot, 'type')).default, 'none');
    assert.deepEqual(optionsOf(field(fields, accountKey(slot, 'first'))), FIRST_OPTIONS);
  }
  assert.equal(fields.length, 1 + CYCLE_COUNT * (1 + CYCLE_FIELDS.length));
});

test('config_schema defaults and choices are the ones of the code', () => {
  const settings = manifest.config_schema.filter((item) => item.type !== 'section');
  for (const entry of settings) {
    assert.equal(DEFAULT_CONFIG[entry.key], entry.default, `default of ${entry.key}`);
  }
  assert.deepEqual(Object.keys(DEFAULT_CONFIG).sort(), keysOf(settings).sort());
  assert.deepEqual(optionsOf(field(manifest.config_schema, 'horizon_months')), HORIZON_MONTHS);
  assert.deepEqual(optionsOf(field(manifest.config_schema, 'language')), LANGUAGES);
});

test('every declared scene action and widget has a handler', async () => {
  const gladys = createFakeGladys();
  registerHandlers(gladys, { timers: false });
  assert.equal(manifest.actions, undefined);
  assert.deepEqual(keysOf(manifest.scene_actions), Object.keys(SCENE_ACTIONS));
  for (const key of keysOf(manifest.scene_actions)) {
    const ack = await gladys.fake.sceneAction(key, {});
    assert.equal(ack.success, true, `${key}: ${ack.error}`);
    assert.deepEqual(
      Object.keys(ack.data.outputs),
      keysOf(field(manifest.scene_actions, key).outputs),
    );
  }
  assert.deepEqual(keysOf(manifest.widgets), [CYCLES_WIDGET]);
  const ack = await gladys.fake.widgetGet(CYCLES_WIDGET, {
    settings: {},
    language: 'en',
    units: 'metric',
  });
  assert.equal(ack.success, true);
});

test('the scene triggers fired by the code are the declared ones, with their filters', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), SCENE_TRIGGER_KEYS);
  const custody = field(manifest.scene_triggers, 'custody_changed');
  assert.deepEqual(optionsOf(field(custody.fields, 'change')), CUSTODY_CHANGES);
  assert.deepEqual(keysOf(custody.variables), [
    'calendar',
    'user',
    'change',
    'change_label',
    'present',
    'next_change',
  ]);
  const shift = field(manifest.scene_triggers, 'shift_changed');
  assert.deepEqual(optionsOf(field(shift.fields, 'change')), SHIFT_CHANGES);
  assert.deepEqual(optionsOf(field(shift.fields, 'shift')), SHIFT_CODES);
  assert.deepEqual(keysOf(shift.variables), [
    'calendar',
    'user',
    'change',
    'change_label',
    'shift',
    'shift_label',
    'start',
    'end',
  ]);
});

test('the widget settings are the ones the code reads', () => {
  const [widget] = manifest.widgets;
  assert.deepEqual(keysOf(widget.settings), ['calendars', 'show_upcoming', 'days']);
  assert.deepEqual(optionsOf(field(widget.settings, 'days')), WIDGET_DAYS);
  assert.equal(field(widget.settings, 'show_upcoming').default, true);
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-cycles:${manifest.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-cycles/main/cover.png',
  );
});

test('section fields are purely presentational', () => {
  for (const section of [...manifest.config_schema, ...manifest.account_schema].filter(
    (entry) => entry.type === 'section',
  )) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
  }
});
