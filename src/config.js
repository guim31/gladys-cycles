// -----------------------------------------------------------------------------
// Settings. The admin `config_schema` holds what applies to everyone (how far
// ahead the calendars are generated, the language of the scene texts); each
// user's `account_schema` holds their cycles, CYCLE_COUNT slots of the same
// fields. Defaults mirror the manifest (test/manifest.test.js).
// -----------------------------------------------------------------------------

import { buildCycle } from './patterns.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
export const HORIZON_MONTHS = ['3', '6', '12'];
export const CYCLE_COUNT = 3;
export const CYCLE_FIELDS = ['type', 'name', 'start', 'time', 'first', 'pattern', 'hours'];
export const FIRST_OPTIONS = ['me', 'other'];

export const DEFAULT_CONFIG = {
  horizon_months: '6',
  language: 'fr',
};

/** The admin settings, with defaults for anything missing or unknown. */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG };
  if (HORIZON_MONTHS.includes(String(raw?.horizon_months))) {
    config.horizon_months = String(raw.horizon_months);
  }
  if (LANGUAGES.includes(raw?.language)) {
    config.language = raw.language;
  }
  return config;
}

/** The account key of a field of a slot: `cycle_2_start`. */
export const accountKey = (slot, field) => `cycle_${slot}_${field}`;

/**
 * The cycles of one user's account values (`getCalendarAccounts()[].config`),
 * unused slots left out.
 */
export function parseAccount(values = {}) {
  const cycles = [];
  for (let slot = 1; slot <= CYCLE_COUNT; slot += 1) {
    const fields = Object.fromEntries(
      CYCLE_FIELDS.map((field) => [field, values?.[accountKey(slot, field)]]),
    );
    const cycle = buildCycle(slot, fields);
    if (cycle) {
      cycles.push(cycle);
    }
  }
  return cycles;
}

/** A supported language, else the fallback. */
export function languageOf(value, fallback = DEFAULT_CONFIG.language) {
  const short = String(value ?? '')
    .slice(0, 2)
    .toLowerCase();
  return LANGUAGES.includes(short) ? short : fallback;
}
