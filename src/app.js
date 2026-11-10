// -----------------------------------------------------------------------------
// Wiring between the Gladys SDK and the cycles: the handlers, the daily slide
// of the window, the watcher of the transitions. Takes the SDK client as a
// parameter so the tests drive it with the SDK's fake Gladys.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { Syncer, createLimiter, describe } from './syncer.js';
import { SCENE_ACTIONS, TransitionWatcher } from './scenes.js';
import { CYCLES_WIDGET, cyclesContent } from './widgets.js';
import { addDays, localDate, localTime } from './time.js';

const logger = createLogger({ name: 'app' });

// The watcher looks every 30 s: a scene fires within half a minute of the
// handover or of the start of a shift.
export const TICK_MS = 30_000;
// The window slides once a day, a few minutes after local midnight.
const DAILY_AT_MINUTES = 5;

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [deps] test seams
 * @param {() => number} [deps.now]
 * @param {boolean} [deps.timers] false: no timers (tests drive `tick()`)
 * @param {(ms: number) => Promise<void>} [deps.sleep] for the write limiter
 */
export function registerHandlers(gladys, deps = {}) {
  const now = deps.now ?? Date.now;
  const useTimers = deps.timers !== false;
  let config = normalizeConfig();
  let tickTimer = null;
  let dailyTimer = null;
  let stopped = false;
  let pending = Promise.resolve();
  let failing = false;

  const syncer = new Syncer({
    gladys,
    getConfig: () => config,
    now,
    limit: createLimiter({ now, sleep: deps.sleep }),
  });
  const watcher = new TransitionWatcher();

  const refreshWidget = () => gladys.requestWidgetRefresh(CYCLES_WIDGET);

  // A synchronization failing again and again: one line, not one per try.
  async function run(label, fn) {
    try {
      const result = await fn();
      if (failing) {
        failing = false;
        logger.info('Synchronization works again');
      }
      refreshWidget();
      return result;
    } catch (err) {
      if (!failing) {
        failing = true;
        logger.error(`${label} failed: ${describe(err)}`);
      } else {
        logger.debug(`${label} failed again: ${describe(err)}`);
      }
      return undefined;
    }
  }

  async function tick() {
    if (!syncer.ready) {
      return 0;
    }
    const events = watcher.look(syncer.sharedCycles(), config.language, now());
    for (const event of events) {
      try {
        await gladys.publishSceneEvent(event.key, event.data);
      } catch (err) {
        logger.warn(`Scene trigger ${event.key} not sent: ${describe(err)}`);
      }
    }
    if (events.length > 0) {
      logger.debug(`${events.length} transition(s) sent to the scenes`);
      refreshWidget();
    }
    return events.length;
  }

  function scheduleDaily() {
    clearTimeout(dailyTimer);
    if (!useTimers || stopped) {
      return;
    }
    const next = localTime(addDays(localDate(now()), 1), DAILY_AT_MINUTES);
    dailyTimer = setTimeout(
      async () => {
        if (gladys.connected !== false) {
          await run('Daily generation', () => syncer.syncAll());
        }
        scheduleDaily();
      },
      Math.max(60_000, next - now()),
    );
    dailyTimer.unref?.();
  }

  function startTicking() {
    clearInterval(tickTimer);
    if (!useTimers || stopped) {
      return;
    }
    tickTimer = setInterval(() => {
      tick().catch((err) => logger.warn(`Transition check failed: ${describe(err)}`));
    }, TICK_MS);
    tickTimer.unref?.();
  }

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
    } catch (err) {
      logger.error(`Could not read the configuration: ${describe(err)}`);
    }
    // The resync contract of the calendar type: an account enabled or a
    // calendar switched back on while disconnected is only known by
    // re-reading everything.
    pending = run('Synchronization', () => syncer.syncAll()).then(() => tick());
    scheduleDaily();
    startTicking();
  });

  gladys.on('disconnected', () => {
    clearTimeout(dailyTimer);
    clearInterval(tickTimer);
  });

  gladys.onConfigUpdated(async (newConfig) => {
    const previous = config;
    config = normalizeConfig(newConfig);
    logger.info('Configuration updated');
    if (
      previous.horizon_months !== config.horizon_months ||
      previous.language !== config.language
    ) {
      pending = run('Synchronization', () => syncer.syncAll());
    }
  });

  gladys.onCalendarAccountUpdated(async (userSelector) => {
    logger.info(`Cycles of ${userSelector} updated`);
    // New settings move the periods under the watcher: once they are
    // generated, record where the cycles stand, never fire.
    pending = run('Synchronization', () => syncer.syncUser(userSelector)).then(() => {
      watcher.reset(userSelector);
      return tick();
    });
  });

  gladys.onSceneAction('cycle_status', (fields) =>
    SCENE_ACTIONS.cycle_status({ syncer, config, now: now() }, fields),
  );

  gladys.onWidgetGet(CYCLES_WIDGET, async ({ settings, language }) =>
    cyclesContent(syncer, { settings, language, now: now() }),
  );

  return {
    syncer,
    tick,
    /** Resolves once the synchronization in progress is over (tests). */
    idle: async () => {
      await pending;
      await syncer.running;
    },
    async stop() {
      stopped = true;
      clearTimeout(dailyTimer);
      clearInterval(tickTimer);
    },
  };
}
