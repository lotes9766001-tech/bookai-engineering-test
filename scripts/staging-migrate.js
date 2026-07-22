const mode = process.argv[2] || 'plan';
if (!['plan', 'status', 'migrate'].includes(mode)) {
  console.error(JSON.stringify({ code: 'MIGRATION_MODE_INVALID', message: 'Staging migration command failed' }));
  process.exitCode = 2;
} else {
  try {
    const { assertIsolatedStagingAuthorization, runMigrations } = await import('../server/migrations/postgres-runner.js');
    if (process.env.NODE_ENV !== 'production') {
      throw Object.assign(new Error('Staging migration requires production runtime mode'), { code: 'STAGING_NODE_ENV_REQUIRED' });
    }
    assertIsolatedStagingAuthorization();
    if (mode === 'migrate') console.log(JSON.stringify({ target: 'isolated-staging', operation: 'migrate' }));
    const result = await runMigrations({ mode, allowProduction: false, allowIsolatedStaging: true });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ code: error?.code || 'MIGRATION_FAILED', message: 'Staging migration command failed' }));
    process.exitCode = 1;
  }
}
