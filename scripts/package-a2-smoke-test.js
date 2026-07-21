import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createBackgroundScheduler,
  createShutdownCoordinator,
  createTimerRegistry,
  installProcessHandlers,
  parseTenderSyncConfig,
  safeErrorSummary
} from '../server/runtime-lifecycle.js';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');

if (process.argv.includes('--fatal-child') || process.argv.includes('--rejection-child')) {
  const coordinator = createShutdownCoordinator({
    getServer: () => null,
    forceExitTimeoutMs: 1000,
    drainDelayMs: 0
  });
  installProcessHandlers(coordinator);
  if (process.argv.includes('--fatal-child')) {
    setImmediate(() => { throw new Error('isolated fatal lifecycle test'); });
  } else {
    setImmediate(() => Promise.reject(new Error('isolated rejection lifecycle test')));
  }
} else {
  await main();
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForPing(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error('BookAI server exited before ping');
    try {
      const response = await fetch(`${baseUrl}/api/ping`);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('BookAI server startup timed out');
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000))
  ]);
  if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL');
}

function cleanupSqlite(dbPath) {
  for (const target of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    fs.rmSync(target, { force: true });
  }
}

async function lifecycleCoordinatorSmoke(reason) {
  const port = await availablePort();
  let coordinator;
  let exitCode = null;
  const server = http.createServer((req, res) => {
    if (req.url === '/api/health') {
      const shuttingDown = coordinator.isShuttingDown;
      res.writeHead(shuttingDown ? 503 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: !shuttingDown, status: shuttingDown ? 'shutting_down' : 'healthy' }));
      return;
    }
    res.writeHead(200).end('ok');
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const registry = createTimerRegistry();
  registry.setInterval(() => {}, 1000);
  coordinator = createShutdownCoordinator({
    getServer: () => server,
    clearTimers: () => registry.clearAll(),
    closePool: async () => {},
    drainDelayMs: 150,
    forceExitTimeoutMs: 2000,
    exit: (code) => { exitCode = code; },
    logger: { log() {}, error() {} }
  });

  const first = coordinator.shutdown(reason, 0);
  const second = coordinator.shutdown(reason, 0);
  assert.strictEqual(first, second, 'shutdown must be idempotent');
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 503);
  assert.equal((await health.json()).status, 'shutting_down');
  const result = await first;
  assert.equal(result.forced, false);
  assert.equal(exitCode, 0);
  assert.equal(registry.size, 0);
  assert.equal(server.listening, false);
  await new Promise((resolve, reject) => {
    const rebound = net.createServer();
    rebound.once('error', reject);
    rebound.listen(port, '127.0.0.1', () => rebound.close(resolve));
  });
}

async function timerAndTenderSmoke() {
  let disabledRuns = 0;
  const disabledRegistry = createTimerRegistry();
  const disabled = createBackgroundScheduler({
    registry: disabledRegistry,
    enabled: false,
    isShuttingDown: () => false,
    shouldRun: async () => true,
    runJob: async () => { disabledRuns += 1; }
  });
  assert.equal(await disabled.execute('test'), false);
  assert.equal(disabledRuns, 0);
  assert.equal(disabledRegistry.size, 0);

  const errors = [];
  const failureRegistry = createTimerRegistry();
  const failing = createBackgroundScheduler({
    registry: failureRegistry,
    enabled: true,
    startupDelayMs: 60000,
    intervalMs: 60000,
    isShuttingDown: () => false,
    shouldRun: async () => true,
    runJob: async () => { throw new Error('isolated tender failure'); },
    logger: { error: (...args) => errors.push(args) }
  });
  assert.equal(await failing.execute('failure_test'), false);
  assert.equal(errors.length, 1);
  failing.stop();
  failureRegistry.clearAll();
  assert.equal(failureRegistry.size, 0);

  const quietLogger = { warn() {} };
  assert.equal(parseTenderSyncConfig({}, 'development', quietLogger).enabled, false);
  assert.equal(parseTenderSyncConfig({}, 'test', quietLogger).enabled, false);
  assert.equal(parseTenderSyncConfig({ TENDER_SYNC_ENABLED: 'true', TENDER_SYNC_INTERVAL_MS: '-1' }, 'production', quietLogger).intervalMs, 86400000);
}

