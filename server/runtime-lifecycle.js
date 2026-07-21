const DEFAULT_FORCE_EXIT_TIMEOUT_MS = 10000;
const DEFAULT_DRAIN_DELAY_MS = 250;
const DEFAULT_TENDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MIN_TENDER_INTERVAL_MS = 60 * 1000;
const MAX_TENDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function safeErrorSummary(error, fallbackCode = 'RUNTIME_ERROR') {
  try {
    const sourceMessage = typeof error === 'string'
      ? error
      : (typeof error?.message === 'string' ? error.message : 'Runtime operation failed');
    const message = String(sourceMessage || 'Runtime operation failed')
      .replace(/["']?\s*database_url\s*["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;\r\n}]+)/gi, ' DATABASE_URL=[redacted]')
      .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/\beyJ[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,}\b/g, '[redacted]')
      .replace(/(token|secret|password|authorization|cookie)\s*[=:]\s*\S+/gi, '$1=[redacted]');
    return {
      code: String(error?.code || fallbackCode).slice(0, 80),
      message: message.trim().slice(0, 240)
    };
  } catch {
    return { code: 'RUNTIME_ERROR', message: 'Runtime operation failed' };
  }
}

export function createTimerRegistry() {
  const timers = new Map();
  let accepting = true;

  const register = (kind, callback, delayMs) => {
    if (!accepting) return null;
    let handle;
    const wrapped = () => {
      if (kind === 'timeout') timers.delete(handle);
      if (!accepting) return;
      callback();
    };
    handle = kind === 'interval' ? setInterval(wrapped, delayMs) : setTimeout(wrapped, delayMs);
    timers.set(handle, kind);
    return handle;
  };

  return {
    setTimeout(callback, delayMs) {
      return register('timeout', callback, delayMs);
    },
    setInterval(callback, delayMs) {
      return register('interval', callback, delayMs);
    },
    clear(handle) {
      const kind = timers.get(handle);
      if (!kind) return false;
      if (kind === 'interval') clearInterval(handle);
      else clearTimeout(handle);
      timers.delete(handle);
      return true;
    },
    clearAll() {
      accepting = false;
      for (const [handle, kind] of timers) {
        if (kind === 'interval') clearInterval(handle);
        else clearTimeout(handle);
      }
      const cleared = timers.size;
      timers.clear();
      return cleared;
    },
    get size() {
      return timers.size;
    },
    get accepting() {
      return accepting;
    }
  };
}

export function parseTenderSyncConfig(env = process.env, nodeEnv = 'development', logger = console) {
  const rawEnabled = String(env.TENDER_SYNC_ENABLED || '').trim().toLowerCase();
  const explicitlyConfigured = rawEnabled === 'true' || rawEnabled === 'false';
  const enabled = rawEnabled === 'true';
  if (!explicitlyConfigured) {
    logger.warn?.(`[tender sync] disabled: TENDER_SYNC_ENABLED is not explicitly configured (${nodeEnv})`);
  } else if (!['true', 'false'].includes(rawEnabled)) {
    logger.warn?.('[tender sync] disabled: TENDER_SYNC_ENABLED must be true or false');
  }

  const rawInterval = String(env.TENDER_SYNC_INTERVAL_MS || '').trim();
  const parsedInterval = Number(rawInterval || DEFAULT_TENDER_INTERVAL_MS);
  const intervalValid = Number.isSafeInteger(parsedInterval)
    && parsedInterval >= MIN_TENDER_INTERVAL_MS
    && parsedInterval <= MAX_TENDER_INTERVAL_MS;
  if (rawInterval && !intervalValid) {
    logger.warn?.('[tender sync] invalid interval; using safe daily default');
  }

  return {
    enabled: explicitlyConfigured && enabled,
    explicitlyConfigured,
    intervalMs: intervalValid ? parsedInterval : DEFAULT_TENDER_INTERVAL_MS
  };
}

