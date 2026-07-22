import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const productionSqlitePath = path.resolve(rootDir, 'server', 'bookai.sqlite');

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

export function createIsolatedTestDatabase(label) {
  const requested = String(process.env.DB_PATH || '').trim();
  if (requested && samePath(requested, productionSqlitePath)) {
    throw new Error('Refusing to run smoke test against server/bookai.sqlite');
  }

  const tempDir = requested ? null : fs.mkdtempSync(path.join(os.tmpdir(), `bookai-${label}-`));
  const dbPath = requested ? path.resolve(requested) : path.join(tempDir, `${label}.sqlite`);
  if (samePath(dbPath, productionSqlitePath)) {
    throw new Error('Refusing to run smoke test against server/bookai.sqlite');
  }
  if (!requested) fs.copyFileSync(productionSqlitePath, dbPath);

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    const failures = [];
    for (const target of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try { fs.rmSync(target, { force: true }); } catch (error) { failures.push(`${path.basename(target)}: ${error.message}`); }
    }
    if (!requested) {
      try { fs.rmdirSync(tempDir); } catch (error) { failures.push(`${path.basename(tempDir)}: ${error.message}`); }
    }
    cleaned = true;
    if (failures.length) throw new Error(`Temporary SQLite cleanup failed: ${failures.join('; ')}`);
  }

  return { dbPath, cleanup };
}
