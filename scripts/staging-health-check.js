const base = String(process.env.STAGING_APP_URL || '').replace(/\/$/, '');
if (!base) { console.error('STAGING_APP_URL is missing'); process.exit(1); }
for (const path of ['/api/ping', '/api/health']) {
  const response = await fetch(`${base}${path}`);
  console.log(JSON.stringify({ path, status: response.status }));
  if (![200, 503].includes(response.status)) process.exitCode = 1;
}