export function createBackgroundScheduler({
  registry,
  enabled,
  startupDelayMs = 30000,
  intervalMs = DEFAULT_TENDER_INTERVAL_MS,
  isShuttingDown,
  shouldRun,
  runJob,
  logger = console
}) {
  let jobRunning = false;
  let stopped = false;
  let activeJob = null;

  const execute = (triggeredBy) => {
    if (!enabled || stopped || isShuttingDown() || jobRunning) return Promise.resolve(false);
    jobRunning = true;
    activeJob = (async () => {
      try {
        if (await shouldRun()) await runJob(triggeredBy);
        return true;
      } catch (error) {
        logger.error?.(`[tender sync ${triggeredBy}] failed`, safeErrorSummary(error, 'TENDER_SYNC_FAILED'));
        return false;
      } finally {
        jobRunning = false;
        activeJob = null;
      }
    })();
    return activeJob;
  };

  if (enabled) {
    registry.setTimeout(() => void execute('startup_daily_check'), startupDelayMs);
    registry.setInterval(() => void execute('daily_schedule'), intervalMs);
  }

  return {
    execute,
    stop() {
      stopped = true;
    },
    async waitForIdle() {
      if (activeJob) await activeJob;
    },
    get running() {
      return jobRunning;
    },
    get enabled() {
      return enabled;
    }
  };
}

export function createShutdownCoordinator({
  getServer,
  stopBackgroundWork = () => {},
  waitForBackgroundWork = async () => {},
  clearTimers = () => 0,
  closePool = async () => {},
  forceExitTimeoutMs = DEFAULT_FORCE_EXIT_TIMEOUT_MS,
  unrefForceTimer = true,
  drainDelayMs = DEFAULT_DRAIN_DELAY_MS,
  exit = (code) => process.exit(code),
  logger = console
}) {
  let shuttingDown = false;
  let shutdownPromise = null;

  const closeHttpServer = () => new Promise((resolve) => {
    const server = getServer();
    if (!server?.listening) return resolve();
    server.close((error) => {
      if (error) logger.error?.('[shutdown] HTTP close failed', safeErrorSummary(error, 'HTTP_CLOSE_FAILED'));
      resolve();
    });
  });

  const shutdown = (reason, exitCode = 0) => {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    const safeReason = String(reason || 'shutdown').slice(0, 80);
    logger.log?.(`[shutdown] started reason=${safeReason}`);

    shutdownPromise = new Promise((resolve) => {
      const forceTimer = setTimeout(() => {
        logger.error?.('[shutdown] force timeout reached');
        exit(exitCode || 1);
        resolve({ forced: true, exitCode: exitCode || 1 });
      }, forceExitTimeoutMs);
      if (unrefForceTimer) forceTimer.unref?.();

      void (async () => {
        try {
          try { await stopBackgroundWork(); } catch (error) { logger.error?.('[shutdown] background stop failed', safeErrorSummary(error)); }
          try { clearTimers(); } catch (error) { logger.error?.('[shutdown] timer cleanup failed', safeErrorSummary(error)); }
          if (drainDelayMs > 0) await new Promise((done) => setTimeout(done, drainDelayMs));
          try { await closeHttpServer(); } catch (error) { logger.error?.('[shutdown] HTTP cleanup failed', safeErrorSummary(error)); }
          try { await waitForBackgroundWork(); } catch (error) { logger.error?.('[shutdown] background wait failed', safeErrorSummary(error)); }
          try { await closePool(); } catch (error) { logger.error?.('[shutdown] pool cleanup failed', safeErrorSummary(error)); }
          clearTimeout(forceTimer);
          logger.log?.('[shutdown] completed');
          exit(exitCode);
          resolve({ forced: false, exitCode });
        } catch (error) {
          clearTimeout(forceTimer);
          logger.error?.('[shutdown] coordinator failed', safeErrorSummary(error, 'SHUTDOWN_FAILED'));
          exit(1);
          resolve({ forced: false, exitCode: 1 });
        }
      })();
    });
    return shutdownPromise;
  };

  return {
    shutdown,
    get isShuttingDown() {
      return shuttingDown;
    }
  };
}

export function installProcessHandlers(coordinator, logger = console) {
  const fatal = (type, error) => {
    logger.error?.(`[runtime] ${type}`, safeErrorSummary(error, type.toUpperCase()));
    void coordinator.shutdown(type, 1);
  };
  process.once('SIGTERM', () => void coordinator.shutdown('SIGTERM', 0));
  process.once('SIGINT', () => void coordinator.shutdown('SIGINT', 0));
  process.once('uncaughtException', (error) => fatal('uncaughtException', error));
  process.once('unhandledRejection', (reason) => fatal('unhandledRejection', reason));
}
