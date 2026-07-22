import assert from 'node:assert/strict';
import { listMigrations, runMigrations } from '../server/migrations/postgres-runner.js';
import { schemaTables, tableDisposition } from '../server/migrations/postgres/contract.js';

const migrations = await listMigrations();
assert.equal(migrations.length, 7);
assert.deepEqual(migrations.map((m) => m.version), ['001_core_identity','002_engineering_inventory','003_commerce_erp','004_cms','005_accounting','006_tender_audit','007_schema_parity']);
assert.equal(new Set(schemaTables).size, 49);
assert.ok(schemaTables.every((name) => ['ACTIVE','LEGACY_EXCLUDED'].includes(tableDisposition[name].status)));
const migrationSql = migrations.map((m) => m.sql).join('\n');
assert.ok(schemaTables.every((name) => new RegExp(`CREATE TABLE IF NOT EXISTS ${name}\\b`, 'i').test(migrationSql)));
assert.equal(tableDisposition.commerce_site_products.status, 'ACTIVE');
assert.equal(tableDisposition.accountant_clients.status, 'ACTIVE');
assert.deepEqual(tableDisposition.vouchers.conflictDecisions, undefined);
assert.equal(typeof tableDisposition.users.timestampPolicy, 'string');
assert.deepEqual((await runMigrations({ mode: 'plan' })).migrations[0].version, migrations[0].version);
await assert.rejects(() => runMigrations({ mode: 'migrate', pool: { query: async () => { throw new Error('not expected'); } } }), /not expected/);
console.log('Package B-Core static migration and schema contract smoke tests passed.');
