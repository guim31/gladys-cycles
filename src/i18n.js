// -----------------------------------------------------------------------------
// Texts produced by the container, in the four languages of the Gladys
// interface. Event names and calendar descriptions follow the language of
// the user who owns the calendar; scene texts follow the `language` setting
// (a scene action carries no user); the widget the language of the viewer.
// -----------------------------------------------------------------------------

import { formatMinutes } from './time.js';

export const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** Names of the states: the events of the calendars, the scene labels. */
export const STATE_TEXT = {
  en: {
    me: 'Children with me',
    other: 'Children with the other parent',
    morning: 'Morning shift',
    afternoon: 'Afternoon shift',
    night: 'Night shift',
    day: 'Day shift',
    on_call: 'On call',
    rest: 'Off duty',
  },
  fr: {
    me: 'Enfants chez moi',
    other: "Enfants chez l'autre parent",
    morning: 'Poste du matin',
    afternoon: "Poste d'après-midi",
    night: 'Poste de nuit',
    day: 'Poste de jour',
    on_call: 'Astreinte',
    rest: 'Repos',
  },
  de: {
    me: 'Kinder bei mir',
    other: 'Kinder beim anderen Elternteil',
    morning: 'Frühschicht',
    afternoon: 'Spätschicht',
    night: 'Nachtschicht',
    day: 'Tagschicht',
    on_call: 'Bereitschaft',
    rest: 'Frei',
  },
  es: {
    me: 'Niños conmigo',
    other: 'Niños con el otro progenitor',
    morning: 'Turno de mañana',
    afternoon: 'Turno de tarde',
    night: 'Turno de noche',
    day: 'Turno de día',
    on_call: 'Guardia',
    rest: 'Descanso',
  },
};

/** Default calendar names, by kind of cycle. */
export const CALENDAR_TEXT = {
  en: { custody: 'Shared custody', shift: 'Shift work', on_call: 'On-call duty' },
  fr: { custody: 'Garde alternée', shift: 'Travail posté', on_call: 'Astreintes' },
  de: { custody: 'Wechselmodell', shift: 'Schichtarbeit', on_call: 'Bereitschaftsdienst' },
  es: { custody: 'Custodia compartida', shift: 'Trabajo por turnos', on_call: 'Guardias' },
};

/** Why a cycle produces nothing: shown as the description of its calendar. */
export const ERROR_TEXT = {
  en: {
    start: 'No events: the start date cannot be read. Write it as 2026-09-04 or 04/09/2026.',
    time: 'No events: the handover time cannot be read. Write it as 18:00.',
    pattern: 'No events: the custom pattern cannot be read. See the documentation.',
    hours: 'No events: the shift hours cannot be read. Write them as M=06:00-14:00; N=22:00-06:00.',
  },
  fr: {
    start: 'Aucun événement : date de départ illisible. Écrivez-la 2026-09-04 ou 04/09/2026.',
    time: 'Aucun événement : heure de passage illisible. Écrivez-la 18:00.',
    pattern: 'Aucun événement : suite personnalisée illisible. Voir la documentation.',
    hours: 'Aucun événement : horaires illisibles. Écrivez-les M=06:00-14:00; N=22:00-06:00.',
  },
  de: {
    start: 'Keine Termine: Startdatum unlesbar. Schreibe es als 2026-09-04 oder 04.09.2026.',
    time: 'Keine Termine: Übergabezeit unlesbar. Schreibe sie als 18:00.',
    pattern: 'Keine Termine: eigene Folge unlesbar. Siehe die Dokumentation.',
    hours: 'Keine Termine: Schichtzeiten unlesbar. Schreibe sie als M=06:00-14:00; N=22:00-06:00.',
  },
  es: {
    start: 'Sin eventos: fecha de inicio ilegible. Escríbala 2026-09-04 o 04/09/2026.',
    time: 'Sin eventos: hora de entrega ilegible. Escríbala 18:00.',
    pattern: 'Sin eventos: secuencia personalizada ilegible. Consulte la documentación.',
    hours: 'Sin eventos: horarios ilegibles. Escríbalos M=06:00-14:00; N=22:00-06:00.',
  },
};