function sanitizerSmoke() {
  const fakeUri = 'postgresql://fake_user:fake_password@invalid.example/bookai_test';
  const fakeValue = 'fake-database-value';
  const fakeAuthorization = 'fake-authorization-value';
  const fakeJwt = ['eyJmYWtlSGVhZGVy', 'eyJmYWtlUGF5bG9hZA', 'fakeSignatureValue'].join('.');
  const cases = [
    `DATABASE_URL=${fakeValue}`,
    `DATABASE_URL = ${fakeValue}`,
    `DATABASE_URL="${fakeUri}"`,
    `database_url='${fakeValue}'`,
    `{"DATABASE_URL":"${fakeValue}"}`,
    `" DATABASE_URL ": "${fakeValue}"`,
    `DATABASE_URL=${fakeValue}, next=true`,
    `DATABASE_URL=${fakeValue}; next=true`,
    `first line\nDATABASE_URL=${fakeValue}\nlast line`,
    `DATABASE_URL=${fakeValue}, Authorization=${fakeAuthorization}`,
    `DATABASE_URL=${fakeValue}, direct=${fakeUri}`,
    `DATABASE_URL=${fakeValue}, DATABASE_URL=${fakeValue}`,
    `DATABASE_URL=${fakeValue} connection timeout`,
    `DATABASE_URL=${fakeValue}\tpool shutdown failed`,
    `DATABASE_URL=${fakeValue}; tender scheduler failed`,
    `DATABASE_URL="fake value with spaces" connection timeout`,
    `DATABASE_URL='fake value with spaces' pool shutdown failed`,
    `{"DATABASE_URL":"fake value with spaces", "ok": false}`,
    `Authorization=${fakeAuthorization} Cookie=${fakeValue} Set-Cookie=${fakeValue}`,
    `Bearer ${fakeAuthorization}`,
    `Token=${fakeValue} Secret=${fakeValue} Password=${fakeValue}`,
    fakeJwt
  ];

  for (const input of cases) {
    const output = safeErrorSummary(input);
    assert.equal(output.message.includes(fakeValue), false);
    assert.equal(output.message.includes(fakeUri), false);
    assert.equal(output.message.includes(fakeAuthorization), false);
    assert.equal(output.message.includes(fakeJwt), false);
  }
  assert.equal((safeErrorSummary(`DATABASE_URL=${fakeValue}, DATABASE_URL=${fakeValue}`).message.match(/DATABASE_URL=\[redacted\]/g) || []).length, 2);
  assert.equal(safeErrorSummary('Connection timeout').message, 'Connection timeout');
  assert.equal(safeErrorSummary(new Error('Pool shutdown failed')).message, 'Pool shutdown failed');
  assert.equal(safeErrorSummary('Tender scheduler failed').message, 'Tender scheduler failed');
  assert.match(safeErrorSummary(`DATABASE_URL=${fakeValue} connection timeout`).message, /connection timeout/);
  assert.match(safeErrorSummary(`DATABASE_URL=${fakeValue}\tpool shutdown failed`).message, /pool shutdown failed/);
  assert.match(safeErrorSummary(`DATABASE_URL=${fakeValue}; tender scheduler failed`).message, /tender scheduler failed/);
  assert.match(safeErrorSummary('DATABASE_URL="fake value with spaces" connection timeout').message, /connection timeout/);
  assert.match(safeErrorSummary("DATABASE_URL='fake value with spaces' pool shutdown failed").message, /pool shutdown failed/);
  assert.doesNotThrow(() => safeErrorSummary(undefined));
  assert.doesNotThrow(() => safeErrorSummary(null));
  assert.doesNotThrow(() => safeErrorSummary(''));

  const circular = { message: 'Connection timeout' };
  circular.self = circular;
  assert.equal(safeErrorSummary(circular).message, 'Connection timeout');
  const original = new Error(`DATABASE_URL=${fakeValue}`);
  original.stack = `stack ${fakeValue}`;
  original.cause = { secret: fakeValue };
  safeErrorSummary(original);
  assert.equal(original.message, `DATABASE_URL=${fakeValue}`);
  assert.equal(original.stack, `stack ${fakeValue}`);
  assert.doesNotThrow(() => safeErrorSummary({ get message() { throw new Error('getter failed'); } }));
}

