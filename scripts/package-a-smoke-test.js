import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveEnvironment } from '../server/env.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromServer = createRequire(path.join(rootDir, 'server', 'package.json'));
const Database = requireFromServer('better-sqlite3');
const bcrypt = requireFromServer('bcryptjs');
const jwt = requireFromServer('jsonwebtoken');
const localUnavailableDatabaseUrl = 'postgresql://127.0.0.1:1/package_a?sslmode=disable';
const qaOrigin = 'https://qa.package-a.invalid';
const applicationEnvironmentKeys = [
  'NODE_ENV',
  'DATABASE_URL',
  'BOOKAI_DB_PROVIDER',
  'DB_PATH',
  'JWT_SECRET',
  'BOOTSTRAP_SECRET',
  'BOOKAI_BOOTSTRAP_SECRET',
  'ADMIN_PASSWORD',
  'FOUNDER_EMAIL',
  'ADMIN_EMAIL',
  'CORS_ORIGIN',
  'CLIENT_URL'
];

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForPing(baseUrl, child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/ping`);
      if (response.ok) return response;
    } catch {
      // Expected while the isolated local child process is starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for /api/ping');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000))
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function isolatedChildEnvironment(environment) {
  const childEnvironment = { ...process.env };
  for (const name of applicationEnvironmentKeys) delete childEnvironment[name];
  childEnvironment.DOTENV_CONFIG_PATH = path.join(os.tmpdir(), 'bookai-package-a-no-env-file');
  childEnvironment.DOTENV_CONFIG_QUIET = 'true';
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) delete childEnvironment[name];
    else childEnvironment[name] = String(value);
  }
  return childEnvironment;
}

function startServer(environment) {
  return spawn(process.execPath, ['server/index.js'], {
    cwd: rootDir,
    env: isolatedChildEnvironment(environment),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

function cleanupSqlite(dbPath) {
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}

function productionEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: localUnavailableDatabaseUrl,
    JWT_SECRET: 'package-a-runtime-jwt-placeholder',
    FOUNDER_EMAIL: 'founder@package-a.invalid',
    ADMIN_EMAIL: 'admin@package-a.invalid',
    CORS_ORIGIN: qaOrigin,
    BOOTSTRAP_SECRET: '',
    BOOKAI_BOOTSTRAP_SECRET: '',
    ADMIN_PASSWORD: '',
    ...overrides
  };
}

function environmentClassificationSmoke() {
  const production = resolveEnvironment(productionEnvironment());
  assert.equal(production.environment, 'production');
  assert.equal(production.environmentValid, true);
  assert.equal(production.runtimeReady, true);
  assert.equal(production.authenticationReady, true);
  assert.equal(production.bootstrap.ready, false);
  assert.equal(production.privilegedIdentity.ready, true);
  assert.equal(production.cors.ready, true);

  const developmentFallback = resolveEnvironment({});
  assert.equal(developmentFallback.environment, 'development');
  assert.equal(developmentFallback.environmentExplicit, false);
  assert.equal(developmentFallback.environmentValid, true);
  assert.equal(developmentFallback.runtimeReady, true);

  const invalid = resolveEnvironment({ NODE_ENV: 'invalid-environment' });
  assert.equal(invalid.environmentValid, false);
  assert.equal(invalid.runtimeReady, false);

  const bootstrapAlias = resolveEnvironment(productionEnvironment({
    BOOKAI_BOOTSTRAP_SECRET: 'package-a-bootstrap-alias-placeholder',
    ADMIN_PASSWORD: 'package-a-bootstrap-password-placeholder'
  }));
  assert.equal(bootstrapAlias.bootstrap.ready, true);
  assert.equal(bootstrapAlias.bootstrap.deprecatedAliasConfigured, true);

  const missingIdentity = resolveEnvironment(productionEnvironment({ FOUNDER_EMAIL: '', ADMIN_EMAIL: '' }));
  assert.equal(missingIdentity.runtimeReady, true);
  assert.equal(missingIdentity.privilegedIdentity.ready, false);

  const missingCors = resolveEnvironment(productionEnvironment({ CORS_ORIGIN: '' }));
  assert.equal(missingCors.runtimeReady, true);
  assert.equal(missingCors.cors.ready, false);
  assert.deepEqual(missingCors.unused, ['CLIENT_URL']);
}

async function developmentSqliteSmoke() {
  const port = await availablePort();
  const dbPath = path.join(os.tmpdir(), `bookai-package-a-dev-${process.pid}.sqlite`);
  const child = startServer({ NODE_ENV: 'development', PORT: port, DB_PATH: dbPath });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForPing(baseUrl, child);
    const ping = await requestJson(`${baseUrl}/api/ping`);
    assert.equal(ping.response.status, 200);
    assert.equal(ping.body.service, 'bookai-api');

    const health = await requestJson(`${baseUrl}/api/health`);
    assert.equal(health.response.status, 200);
    assert.equal(health.body.status, 'healthy');
    assert.equal(health.body.database.provider, 'sqlite');
    assert.equal(health.body.checks.runtimeEnv, true);
    assert.equal(health.body.capabilities.bootstrapAvailable, false);

    const missingApi = await requestJson(`${baseUrl}/api/package-a-missing`);
    assert.equal(missingApi.response.status, 404);
    assert.equal(missingApi.body.error.code, 'NOT_FOUND');

    const db = new Database(dbPath);
    try {
      const company = db.prepare('INSERT INTO companies (name, owner_id) VALUES (?, ?)').run('Package A Local QA', 1);
      db.prepare(`
        INSERT INTO website_settings (company_id, site_slug, site_name, brand_name, is_published)
        VALUES (?, ?, ?, ?, 1)
      `).run(company.lastInsertRowid, 'package-a-empty', 'Package A Empty', 'Package A Empty');
    } finally {
      db.close();
    }

    const emptySite = await requestJson(`${baseUrl}/api/public/sites/package-a-empty`);
    assert.equal(emptySite.response.status, 200);
    assert.deepEqual(emptySite.body.data.banners, []);
    assert.deepEqual(emptySite.body.data.homeSections, []);
    assert.deepEqual(emptySite.body.data.faqs, []);
  } finally {
    await stopServer(child);
    cleanupSqlite(dbPath);
  }
}

async function missingNodeEnvironmentSmoke() {
  const port = await availablePort();
  const dbPath = path.join(os.tmpdir(), `bookai-package-a-node-env-missing-${process.pid}.sqlite`);
  const child = startServer({ NODE_ENV: undefined, PORT: port, DB_PATH: dbPath });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForPing(baseUrl, child);
    const health = await requestJson(`${baseUrl}/api/health`);
    assert.equal(health.response.status, 200);
    assert.equal(health.body.environment, 'development');
    assert.equal(health.body.environmentExplicit, false);
    assert.equal(health.body.checks.environmentValid, true);
    assert.equal(health.body.checks.productionEnvironment, false);
  } finally {
    await stopServer(child);
    cleanupSqlite(dbPath);
  }
}

async function invalidNodeEnvironmentSmoke() {
  const port = await availablePort();
  const dbPath = path.join(os.tmpdir(), `bookai-package-a-node-env-invalid-${process.pid}.sqlite`);
  const child = startServer({ NODE_ENV: 'invalid-environment', PORT: port, DB_PATH: dbPath });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForPing(baseUrl, child);
    assert.equal((await requestJson(`${baseUrl}/api/ping`)).response.status, 200);
    const health = await requestJson(`${baseUrl}/api/health`);
    assert.equal(health.response.status, 503);
    assert.equal(health.body.checks.environmentValid, false);
    assert.equal(health.body.checks.productionEnvironment, false);
    assert.equal(health.body.checks.runtimeEnv, false);
    const blocked = await requestJson(`${baseUrl}/api/plans`);
    assert.equal(blocked.response.status, 503);
    assert.equal(fs.existsSync(dbPath), false);
  } finally {
    await stopServer(child);
    cleanupSqlite(dbPath);
  }
}

async function missingRuntimeEnvironmentSmoke() {
  const port = await availablePort();
  const dbPath = path.join(os.tmpdir(), `bookai-package-a-prod-missing-${process.pid}.sqlite`);
  const child = startServer(productionEnvironment({
    PORT: port,
    DATABASE_URL: '',
    JWT_SECRET: '',
    BOOKAI_DB_PROVIDER: 'sqlite',
    DB_PATH: dbPath
  }));
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForPing(baseUrl, child);
    assert.equal((await requestJson(`${baseUrl}/api/ping`)).response.status, 200);
    const health = await requestJson(`${baseUrl}/api/health`);
    assert.equal(health.response.status, 503);
    assert.equal(health.body.checks.runtimeEnv, false);
    assert.equal(health.body.checks.authentication, false);
    assert.equal(health.body.database.provider, 'postgresql');
    const preflight = await fetch(`${baseUrl}/api/plans`, {
      method: 'OPTIONS',
      headers: { Origin: qaOrigin, 'Access-Control-Request-Method': 'GET' }
    });
    assert.equal(preflight.status, 204, 'CORS preflight must run before the configuration gate');
    const blocked = await requestJson(`${baseUrl}/api/plans`);
    assert.equal(blocked.response.status, 503);
    assert.equal(fs.existsSync(dbPath), false);
  } finally {
    await stopServer(child);
    cleanupSqlite(dbPath);
  }
}

async function missingJwtSmoke() {
  const port = await availablePort();
  const child = startServer(productionEnvironment({ PORT: port, JWT_SECRET: '' }));
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForPing(baseUrl, child);
    assert.equal((await requestJson(`${baseUrl}/api/ping`)).response.status, 200);
    const health = await requestJson(`${baseUrl}/api/health`);
    assert.equal(health.response.status, 503);
    assert.equal(health.body.checks.authentication, false);
    const login = await requestJson(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'member@package-a.invalid', password: 'not-used' })
    });
    assert.equal(login.response.status, 503);
  } finally {
    await stopServer(child);
  }
}

async function bootstrapOptionalSmoke() {
  const port = await availablePort();
  const child = startServer(productionEnvironment({ PORT: port }));
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForPing(baseUrl, child);
    assert.equal((await requestJson(`${baseUrl}/api/plans`)).response.status, 200);
    for (const route of ['admin', 'founder']) {
      const response = await requestJson(`${baseUrl}/api/bootstrap/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'not-used' })
      });
      assert.equal(response.response.status, 404);
    }
    const health = await requestJson(`${baseUrl}/api/health`);
    assert.equal(health.body.checks.runtimeEnv, true);
    assert.equal(health.body.capabilities.bootstrapAvailable, false);
  } finally {
    await stopServer(child);
  }
}

