const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const demoBootstrapEnabled = (() => {
  const raw = String(process.env.ENABLE_DEMO_BOOTSTRAP || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return !isProduction;
})();

const dataProvider = String(process.env.DATA_PROVIDER || 'local').trim().toLowerCase();
const authProvider = String(process.env.AUTH_PROVIDER || (dataProvider === 'supabase' ? 'supabase' : 'legacy'))
  .trim()
  .toLowerCase();
const apiDocsEnabled = (() => {
  const raw = String(process.env.ENABLE_API_DOCS || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return !isProduction;
})();

const getSessionSecret = () => {
  const value = String(process.env.SESSION_SECRET || '').trim();
  if (!value) {
    if (isProduction) {
      throw new Error('SESSION_SECRET is required in production');
    }
    // In development, warn loudly but use a deterministic dev-only secret
    console.warn('[config] SESSION_SECRET not set — using insecure dev-only default. Set SESSION_SECRET in your .env file.');
    return 'aimleads-dev-only-secret-do-not-use-in-production';
  }
  return value;
};

const requireEnv = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const getSupabasePublishableKey = () =>
  String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

const parseTrustProxy = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return isProduction ? 1 : false;
  if (['false', '0', 'off', 'no'].includes(raw)) return false;
  if (['true', '1', 'on', 'yes'].includes(raw)) return 1;
  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 0) return numeric;
  return raw;
};

export const getRuntimeConfig = () => {
  return {
    nodeEnv,
    isProduction,
    demoBootstrapEnabled,
    dataProvider,
    authProvider,
    apiDocsEnabled,
    sessionSecret: getSessionSecret(),
    corsOrigin: String(process.env.CORS_ORIGIN || '').trim(),
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    rateLimit: {
      apiWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
      apiMax: Number(process.env.API_RATE_LIMIT_MAX || 600),
      authWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000),
      authMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),
    },
    supabase: {
      url: String(process.env.SUPABASE_URL || '').trim(),
      publishableKey: getSupabasePublishableKey(),
      serviceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    },
  };
};

export const validateRuntimeConfig = () => {
  const config = getRuntimeConfig();

  if (!['local', 'supabase'].includes(config.dataProvider)) {
    throw new Error(`DATA_PROVIDER must be one of: local, supabase (received: ${config.dataProvider})`);
  }

  if (!['legacy', 'supabase'].includes(config.authProvider)) {
    throw new Error(`AUTH_PROVIDER must be one of: legacy, supabase (received: ${config.authProvider})`);
  }

  if (config.isProduction && config.dataProvider !== 'supabase') {
    throw new Error('Production requires DATA_PROVIDER=supabase.');
  }

  if (config.isProduction && config.authProvider !== 'supabase') {
    throw new Error('Production requires AUTH_PROVIDER=supabase.');
  }

  if (config.isProduction && config.demoBootstrapEnabled) {
    throw new Error('ENABLE_DEMO_BOOTSTRAP must be disabled in production.');
  }

  if (config.isProduction && !config.corsOrigin && !process.env.VERCEL_URL) {
    throw new Error('CORS_ORIGIN is required in production (or deploy to Vercel where VERCEL_URL is set automatically)');
  }

  if (config.isProduction && isTruthy(process.env.SUPABASE_FALLBACK_TO_LOCAL)) {
    throw new Error('SUPABASE_FALLBACK_TO_LOCAL must be disabled in production.');
  }

  if (config.dataProvider === 'supabase') {
    requireEnv('SUPABASE_URL');
    requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (config.authProvider === 'supabase') {
    requireEnv('SUPABASE_URL');
    if (!getSupabasePublishableKey()) {
      throw new Error('SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required');
    }
    requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (config.isProduction) {
    requireEnv('ANTHROPIC_API_KEY');
  }

  return config;
};

export const getDataProvider = () => getRuntimeConfig().dataProvider;
export const isDataProviderSupabase = () => getDataProvider() === 'supabase';

export const getAuthProvider = () => getRuntimeConfig().authProvider;
export const isAuthProviderSupabase = () => getAuthProvider() === 'supabase';

export { getSessionSecret };