async function forceTimeoutSmoke() {
  let exitCode = null;
  const neverClosingServer = { listening: true, close() {} };
  const coordinator = createShutdownCoordinator({
    getServer: () => neverClosingServer,
    forceExitTimeoutMs: 50,
    unrefForceTimer: false,
    drainDelayMs: 0,
    exit: (code) => { exitCode = code; },
    logger: { log() {}, error() {} }
  });
  const result = await coordinator.shutdown('force_timeout_test', 0);
  assert.equal(result.forced, true);
  assert.equal(exitCode, 1);
}

async function fatalChildSmoke(argument) {
  const child = spawn(process.execPath, [__filename, argument], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: '', DOTENV_CONFIG_PATH: path.join(os.tmpdir(), 'bookai-a2-no-env') },
    stdio: ['ignore', 'ignore', 'ignore']
  });
  const result = await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  assert.equal(result.signal, null);
  assert.equal(result.code, 1);
}

async function poolSmoke() {
  const { closePostgresPool, getPostgresPoolState } = await import('../server/pg-db.js');
  assert.deepEqual(getPostgresPoolState(), { created: false, closed: false });
  assert.deepEqual(await closePostgresPool(), { closed: false, reason: 'not_created' });
  assert.deepEqual(await closePostgresPool(), { closed: false, reason: 'not_created' });
  assert.deepEqual(getPostgresPoolState(), { created: false, closed: true });
}

async function bookAiServerSmoke() {
  const port = await availablePort();
  const dbPath = path.join(os.tmpdir(), `bookai-package-a2-${process.pid}.sqlite`);
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DB_PATH: dbPath,
      DATABASE_URL: '',
      BOOKAI_DB_PROVIDER: 'sqlite',
      JWT_SECRET: 'package-a2-isolated-placeholder',
      TENDER_SYNC_ENABLED: 'false',
      BOOKAI_LIFECYCLE_TEST_MODE: 'true',
      DOTENV_CONFIG_PATH: path.join(os.tmpdir(), 'bookai-a2-no-env')
    },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc']
  });
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForPing(baseUrl, child);
    assert.equal((await fetch(`${baseUrl}/api/ping`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
    child.send({ type: 'BOOKAI_TEST_SHUTDOWN' });
    let shutdownHealth = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}/api/health`);
        if (response.status === 503) {
          shutdownHealth = await response.json();
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(shutdownHealth?.status, 'shutting_down');
    const exitResult = await Promise.race([
      new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal }))),
      new Promise((_, reject) => setTimeout(() => reject(new Error('BookAI shutdown timed out')), 5000))
    ]);
    assert.deepEqual(exitResult, { code: 0, signal: null });
  } finally {
    await stopChild(child);
    cleanupSqlite(dbPath);
  }
  assert.equal([dbPath, `${dbPath}-wal`, `${dbPath}-shm`].some(fs.existsSync), false);
  await new Promise((resolve, reject) => {
    const rebound = net.createServer();
    rebound.once('error', reject);
    rebound.listen(port, '127.0.0.1', () => rebound.close(resolve));
  });
}

async function main() {
  sanitizerSmoke();
  await lifecycleCoordinatorSmoke('SIGTERM');
  await lifecycleCoordinatorSmoke('SIGINT');
  await timerAndTenderSmoke();
  await forceTimeoutSmoke();
  await fatalChildSmoke('--fatal-child');
  await fatalChildSmoke('--rejection-child');
  await bookAiServerSmoke();
  await poolSmoke();
  console.log('Package A.2 runtime lifecycle smoke tests passed.');
}
