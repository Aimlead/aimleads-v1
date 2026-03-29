import assert from 'node:assert/strict';
import test from 'node:test';

const withEnv = async (nextEnv, fn) => {
  const previous = new Map();

  for (const [key, value] of Object.entries(nextEnv)) {
    previous.set(key, process.env[key]);
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const loadConfigModule = async () => import(`../server/lib/config.js?test=${Date.now()}`);

test('production rejects local data provider', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      SESSION_SECRET: 'prod-secret',
      CORS_ORIGIN: 'https://app.aimlead.io',
      DATA_PROVIDER: 'local',
      AUTH_PROVIDER: 'legacy',
      ANTHROPIC_API_KEY: 'anthropic-test',
    },
    async () => {
      const { validateRuntimeConfig } = await loadConfigModule();
      assert.throws(() => validateRuntimeConfig(), /DATA_PROVIDER=supabase/i);
    }
  );
});

test('production rejects legacy auth provider even with supabase datastore', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      SESSION_SECRET: 'prod-secret',
      CORS_ORIGIN: 'https://app.aimlead.io',
      DATA_PROVIDER: 'supabase',
      AUTH_PROVIDER: 'legacy',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'publishable',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      ANTHROPIC_API_KEY: 'anthropic-test',
    },
    async () => {
      const { validateRuntimeConfig } = await loadConfigModule();
      assert.throws(() => validateRuntimeConfig(), /AUTH_PROVIDER=supabase/i);
    }
  );
});

test('production rejects supabase local fallback flag', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      SESSION_SECRET: 'prod-secret',
      CORS_ORIGIN: 'https://app.aimlead.io',
      DATA_PROVIDER: 'supabase',
      AUTH_PROVIDER: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'publishable',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      SUPABASE_FALLBACK_TO_LOCAL: 'true',
      ANTHROPIC_API_KEY: 'anthropic-test',
    },
    async () => {
      const { validateRuntimeConfig } = await loadConfigModule();
      assert.throws(() => validateRuntimeConfig(), /SUPABASE_FALLBACK_TO_LOCAL/i);
    }
  );
});

test('production accepts strict supabase runtime when required keys are present', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      SESSION_SECRET: 'prod-secret',
      CORS_ORIGIN: 'https://app.aimlead.io',
      DATA_PROVIDER: 'supabase',
      AUTH_PROVIDER: 'supabase',
      ENABLE_DEMO_BOOTSTRAP: 'false',
      ENABLE_API_DOCS: 'false',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'publishable',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      ANTHROPIC_API_KEY: 'anthropic-test',
    },
    async () => {
      const { validateRuntimeConfig } = await loadConfigModule();
      const config = validateRuntimeConfig();
      assert.equal(config.dataProvider, 'supabase');
      assert.equal(config.authProvider, 'supabase');
      assert.equal(config.demoBootstrapEnabled, false);
      assert.equal(config.apiDocsEnabled, false);
    }
  );
});
