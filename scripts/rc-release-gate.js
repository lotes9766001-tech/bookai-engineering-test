import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function run(label, command, args) {
  console.log(`[RC_GATE] ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) {
    console.error(`[RC_GATE] ${label} failed`);
    process.exit(result.status || 1);
  }
}

function scanCandidates() {
  const changed = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean)
    .filter((name) => /^(server\/|scripts\/rc-release-gate\.js$|docs\/RC_)/.test(name));
  const names = [...new Set([...changed, 'server/pg-db.js', 'server/index.js', 'scripts/rc-release-gate.js',
    'docs/RC_FINAL_AUDIT.md', 'docs/RC_FINAL_QA.md', 'docs/RC_FINAL_STAGING_CHECKLIST.md',
    'docs/RC_FINAL_ROLLBACK.md', 'docs/RC_INCIDENT_RUNBOOK.md', 'docs/RC_STORAGE_DECISION.md'])]
    .filter(existsSync);
  const rules = [
    ['credential assignment', /(?:DATABASE_URL|JWT_SECRET|BOOTSTRAP_SECRET|PASSWORD)\s*=\s*['"][^'"\r\n]+['"]/i],
    ['non-test postgres URI', /postgres(?:ql)?:\/\/(?![^\s/@]+:[^\s/@]+@[^\s]+\.invalid\b)/i],
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i]
  ];
  for (const name of names) {
    const content = readFileSync(name, 'utf8');
    for (const [rule, pattern] of rules) {
      if (pattern.test(content)) {
        console.error(`[RC_GATE] secret scan failed: ${name} (${rule})`);
        process.exit(1);
      }
    }
  }
  console.log(`[RC_GATE] secret scan passed (${names.length} candidate files)`);
}

const checks = [
  ['node --check server/pg-db.js', process.execPath, ['--check', 'server/pg-db.js']],
  ['node --check server/index.js', process.execPath, ['--check', 'server/index.js']],
  ['node --check runtime schema smoke', process.execPath, ['--check', 'scripts/runtime-schema-version-smoke-test.js']],
  ['node --check Package A smoke', process.execPath, ['--check', 'scripts/package-a-smoke-test.js']],
  ['node --check release gate', process.execPath, ['--check', 'scripts/rc-release-gate.js']],
  ['runtime schema smoke', process.execPath, ['scripts/runtime-schema-version-smoke-test.js']],
  ['staging migration gate smoke', process.execPath, ['scripts/staging-migration-gate-smoke-test.js']],
  ['Package A smoke', process.execPath, ['scripts/package-a-smoke-test.js']],
  ['Package A.2 smoke', process.execPath, ['scripts/package-a2-smoke-test.js']],
  ['B-Core smoke', process.execPath, ['scripts/package-b-core-smoke-test.js']],
  ['SQLite isolation smoke', process.execPath, ['scripts/sqlite-test-isolation-check.js']],
  ['core SQLite smoke', process.execPath, ['scripts/smoke-test.js']],
  ['RBAC smoke', process.execPath, ['scripts/rbac-smoke-test.js']],
  ['health', 'npm.cmd', ['run', 'health']],
  ['client build', process.platform === 'win32' ? 'cmd.exe' : 'npm', process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm.cmd run build']
    : ['run', 'build']],
  ['git diff check', 'git', ['diff', '--check']]
];

for (const [label, command, args] of checks) {
  if (command === 'npm.cmd') {
    run(label, process.platform === 'win32' ? 'cmd.exe' : 'npm', process.platform === 'win32' ? ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`] : args);
  } else run(label, command, args);
}
run('git cached diff check', 'git', ['diff', '--cached', '--check']);
scanCandidates();

console.log('RC local foundation gate passed');
