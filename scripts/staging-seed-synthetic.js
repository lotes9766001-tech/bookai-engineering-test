if (process.env.STAGING_ISOLATED !== 'true') {
  console.error('STAGING_ISOLATED=true is required; synthetic seed not executed.');
  process.exit(1);
}
console.log('Synthetic seed is intentionally a staging-only placeholder; no account or data was created.');
