// -----------------------------------------------------------------------------
// Dashboard widget "Cycles": where each shared cycle stands now (children at
// home or not, shift running or rest), then the coming changes. Shared
// calendars only: a dashboard is seen by the whole household.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { STATE_TEXT, TEXT, formatWhen, pick } from './i18n.js';
import { cycleStatus, fold } from './scenes.js';

export const CYCLES_WIDGET = 'cycles';
export const WIDGET_DAYS = ['3', '7', '14'];
const MAX_ITEMS = 8;
const MAX_ROWS = 10;

export const ICONS = {
  me: 'home',
  other: 'user',
  morning: 'sunrise',
  afternoon: 'sun',
  night: 'moon',
  day: 'sun',
  on_call: 'phone',
  rest: 'coffee',
};

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The calendar names of the `calendars` setting, folded. */
export function parseCalendarFilter(setting) {
  return String(setting ?? '')
    .split(/[,;\n]/)
    .map(fold)
    .filter(Boolean);
}

/**
 * The widget content.
 * @param {import('./syncer.js').Syncer} syncer
 * @param {{ settings?: object, language?: string, now: number }} request
 */
export function cyclesContent(syncer, { settings = {}, language = 'en', now }) {
  const text = pick(TEXT, language);
  const names = pick(STATE_TEXT, language);
  if (!syncer.ready) {
    return {
      ttl_seconds: 30,
      components: [{ type: 'text', variant: 'caption', text: text.loading }],
    };
  }
  const wanted = parseCalendarFilter(settings.calendars);
  const entries = syncer
    .sharedCycles()
    .filter((entry) => wanted.length === 0 || wanted.includes(fold(entry.name)));
  if (entries.length === 0) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: text.noShared }],
    };
  }
  const users = new Set(entries.map((entry) => entry.userSelector)).size;
  const title = (entry) => (users > 1 ? `${entry.name} (${entry.user})` : entry.name);

  const components = [
    {
      type: 'status',
      items: entries.slice(0, MAX_ROWS).map((entry) => {
        const status = cycleStatus(entry, language, now);
        return {
          label: truncate(title(entry), 40),
          value: truncate(status.state, 40),
          icon: ICONS[status.code],
          color: status.active ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
        };
      }),
    },
  ];

  if (settings.show_upcoming !== false) {
    const days = Number(WIDGET_DAYS.includes(String(settings.days)) ? settings.days : '7');
    const horizon = now + days * 86_400_000;
    const items = entries
      .flatMap((entry) =>
        entry.periods
          .filter((period) => period.start > now && period.start < horizon)
          .map((period) => ({ entry, period })),
      )
      .sort((a, b) => a.period.start - b.period.start)
      .slice(0, MAX_ITEMS);
    if (items.length === 0) {
      components.push({ type: 'text', variant: 'caption', text: text.nothing });
    } else {
      components.push({
        type: 'card-list',
        display: 'list',
        items: items.map(({ entry, period }) => ({
          title: truncate(names[period.code], 60),
          subtitle: truncate(
            `${formatWhen(period.start, language)} → ${formatWhen(period.end, language)}`,
            60,
          ),
          ...(entries.length > 1
            ? { badge: { text: truncate(entry.name, 16), color: WIDGET_COLORS.INFO } }
            : {}),
        })),
      });
    }
  }
  return { ttl_seconds: 300, components };
}