async function missingAdminPasswordSmoke() {
  const port = await availablePort();
  const child = startServer(productionEnvironment({
    PORT: port,
    BOOTSTRAP_SECRET: 'package-a-bootstrap-placeholder',
    ADMIN_PASSWORD: ''
  }));
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForPing(baseUrl, child);
    assert.equal((await requestJson(`${baseUrl}/api/plans`)).response.status, 200);
    const bootstrap = await requestJson(`${baseUrl}/api/bootstrap/admin`, { method: 'POST' });
    assert.equal(bootstrap.response.status, 404);
    const health = await requestJson(`${baseUrl}/api/health`);
    assert.equal(health.body.checks.runtimeEnv, true);
    assert.equal(health.body.capabilities.bootstrapAvailable, false);
  } finally {
    await stopServer(child);
  }
}

async function privilegedIdentitySmoke() {
  const port = await availablePort();
  const secret = 'package-a-runtime-jwt-placeholder';
  const child = startServer(productionEnvironment({ PORT: port, JWT_SECRET: secret, FOUNDER_EMAIL: '', ADMIN_EMAIL: '' }));
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = jwt.sign({ id: 1, email: 'member@package-a.invalid' }, secret, { expiresIn: '5m' });
  try {
    await waitForPing(baseUrl, child);
    assert.equal((await requestJson(`${baseUrl}/api/plans`)).response.status, 200);
    const health = await requestJson(`${baseUrl}/api/health`);
    assert.equal(health.body.checks.runtimeEnv, true);
    assert.equal(health.body.checks.privilegedIdentity, false);
    for (const route of ['/api/founder/analytics', '/api/admin/members']) {
      const response = await requestJson(`${baseUrl}${route}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.response.status, 503);
    }
  } finally {
    await stopServer(child);
  }
}

async function corsAndProductionDebugSmoke() {
  const port = await availablePort();
  const secret = 'package-a-runtime-jwt-placeholder';
  const child = startServer(productionEnvironment({
    PORT: port,
    JWT_SECRET: secret,
    BOOTSTRAP_SECRET: 'package-a-bootstrap-placeholder',
    ADMIN_PASSWORD: 'package-a-bootstrap-password-placeholder'
  }));
  const baseUrl = `http://127.0.0.1:${port}`;
  const founderToken = jwt.sign({ id: 1, email: 'founder@package-a.invalid' }, secret, { expiresIn: '5m' });
  try {
    await waitForPing(baseUrl, child);
    assert.equal((await requestJson(`${baseUrl}/api/plans`)).response.status, 200, 'same-origin requests must work');

    const allowed = await fetch(`${baseUrl}/api/plans`, { headers: { Origin: qaOrigin } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), qaOrigin);

    const denied = await fetch(`${baseUrl}/api/plans`, { headers: { Origin: 'https://denied.package-a.invalid' } });
    assert.equal(denied.status, 403);

    const preflight = await fetch(`${baseUrl}/api/plans`, {
      method: 'OPTIONS',
      headers: { Origin: qaOrigin, 'Access-Control-Request-Method': 'GET' }
    });
    assert.equal(preflight.status, 204);

    const wrongBootstrap = await requestJson(`${baseUrl}/api/bootstrap/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: 'incorrect-placeholder' })
    });
    assert.equal(wrongBootstrap.response.status, 403);

    const debugWithBootstrap = await requestJson(`${baseUrl}/api/debug/auth-shape`, {
      headers: { 'X-Bootstrap-Secret': 'package-a-bootstrap-placeholder' }
    });
    assert.equal(debugWithBootstrap.response.status, 404);

    const debugWithFounder = await requestJson(`${baseUrl}/api/debug/auth-shape`, {
      headers: { Authorization: `Bearer ${founderToken}` }
    });
    assert.equal(debugWithFounder.response.status, 404, 'production debug route must remain disabled');
  } finally {
    await stopServer(child);
  }
}

async function missingCorsSmoke() {
  const port = await availablePort();
  const child = startServer(productionEnvironment({ PORT: port, CORS_ORIGIN: '' }));
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForPing(baseUrl, child);
    assert.equal((await requestJson(`${baseUrl}/api/plans`)).response.status, 200);
    const explicitSameOrigin = await fetch(`${baseUrl}/api/plans`, { headers: { Origin: baseUrl } });
    assert.equal(explicitSameOrigin.status, 200);
    const denied = await fetch(`${baseUrl}/api/plans`, { headers: { Origin: qaOrigin } });
    assert.equal(denied.status, 403);
    const health = await requestJson(`${baseUrl}/api/health`);
    assert.equal(health.body.checks.runtimeEnv, true);
    assert.equal(health.body.checks.cors, false);
  } finally {
    await stopServer(child);
  }
}

async function developmentDebugSmoke() {
  const port = await availablePort();
  const dbPath = path.join(os.tmpdir(), `bookai-package-a-debug-${process.pid}.sqlite`);
  const secret = 'package-a-development-jwt-placeholder';
  const founderEmail = 'founder@package-a.invalid';
  const child = startServer({
    NODE_ENV: 'development',
    PORT: port,
    DB_PATH: dbPath,
    JWT_SECRET: secret,
    FOUNDER_EMAIL: founderEmail,
    BOOTSTRAP_SECRET: 'package-a-bootstrap-placeholder'
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForPing(baseUrl, child);
    const db = new Database(dbPath);
    let founderId;
    let memberId;
    try {
      founderId = Number(db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run('Founder QA', founderEmail, 'unused').lastInsertRowid);
      memberId = Number(db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run('Member QA', 'member@package-a.invalid', 'unused').lastInsertRowid);
    } finally {
      db.close();
    }

    const bootstrapOnly = await requestJson(`${baseUrl}/api/debug/auth-shape`, {
      headers: { 'X-Bootstrap-Secret': 'package-a-bootstrap-placeholder' }
    });
    assert.equal(bootstrapOnly.response.status, 403);

    const memberToken = jwt.sign({ id: memberId, email: 'member@package-a.invalid' }, secret, { expiresIn: '5m' });
    const member = await requestJson(`${baseUrl}/api/debug/auth-shape`, { headers: { Authorization: `Bearer ${memberToken}` } });
    assert.equal(member.response.status, 403);

    const founderToken = jwt.sign({ id: founderId, email: founderEmail }, secret, { expiresIn: '5m' });
    const founder = await requestJson(`${baseUrl}/api/debug/auth-shape`, { headers: { Authorization: `Bearer ${founderToken}` } });
    assert.equal(founder.response.status, 200);
    assert.equal(founder.body.founderIdentityConfigured, true);
    assert.equal('founderEmail' in founder.body, false);
  } finally {
    await stopServer(child);
    cleanupSqlite(dbPath);
  }
}

async function approvalGateMatrixSmoke() {
  const port = await availablePort();
  const dbPath = path.join(os.tmpdir(), `bookai-package-a-approval-${process.pid}.sqlite`);
  const secret = 'package-a-approval-jwt-placeholder';
  const password = 'package-a-approval-password-placeholder';
  const child = startServer({
    NODE_ENV: 'development',
    PORT: port,
    DB_PATH: dbPath,
    JWT_SECRET: secret
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  const authorization = (token) => ({ Authorization: `Bearer ${token}` });
  const login = async (email) => {
    const result = await requestJson(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    assert.equal(result.response.status, 200);
    assert.equal(typeof result.body.token, 'string');
    return result.body.token;
  };
  const assertApprovalDenied = (result, code) => {
    assert.equal(result.response.status, 403);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.error.code, code);
    assert.equal(result.body.code, code);
    assert.match(result.body.error.requestId, /^[a-zA-Z0-9._-]{8,128}$/);
  };

  try {
    await waitForPing(baseUrl, child);
    assert.equal((await requestJson(`${baseUrl}/api/ping`)).response.status, 200);
    assert.equal((await requestJson(`${baseUrl}/api/health`)).response.status, 200);

    const db = new Database(dbPath);
    const identities = {};
    try {
      const passwordHash = bcrypt.hashSync(password, 4);
      const addIdentity = (key, userStatus, companyStatus, role = 'owner') => {
        const email = `${key}@package-a.invalid`;
        const user = db.prepare(`
          INSERT INTO users (name, email, password_hash, status, review_status, approval_status)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(key, email, passwordHash, userStatus, userStatus, userStatus);
        const company = db.prepare(`
          INSERT INTO companies (name, owner_id, review_status, approval_status, is_active)
          VALUES (?, ?, ?, ?, ?)
        `).run(`${key} Company`, user.lastInsertRowid, companyStatus, companyStatus, companyStatus === 'approved' ? 1 : 0);
        db.prepare('INSERT INTO company_users (company_id, user_id, role) VALUES (?, ?, ?)')
          .run(company.lastInsertRowid, user.lastInsertRowid, role);
        identities[key] = {
          email,
          userId: Number(user.lastInsertRowid),
          companyId: Number(company.lastInsertRowid)
        };
      };

      addIdentity('approved-approved', 'approved', 'approved');
      addIdentity('pending-approved', 'pending_review', 'approved');
      addIdentity('rejected-approved', 'rejected', 'approved');
      addIdentity('suspended-approved', 'suspended', 'approved');
      addIdentity('approved-pending', 'approved', 'pending_review');
      addIdentity('approved-rejected', 'approved', 'rejected');
      addIdentity('approved-suspended', 'approved', 'suspended');
      addIdentity('null-user-approved', null, 'approved');
      addIdentity('approved-null-company', 'approved', null);
      addIdentity('unknown-user-approved', 'unexpected_status', 'approved');
      addIdentity('approved-unknown-company', 'approved', 'unexpected_status');
      addIdentity('pending-company-admin', 'pending_review', 'approved', 'admin');
      addIdentity('approved-outsider', 'approved', 'approved', 'viewer');

      db.prepare(`
        INSERT INTO website_settings (company_id, site_slug, site_name, brand_name, is_published)
        VALUES (?, ?, ?, ?, 1)
      `).run(identities['approved-approved'].companyId, 'package-a-approval-public', 'Approval QA', 'Approval QA');
    } finally {
      db.close();
    }

    const tokens = {};
    for (const [key, identity] of Object.entries(identities)) tokens[key] = await login(identity.email);
    const protectedPath = (key) => `${baseUrl}/api/companies/${identities[key].companyId}/tender-radar/status`;
    const protectedRequest = (key) => requestJson(protectedPath(key), { headers: authorization(tokens[key]) });

    assert.equal((await protectedRequest('approved-approved')).response.status, 200);
    assertApprovalDenied(await protectedRequest('pending-approved'), 'ACCOUNT_PENDING_REVIEW');
    assertApprovalDenied(await protectedRequest('rejected-approved'), 'ACCOUNT_REJECTED');
    assertApprovalDenied(await protectedRequest('suspended-approved'), 'ACCOUNT_SUSPENDED');
    assertApprovalDenied(await protectedRequest('approved-pending'), 'COMPANY_NOT_ACTIVE');
    assertApprovalDenied(await protectedRequest('approved-rejected'), 'COMPANY_NOT_ACTIVE');
    assertApprovalDenied(await protectedRequest('approved-suspended'), 'COMPANY_NOT_ACTIVE');
    assertApprovalDenied(await protectedRequest('null-user-approved'), 'ACCOUNT_PENDING_REVIEW');
    assertApprovalDenied(await protectedRequest('approved-null-company'), 'COMPANY_NOT_ACTIVE');
    assertApprovalDenied(await protectedRequest('unknown-user-approved'), 'ACCOUNT_PENDING_REVIEW');
    assertApprovalDenied(await protectedRequest('approved-unknown-company'), 'COMPANY_NOT_ACTIVE');
    assertApprovalDenied(await protectedRequest('pending-company-admin'), 'ACCOUNT_PENDING_REVIEW');

    const crossCompany = await requestJson(protectedPath('approved-approved'), {
      headers: authorization(tokens['approved-outsider'])
    });
    assert.equal(crossCompany.response.status, 403);

    const pendingMe = await requestJson(`${baseUrl}/api/me`, { headers: authorization(tokens['pending-approved']) });
    assert.equal(pendingMe.response.status, 200, 'review status lookup must remain available');

    const pendingCms = await requestJson(`${baseUrl}/api/website/settings`, {
      headers: authorization(tokens['pending-approved'])
    });
    assertApprovalDenied(pendingCms, 'ACCOUNT_PENDING_REVIEW');

    const publicSite = await requestJson(`${baseUrl}/api/public/sites/package-a-approval-public`);
    assert.equal(publicSite.response.status, 200);
    assert.deepEqual(publicSite.body.data.banners, []);
    assert.deepEqual(publicSite.body.data.homeSections, []);
    assert.deepEqual(publicSite.body.data.faqs, []);
  } finally {
    await stopServer(child);
    cleanupSqlite(dbPath);
  }
}

environmentClassificationSmoke();
await developmentSqliteSmoke();
await missingNodeEnvironmentSmoke();
await invalidNodeEnvironmentSmoke();
await missingRuntimeEnvironmentSmoke();
await missingJwtSmoke();
await bootstrapOptionalSmoke();
await missingAdminPasswordSmoke();
await privilegedIdentitySmoke();
await corsAndProductionDebugSmoke();
await missingCorsSmoke();
await developmentDebugSmoke();
await approvalGateMatrixSmoke();
console.log('Package A.1 and A-Fix-1 smoke tests passed.');
