const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const dataProvider = String(process.env.DATA_PROVIDER || 'local').trim().toLowerCase();
const authProvider = String(process.env.AUTH_PROVIDER || (dataProvider === 'supabase' ? 'supabase' : 'legacy'))
  .trim()
  .toLowerCase();

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

export const getRuntimeConfig = () => {
  return {
    nodeEnv,
    isProduction,
    dataProvider,
    authProvider,
    sessionSecret: getSessionSecret(),
    corsOrigin: String(process.env.CORS_ORIGIN || '').trim(),
    rateLimit: {
      apiWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
      apiMax: Number(process.env.API_RATE_LIMIT_MAX || 600),
      authWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000),
      authMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),
    },
    supabase: {
      url: String(process.env.SUPABASE_URL || '').trim(),
      publishableKey: String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim(),
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

  if (config.isProduction && !config.corsOrigin && !process.env.VERCEL_URL) {
    throw new Error('CORS_ORIGIN is required in production (or deploy to Vercel where VERCEL_URL is set automatically)');
  }

  if (config.dataProvider === 'supabase') {
    requireEnv('SUPABASE_URL');
    requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (config.authProvider === 'supabase') {
    requireEnv('SUPABASE_URL');
    requireEnv('SUPABASE_PUBLISHABLE_KEY');
    requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  }

  return config;
};

export const getDataProvider = () => getRuntimeConfig().dataProvider;
export const isDataProviderSupabase = () => getDataProvider() === 'supabase';

export const getAuthProvider = () => getRuntimeConfig().authProvider;
export const isAuthProviderSupabase = () => getAuthProvider() === 'supabase';

export { getSessionSecret };