/** Other texts: calendar descriptions, widget, scene changes. */
export const TEXT = {
  en: {
    since: (date) => `Generated from ${date}.`,
    handover: (time) => `Handover at ${time}.`,
    arrival: 'Children arrive',
    departure: 'Children leave',
    start: 'Shift starts',
    end: 'Shift ends',
    loading: 'Loading the cycles…',
    noShared: 'No shared cycle calendar. Share one in Integrations → Cycles → My calendars.',
    nothing: 'No change in the coming days.',
    until: (when) => `until ${when}`,
    from: (when) => `from ${when}`,
  },
  fr: {
    since: (date) => `Généré à partir du ${date}.`,
    handover: (time) => `Passage à ${time}.`,
    arrival: 'Arrivée des enfants',
    departure: 'Départ des enfants',
    start: 'Début de poste',
    end: 'Fin de poste',
    loading: 'Chargement des cycles…',
    noShared:
      'Aucun calendrier de cycle partagé. Partagez-en un dans Intégrations → Cycles → Mes calendriers.',
    nothing: 'Aucun changement dans les prochains jours.',
    until: (when) => `jusqu'à ${when}`,
    from: (when) => `à partir de ${when}`,
  },
  de: {
    since: (date) => `Erzeugt ab ${date}.`,
    handover: (time) => `Übergabe um ${time}.`,
    arrival: 'Kinder kommen',
    departure: 'Kinder gehen',
    start: 'Schichtbeginn',
    end: 'Schichtende',
    loading: 'Zyklen werden geladen…',
    noShared:
      'Kein geteilter Zyklus-Kalender. Teile einen unter Integrationen → Cycles → Meine Kalender.',
    nothing: 'Keine Änderung in den nächsten Tagen.',
    until: (when) => `bis ${when}`,
    from: (when) => `ab ${when}`,
  },
  es: {
    since: (date) => `Generado a partir del ${date}.`,
    handover: (time) => `Entrega a las ${time}.`,
    arrival: 'Llegan los niños',
    departure: 'Se van los niños',
    start: 'Empieza el turno',
    end: 'Termina el turno',
    loading: 'Cargando los ciclos…',
    noShared:
      'Ningún calendario de ciclo compartido. Comparta uno en Integraciones → Cycles → Mis calendarios.',
    nothing: 'Ningún cambio en los próximos días.',
    until: (when) => `hasta ${when}`,
    from: (when) => `desde ${when}`,
  },
};

/** The table of a language, English when unknown. */
export function pick(table, language) {
  return table[language] ?? table.en;
}

/** `Fri 14 Nov, 18:00`, in the local time zone. */
export function formatWhen(timestamp, language) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

/** `14/11/2026` (or the order of the language) of a `YYYY-MM-DD` date. */
export function formatDate(dateString, language) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** The default name of the calendar of a cycle. */
export function defaultCalendarName(cycle, language) {
  const text = pick(CALENDAR_TEXT, language);
  if (cycle.kind === 'custody') {
    return text.custody;
  }
  return cycle.type.startsWith('on_call') ? text.on_call : text.shift;
}

/** The description of the calendar of a cycle: what it is, or why it is empty. */
export function calendarDescription(cycle, language) {
  if (cycle.error) {
    return pick(ERROR_TEXT, language)[cycle.error];
  }
  const text = pick(TEXT, language);
  const parts = [];
  if (cycle.start) {
    parts.push(text.since(formatDate(cycle.start, language)));
  }
  if (cycle.kind === 'custody' || cycle.type.startsWith('on_call')) {
    parts.push(text.handover(formatMinutes(cycle.time)));
  }
  return parts.join(' ') || pick(CALENDAR_TEXT, language).custody;
}
