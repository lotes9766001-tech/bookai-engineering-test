import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getPool, REQUIRED_SCHEMA_VERSION } from '../pg-db.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const migrationDir = path.join(root, 'postgres');
const safe = (error) => ({ code: error?.code || 'MIGRATION_FAILED', message: 'Migration operation failed' });
const sideEffectFlags = [
  'TENDER_SYNC_ENABLED',
  'AI_ENABLED',
  'EXTERNAL_SIDE_EFFECTS_ENABLED',
  'EMAIL_SIDE_EFFECTS_ENABLED',
  'LINE_SIDE_EFFECTS_ENABLED',
  'PAYMENT_SIDE_EFFECTS_ENABLED'
];

const migrationError = (code, message) => Object.assign(new Error(message), { code });

export function assertIsolatedStagingAuthorization(environment = process.env) {
  if (environment.STAGING_ISOLATED !== 'true') {
    throw migrationError('STAGING_ISOLATED_REQUIRED', 'Isolated staging marker is required');
  }
  const enabledFlag = sideEffectFlags.find((name) => environment[name] === 'true');
  if (enabledFlag) {
    throw migrationError('STAGING_SIDE_EFFECTS_ENABLED', 'Side effects must be disabled for isolated staging');
  }
  if (!environment.DATABASE_URL) {
    throw migrationError('STAGING_DATABASE_URL_REQUIRED', 'Isolated staging database configuration is required');
  }
}

export async function listMigrations() {
  const names = (await fs.readdir(migrationDir)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort();
  const seen = new Set();
  const result = [];
  for (const name of names) {
    const version = name.split('_', 1)[0];
    if (seen.has(version)) throw Object.assign(new Error('Duplicate migration version'), { code: 'MIGRATION_DUPLICATE_VERSION' });
    seen.add(version);
    const sql = await fs.readFile(path.join(migrationDir, name), 'utf8');
    result.push({ version: name.replace(/\.sql$/i, ''), name, checksum: crypto.createHash('sha256').update(sql).digest('hex'), sql });
  }
  return result;
}

export async function ensureVersionTable(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS bookai_schema_migrations (
    version TEXT PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    execution_ms INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
    error_code TEXT, runner_version TEXT
  )`);
}

async function migrationStatus(pool, migrations) {
  const migrationMetadata = migrations.map(({ sql, ...item }) => item);
  const catalog = await pool.query("SELECT to_regclass('bookai_schema_migrations') AS version_table");
  const versionTableExists = Boolean(catalog.rows[0]?.version_table);
  const applied = versionTableExists
    ? (await pool.query('SELECT version, checksum, status FROM bookai_schema_migrations ORDER BY version')).rows
    : [];
  return {
    mode: 'status',
    versionTableExists,
    applied,
    latestVersion: migrations.at(-1)?.version || null,
    migrations: migrationMetadata
  };
}

export async function runMigrations({ pool = null, mode = 'plan', allowProduction = false, allowIsolatedStaging = false } = {}) {
  const migrations = await listMigrations();
  if (mode === 'plan') return { mode, migrations: migrations.map(({ sql, ...item }) => item) };
  if (mode === 'status') {
    if (!pool && !process.env.DATABASE_URL) {
      return {
        mode,
        versionTableExists: false,
        applied: [],
        latestVersion: migrations.at(-1)?.version || null,
        migrations: migrations.map(({ sql, ...item }) => item)
      };
    }
    return migrationStatus(pool || await getPool(), migrations);
  }
  if (mode !== 'migrate') throw Object.assign(new Error('Unsupported migration mode'), { code: 'MIGRATION_MODE_INVALID' });
  if (process.env.NODE_ENV === 'production' && !allowProduction) {
    if (!allowIsolatedStaging) throw migrationError('PRODUCTION_MIGRATION_GATE_REQUIRED', 'Production migration requires explicit gate');
    assertIsolatedStagingAuthorization();
  }
  const activePool = pool || await getPool();
  await ensureVersionTable(activePool);
  const applied = (await activePool.query('SELECT version, checksum, status FROM bookai_schema_migrations ORDER BY version')).rows;
  for (const row of applied) {
    const current = migrations.find((item) => item.version === row.version);
    if (!current || row.status !== 'applied' || current.checksum !== row.checksum) throw Object.assign(new Error('Migration history mismatch'), { code: 'MIGRATION_CHECKSUM_MISMATCH' });
  }
  for (const migration of migrations) {
    if (applied.some((row) => row.version === migration.version)) continue;
    const started = Date.now();
    try {
      await activePool.query('BEGIN');
      if (migration.sql.trim()) await activePool.query(migration.sql);
      await activePool.query('INSERT INTO bookai_schema_migrations (version,name,checksum,execution_ms,status,runner_version) VALUES ($1,$2,$3,$4,$5,$6)', [migration.version, migration.name, migration.checksum, Date.now() - started, 'applied', 'b-core-1']);
      await activePool.query('COMMIT');
    } catch (error) {
      try { await activePool.query('ROLLBACK'); } catch {}
      console.error('[migration] failed', safe(error));
      throw Object.assign(new Error('Migration failed'), { code: 'MIGRATION_FAILED' });
    }
  }
  return { mode, applied: migrations.length, version: REQUIRED_SCHEMA_VERSION };
}
