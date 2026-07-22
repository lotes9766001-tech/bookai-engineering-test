import { runMigrations } from '../server/migrations/postgres-runner.js';

const mode = process.argv[2] || 'plan';
if (!['plan', 'status', 'migrate'].includes(mode)) {
  console.error('Usage: node scripts/postgres-migrate.js plan|status|migrate');
  process.exitCode = 2;
} else {
  try {
    const result = await runMigrations({ mode, allowProduction: process.argv.includes('--confirm-production-migration') });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ code: error?.code || 'MIGRATION_FAILED', message: 'Migration command failed' }));
    process.exitCode = 1;
  }
}
