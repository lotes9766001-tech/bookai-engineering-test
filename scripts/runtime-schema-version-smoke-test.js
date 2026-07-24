import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ORDERED_MIGRATION_VERSIONS, REQUIRED_SCHEMA_VERSION as CONTRACT_VERSION } from '../server/migrations/postgres/contract.js';
import { REQUIRED_SCHEMA_VERSION as RUNTIME_VERSION, verifyPostgresSchema } from '../server/pg-db.js';
import { listMigrations, runMigrations } from '../server/migrations/postgres-runner.js';

const originalEnvironment = { ...process.env };
const secrets = [
  'postgresql://runtime-user:runtime-password@secret.invalid/bookai',
  'runtime-jwt-secret',
  'runtime-admin-password',
  'runtime-api-token'
];

function fakePool(rows = [], failure = null) {
  const queries = [];
  return {
    queries,
    query: async (sql) => {
      queries.push(sql);
      if (failure) throw failure;
      return { rows };
    }
  };
}

async function rejectedGate(pool, expected) {
  const error = await verifyPostgresSchema({ query: pool.query, enabled: true }).then(
    () => assert.fail('schema gate should reject'),
    (caught) => caught
  );
  assert.equal(error.code, expected.code || (expected.reason === 'migration_history_invalid'
    ? 'POSTGRES_SCHEMA_HISTORY_INVALID'
    : 'POSTGRES_SCHEMA_VERSION_MISMATCH'));
  assert.equal(error.ready, false);
  assert.equal(error.expected, CONTRACT_VERSION);
  assert.deepEqual({ reason: error.reason, actual: error.actual }, expected);
  return error;
}

async function rejectedDatabaseRead(pool, expectedCode) {
  const error = await verifyPostgresSchema({ query: pool.query, enabled: true }).then(
    () => assert.fail('database read failure should reject'),
    (caught) => caught
  );
  assert.equal(error.code, expectedCode);
  assert.equal(error.ready, false);
  return error;
}

try {
  process.env.DATABASE_URL = secrets[0];
  process.env.JWT_SECRET = secrets[1];
  process.env.ADMIN_PASSWORD = secrets[2];
  process.env.API_TOKEN = secrets[3];

  assert.equal(RUNTIME_VERSION, CONTRACT_VERSION);
  assert.equal(CONTRACT_VERSION, ORDERED_MIGRATION_VERSIONS.at(-1));
  assert.deepEqual((await listMigrations()).map(({ version }) => version), ORDERED_MIGRATION_VERSIONS);

  const missingTable = fakePool([], Object.assign(new Error('unsafe database detail'), { code: '42P01' }));
  await rejectedGate(missingTable, { reason: 'version_table_missing', actual: null });

  await rejectedGate(fakePool([]), { reason: 'history_empty', actual: null });

  const partialRows = ORDERED_MIGRATION_VERSIONS.slice(0, -1).map((version) => ({ version, status: 'applied' }));
  await rejectedGate(fakePool(partialRows), { reason: 'required_migrations_missing', actual: '006_tender_audit' });

  const completeRows = ORDERED_MIGRATION_VERSIONS.map((version) => ({ version, status: 'applied' })).reverse();
  const completePool = fakePool(completeRows);
  assert.deepEqual(await verifyPostgresSchema({ query: completePool.query, enabled: true }), { ready: true, version: CONTRACT_VERSION });
  assert.equal(completePool.queries.length, 1);
  assert.match(completePool.queries[0], /^SELECT\b/i);
  assert.doesNotMatch(completePool.queries[0], /INSERT|UPDATE|DELETE|CREATE|ALTER|DROP/i);
  await rejectedGate(
    fakePool([{ version: CONTRACT_VERSION, status: 'applied' }]),
    { reason: 'required_migrations_missing', actual: CONTRACT_VERSION }
  );

  const paddedRows = ORDERED_MIGRATION_VERSIONS.map((version) => ({
    version: ` ${version} `,
    status: version === CONTRACT_VERSION ? ' APPLIED ' : ' applied '
  }));
  await rejectedGate(fakePool(paddedRows), { reason: 'migration_history_invalid', actual: null });

  const uppercaseStatusRows = ORDERED_MIGRATION_VERSIONS.map((version) => ({
    version,
    status: version === CONTRACT_VERSION ? 'APPLIED' : 'applied'
  }));
  await rejectedGate(fakePool(uppercaseStatusRows), { reason: 'migration_history_invalid', actual: null });

  const duplicateRows = [...ORDERED_MIGRATION_VERSIONS.map((version) => ({ version, status: 'applied' })), {
    version: ORDERED_MIGRATION_VERSIONS[0], status: 'applied'
  }];
  const duplicateError = await rejectedGate(fakePool(duplicateRows), { reason: 'migration_history_invalid', actual: null });
  assert.equal(duplicateError.message.includes(secrets[0]), false);

  const unknownError = await rejectedGate(fakePool([
    ...ORDERED_MIGRATION_VERSIONS.map((version) => ({ version, status: 'applied' })),
    { version: '008_unknown_test', status: 'applied' }
  ]), { reason: 'migration_history_invalid', actual: null });
  assert.equal(unknownError.message.includes(secrets[0]), false);

  for (const status of ['failed', 'running']) {
    const rows = ORDERED_MIGRATION_VERSIONS.map((version) => ({ version, status: version === CONTRACT_VERSION ? status : 'applied' }));
    const error = await rejectedGate(fakePool(rows), { reason: 'migration_not_applied', actual: '006_tender_audit' });
    assert.deepEqual(error.notAppliedVersions, [CONTRACT_VERSION]);
  }

  const earlierFailureRows = ORDERED_MIGRATION_VERSIONS.map((version) => ({
    version,
    status: version === '003_commerce_erp' ? 'failed' : 'applied'
  }));
  const earlierFailure = await rejectedGate(fakePool(earlierFailureRows), { reason: 'migration_not_applied', actual: CONTRACT_VERSION });
  assert.deepEqual(earlierFailure.notAppliedVersions, ['003_commerce_erp']);

  const migrations = await listMigrations();
  const checksumPool = fakePool([{ version: migrations[0].version, checksum: 'wrong', status: 'applied' }]);
  await assert.rejects(
    runMigrations({ mode: 'migrate', pool: checksumPool, allowProduction: true }),
    { code: 'MIGRATION_CHECKSUM_MISMATCH' }
  );

  const source = await readFile(new URL('../server/pg-db.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /runMigrations|ensureVersionTable/);
  assert.doesNotMatch(source, /REQUIRED_SCHEMA_VERSION\s*=\s*['"]/);

  const safeErrors = [];
  for (const [code, reason] of [
    ['CONNECTION_FAILED', 'migration_history_unavailable'],
    ['42501', 'migration_history_permission_denied'],
    ['3F000', 'migration_history_schema_unavailable']
  ]) {
    const error = await rejectedDatabaseRead(
      fakePool([], Object.assign(new Error(secrets.join(' ')), { code })),
      'POSTGRES_SCHEMA_HISTORY_UNAVAILABLE'
    );
    assert.equal(error.reason, reason);
    assert.equal(error.message.includes(secrets[0]), false);
    safeErrors.push(error);
  }
  const output = JSON.stringify(safeErrors.map(({ code, message, ready, reason, expected, actual }) => ({ code, message, ready, reason, expected, actual })));
  for (const secret of secrets) assert.equal(output.includes(secret), false);

  console.log('Runtime schema version Fake Pool smoke tests passed.');
} finally {
  process.env = originalEnvironment;
}
