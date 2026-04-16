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

const loadDataStoreModule = async () => import(`../server/lib/dataStore.js?test=${Date.now()}-${Math.random()}`);

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
});

test('supabase icp create retries with owner_user_id for legacy not-null schema', async () => {
  await withEnv(
    {
      DATA_PROVIDER: 'supabase',
      AUTH_PROVIDER: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      SUPABASE_PUBLISHABLE_KEY: 'publishable',
      SESSION_SECRET: 'test-secret',
    },
    async () => {
      const fetchCalls = [];
      const previousFetch = global.fetch;

      global.fetch = async (_url, options = {}) => {
        fetchCalls.push({
          method: options.method || 'GET',
          body: options.body ? JSON.parse(options.body) : undefined,
        });

        if (fetchCalls.length === 1) {
          return jsonResponse(400, {
            message:
              'null value in column "owner_user_id" of relation "icp_profiles" violates not-null constraint',
          });
        }

        return jsonResponse(201, [
          {
            ...(fetchCalls.at(-1)?.body || {}),
            updated_at: '2026-03-29T12:00:00.000Z',
          },
        ]);
      };

      try {
        const { dataStore } = await loadDataStoreModule();

        const user = {
          id: 'user_app_123',
          app_user_id: 'user_app_123',
          workspace_context: {
            workspace_id: 'ws_123',
            role: 'owner',
            app_user_id: 'user_app_123',
          },
        };

        const profile = await dataStore.createIcpProfile(user, {
          name: 'ICP Test',
          description: 'Compat test',
          weights: { industry: 0.4 },
        });

        assert.equal(fetchCalls.length, 2);
        assert.equal(fetchCalls[0].method, 'POST');
        assert.equal(fetchCalls[0].body.owner_user_id, undefined);
        assert.equal(fetchCalls[1].body.owner_user_id, 'user_app_123');
        assert.equal(profile.owner_user_id, 'user_app_123');
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});
