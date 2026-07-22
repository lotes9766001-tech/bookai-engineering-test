if (process.env.STAGING_ISOLATED !== 'true') {
  console.error('STAGING_ISOLATED=true is required; migration not executed.');
  process.exit(1);
}
if (process.env.NODE_ENV !== 'production' || process.env.TENDER_SYNC_ENABLED === 'true' || process.env.EXTERNAL_SIDE_EFFECTS_ENABLED === 'true') {
  console.error('Unsafe staging configuration; migration not executed.');
  process.exit(1);
}
const { runMigrations } = await import('../server/migrations/postgres-runner.js');
const mode = process.argv[2] || 'plan';
const result = await runMigrations({ mode, allowProduction: false });
console.log(JSON.stringify(result));
