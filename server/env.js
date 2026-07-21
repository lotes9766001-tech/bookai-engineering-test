const ALLOWED_ENVIRONMENTS = new Set(['development', 'test', 'production']);
const INSECURE_PRODUCTION_SECRETS = new Set(['dev-secret-change-me', 'test-secret']);
const INSECURE_PRODUCTION_PASSWORDS = new Set(['demo123456']);

function present(value) {
  return Boolean(String(value || '').trim());
}

function entry(name, isPresent) {
  return { name, present: Boolean(isPresent) };
}

export function resolveEnvironment(env = process.env) {
  const rawEnvironment = String(env.NODE_ENV || '').trim().toLowerCase();
  const environmentExplicit = Boolean(rawEnvironment);
  const environment = rawEnvironment || 'development';
  const environmentValid = ALLOWED_ENVIRONMENTS.has(environment);
  const production = environmentValid && environment === 'production';

  const databasePresent = present(env.DATABASE_URL);
  const jwtPresent = present(env.JWT_SECRET) && (!production || !INSECURE_PRODUCTION_SECRETS.has(String(env.JWT_SECRET)));
  const runtime = [
    entry('DATABASE_URL', databasePresent),
    entry('JWT_SECRET', jwtPresent)
  ];
  const runtimeReady = environmentValid && (!production || runtime.every((item) => item.present));

  const bootstrapPrimaryPresent = present(env.BOOTSTRAP_SECRET);
  const bootstrapAliasPresent = present(env.BOOKAI_BOOTSTRAP_SECRET);
  const bootstrapSecret = bootstrapPrimaryPresent ? env.BOOTSTRAP_SECRET : env.BOOKAI_BOOTSTRAP_SECRET;
  const bootstrapSecretReady = present(bootstrapSecret)
    && (!production || !INSECURE_PRODUCTION_SECRETS.has(String(bootstrapSecret)));
  const bootstrapPasswordReady = present(env.ADMIN_PASSWORD)
    && (!production || !INSECURE_PRODUCTION_PASSWORDS.has(String(env.ADMIN_PASSWORD)));

  const founderIdentityReady = !production || present(env.FOUNDER_EMAIL);
  const adminIdentityReady = !production || present(env.ADMIN_EMAIL);
  const privilegedIdentityReady = founderIdentityReady && adminIdentityReady;
  const corsReady = !production || present(env.CORS_ORIGIN);

  return {
    environment,
    environmentExplicit,
    environmentValid,
    production,
    runtime,
    runtimeReady,
    authenticationReady: !production || jwtPresent,
    privilegedIdentity: {
      founderReady: founderIdentityReady,
      adminReady: adminIdentityReady,
      ready: privilegedIdentityReady
    },
    bootstrap: {
      secretReady: bootstrapSecretReady,
      passwordReady: bootstrapPasswordReady,
      ready: bootstrapSecretReady && bootstrapPasswordReady,
      available: bootstrapSecretReady && bootstrapPasswordReady && privilegedIdentityReady,
      primaryConfigured: bootstrapPrimaryPresent,
      deprecatedAliasConfigured: !bootstrapPrimaryPresent && bootstrapAliasPresent
    },
    cors: {
      configured: present(env.CORS_ORIGIN),
      ready: corsReady
    },
    unused: ['CLIENT_URL']
  };
}

export const ENVIRONMENT_STATUS = resolveEnvironment();
export const NODE_ENV = ENVIRONMENT_STATUS.environment;

export function getEnvironmentStatus() {
  return resolveEnvironment(process.env);
}

export function logEnvironmentStatus() {
  const status = getEnvironmentStatus();
  const logPresence = (name, isPresent, required = false) => {
    const log = required && !isPresent ? console.error : (!isPresent ? console.warn : console.log);
    log(`[config] ${name}=${isPresent ? 'present' : 'missing'}`);
  };

  console.log(`[config] environment=${status.environment}`);
  console.log(`[config] NODE_ENV=${status.environmentExplicit ? 'present' : 'missing'}`);
  if (!status.environmentValid) {
    console.error('[config] NODE_ENV=invalid');
  }

  if (status.production) {
    for (const item of status.runtime) logPresence(item.name, item.present, true);
    logPresence('FOUNDER_EMAIL', status.privilegedIdentity.founderReady);
    logPresence('ADMIN_EMAIL', status.privilegedIdentity.adminReady);
    logPresence('CORS_ORIGIN', status.cors.configured);
    logPresence('BOOTSTRAP_SECRET', status.bootstrap.secretReady);
    logPresence('ADMIN_PASSWORD', status.bootstrap.passwordReady);
    if (status.bootstrap.deprecatedAliasConfigured) {
      console.warn('[config] BOOKAI_BOOTSTRAP_SECRET=deprecated-alias');
    }
  }

  return status;
}
