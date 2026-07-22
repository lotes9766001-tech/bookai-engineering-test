import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDb = path.join(root, 'server', 'bookai.sqlite');
const hash = () => crypto.createHash('sha256').update(fs.readFileSync(sourceDb)).digest('hex');
const before = hash();
const beforeStat = fs.statSync(sourceDb);

function run(script, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: '', ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal, output }));
  });
}

for (const script of ['scripts/smoke-test.js', 'scripts/rbac-smoke-test.js', 'scripts/package-a-smoke-test.js', 'scripts/package-a2-smoke-test.js', 'scripts/package-b-core-smoke-test.js']) {
  const result = await run(script);
  assert.equal(result.signal, null, `${script} terminated by ${result.signal}`);
  assert.equal(result.code, 0, `${script} failed`);
  assert.equal(hash(), before, `${script} modified server/bookai.sqlite`);
  assert.doesNotMatch(result.output, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, `${script} printed an email address`);
  assert.doesNotMatch(result.output, /(?:phone|password)\s*[:=]/i, `${script} printed sensitive account data`);
}

for (const script of ['scripts/smoke-test.js', 'scripts/rbac-smoke-test.js']) {
  const result = await run(script, { DB_PATH: sourceDb });
  assert.notEqual(result.code, 0, `${script} fail-closed gate did not stop execution`);
  assert.equal(hash(), before, `${script} fail-closed check modified server/bookai.sqlite`);
}

const leftovers = fs.readdirSync(os.tmpdir()).filter((name) => /^bookai-(?:core-smoke|rbac-smoke)-/.test(name));
assert.deepEqual(leftovers, [], `Temporary SQLite artifacts remain: ${leftovers.join(', ')}`);
const afterStat = fs.statSync(sourceDb);
assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs, 'server/bookai.sqlite modification time changed');
assert.equal(hash(), before, 'server/bookai.sqlite hash changed');
console.log('SQLite smoke isolation, fail-closed gates, cleanup, and source integrity passed.');
