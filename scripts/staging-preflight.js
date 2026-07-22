const required = ['NODE_ENV', 'DATABASE_URL', 'JWT_SECRET', 'BOOTSTRAP_SECRET', 'APP_URL', 'CORS_ALLOWED_ORIGINS'];
const missing = required.filter((name) => !String(process.env[name] || '').trim());
const unsafe = process.env.NODE_ENV !== 'production' || process.env.TENDER_SYNC_ENABLED === 'true' || process.env.AI_ENABLED === 'true' || process.env.EXTERNAL_SIDE_EFFECTS_ENABLED === 'true';
console.log(JSON.stringify({ environment: process.env.NODE_ENV || 'missing', required: Object.fromEntries(required.map((name) => [name, missing.includes(name) ? 'missing' : 'present'])), tenderSync: process.env.TENDER_SYNC_ENABLED === 'true', ai: process.env.AI_ENABLED === 'true', externalSideEffects: process.env.EXTERNAL_SIDE_EFFECTS_ENABLED === 'true', isolatedFlag: process.env.STAGING_ISOLATED === 'true' }));
if (missing.length || unsafe || process.env.STAGING_ISOLATED !== 'true') process.exitCode = 1;
