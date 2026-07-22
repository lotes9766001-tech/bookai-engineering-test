import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { listMigrations, runMigrations } from '../server/migrations/postgres-runner.js';

const originalEnvironment = { ...process.env };
const isolatedEnvironment = {
  NODE_ENV: 'production',
  STAGING_ISOLATED: 'true',
  DATABASE_URL: 'postgresql://staging-user:staging-password@isolated.invalid/bookai',
  TENDER_SYNC_ENABLED: 'false',
  AI_ENABLED: 'false',
  EXTERNAL_SIDE_EFFECTS_ENABLED: 'false',
  EMAIL_SIDE_EFFECTS_ENABLED: 'false',
  LINE_SIDE_EFFECTS_ENABLED: 'false',
  PAYMENT_SIDE_EFFECTS_ENABLED: 'false'
};

function setEnvironment(overrides = {}) {
  for (const name of ['NODE_ENV', 'STAGING_ISOLATED', 'DATABASE_URL', 'TENDER_SYNC_ENABLED', 'AI_ENABLED', 'EXTERNAL_SIDE_EFFECTS_ENABLED', 'EMAIL_SIDE_EFFECTS_ENABLED', 'LINE_SIDE_EFFECTS_ENABLED', 'PAYMENT_SIDE_EFFECTS_ENABLED']) {
    delete process.env[name];
  }
  Object.assign(process.env, isolatedEnvironment, overrides);
}

const neverQueryPool = { query: async () => assert.fail('gate failure must occur before pool access') };

try {
  setEnvironment();
  await assert.rejects(
    runMigrations({ mode: 'migrate', pool: neverQueryPool, allowProduction: false }),
    { code: 'PRODUCTION_MIGRATION_GATE_REQUIRED' }
  );

  setEnvironment({ STAGING_ISOLATED: 'false' });
  const productionQueries = [];
  const productionPool = {
    query: async (sql) => {
      productionQueries.push(sql);
      if (sql.startsWith('SELECT version')) return { rows: [] };
      return { rows: [] };
    }
  };
  await runMigrations({ mode: 'migrate', pool: productionPool, allowProduction: true, allowIsolatedStaging: false });
  assert.ok(productionQueries.includes('BEGIN'));

  setEnvironment({ STAGING_ISOLATED: undefined });
  delete process.env.STAGING_ISOLATED;
  await assert.rejects(
    runMigrations({ mode: 'migrate', pool: neverQueryPool, allowProduction: false, allowIsolatedStaging: true }),
    { code: 'STAGING_ISOLATED_REQUIRED' }
  );

  for (const flag of ['TENDER_SYNC_ENABLED', 'AI_ENABLED', 'EXTERNAL_SIDE_EFFECTS_ENABLED', 'EMAIL_SIDE_EFFECTS_ENABLED', 'LINE_SIDE_EFFECTS_ENABLED', 'PAYMENT_SIDE_EFFECTS_ENABLED']) {
    setEnvironment({ [flag]: 'true' });
    await assert.rejects(
      runMigrations({ mode: 'migrate', pool: neverQueryPool, allowProduction: false, allowIsolatedStaging: true }),
      { code: 'STAGING_SIDE_EFFECTS_ENABLED' }
    );
  }

  setEnvironment({ DATABASE_URL: undefined });
  delete process.env.DATABASE_URL;
  await assert.rejects(
    runMigrations({ mode: 'migrate', pool: neverQueryPool, allowProduction: false, allowIsolatedStaging: true }),
    { code: 'STAGING_DATABASE_URL_REQUIRED' }
  );

  setEnvironment();
  const queries = [];
  const successfulPool = {
    query: async (sql) => {
      queries.push(sql);
      if (sql.startsWith('SELECT version')) return { rows: [] };
      return { rows: [] };
    }
  };
  const migrated = await runMigrations({ mode: 'migrate', pool: successfulPool, allowProduction: false, allowIsolatedStaging: true });
  assert.equal(migrated.mode, 'migrate');
  assert.ok(queries.includes('BEGIN'));

  const status = await runMigrations({
    mode: 'status',
    pool: { query: async () => ({ rows: [{ version_table: null }] }) }
  });
  assert.equal(status.versionTableExists, false);
  assert.deepEqual(status.applied, []);
  assert.equal(status.latestVersion, (await listMigrations()).at(-1).version);

  const migrations = await listMigrations();
  const mismatchedPool = {
    query: async (sql) => {
      if (sql.startsWith('SELECT version')) return { rows: [{ version: migrations[0].version, checksum: 'wrong', status: 'applied' }] };
      return { rows: [] };
    }
  };
  await assert.rejects(
    runMigrations({ mode: 'migrate', pool: mismatchedPool, allowProduction: false, allowIsolatedStaging: true }),
    { code: 'MIGRATION_CHECKSUM_MISMATCH' }
  );

  setEnvironment();
  const secretValues = ['postgresql://user:password@secret.invalid/db', 'jwt-secret-value', 'admin-password-value', 'api-token-value'];
  const childEnvironment = {
    ...process.env,
    DATABASE_URL: secretValues[0],
    JWT_SECRET: secretValues[1],
    ADMIN_PASSWORD: secretValues[2],
    API_TOKEN: secretValues[3],
    STAGING_ISOLATED: 'false'
  };
  const child = spawnSync(process.execPath, ['scripts/staging-migrate.js', 'migrate'], { cwd: process.cwd(), env: childEnvironment, encoding: 'utf8' });
  assert.notEqual(child.status, 0);
  const output = `${child.stdout}\n${child.stderr}`;
  for (const secret of secretValues) assert.equal(output.includes(secret), false);
  assert.match(output, /STAGING_ISOLATED_REQUIRED/);

  console.log('Isolated staging migration authorization gate smoke tests passed.');
} finally {
  process.env = originalEnvironment;
}
