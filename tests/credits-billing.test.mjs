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

const loadCreditsModule = async () => import(`../server/lib/credits.js?test=${Date.now()}-${Math.random()}`);

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

const createMockRes = () => {
  const response = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
  };
  return response;
};

test('requireActiveBilling blocks expired trials with 402', async () => {
  await withEnv(
    {
      DATA_PROVIDER: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      SESSION_SECRET: 'test-secret',
    },
    async () => {
      const previousFetch = global.fetch;
      global.fetch = async (url) => {
        assert.match(String(url), /workspaces/);
        return jsonResponse(200, [{
          plan_slug: 'starter',
          billing_status: 'trial',
          trial_ends_at: '2025-01-01T00:00:00.000Z',
        }]);
      };

      try {
        const { requireActiveBilling } = await loadCreditsModule();
        const req = {
          user: {
            id: 'user_123',
            workspace_context: {
              workspace_id: 'ws_123',
              role: 'owner',
            },
          },
        };
        const res = createMockRes();
        let nextCalled = false;

        await requireActiveBilling(req, res, () => {
          nextCalled = true;
        });

        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 402);
        assert.equal(res.body?.code, 'TRIAL_EXPIRED');
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});

test('requireCredits allows active billing and deducts credits for known actions', async () => {
  await withEnv(
    {
      DATA_PROVIDER: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      SESSION_SECRET: 'test-secret',
    },
    async () => {
      const previousFetch = global.fetch;
      const fetchCalls = [];

      global.fetch = async (url, options = {}) => {
        fetchCalls.push({ url: String(url), method: options.method || 'GET' });

        if (String(url).includes('/rest/v1/workspaces')) {
          return jsonResponse(200, [{
            plan_slug: 'starter',
            billing_status: 'active',
            trial_ends_at: null,
          }]);
        }

        if (String(url).includes('/rest/v1/rpc/deduct_credits')) {
          return jsonResponse(200, {
            success: true,
            balance: 17,
            deducted: 3,
          });
        }

        throw new Error(`Unexpected fetch call: ${url}`);
      };

      try {
        const { requireCredits } = await loadCreditsModule();
        const req = {
          path: '/api/leads/lead_123/sequence',
          method: 'POST',
          user: {
            id: 'user_123',
            workspace_context: {
              workspace_id: 'ws_123',
              role: 'owner',
            },
          },
        };
        const res = createMockRes();
        let nextCalled = false;

        await requireCredits('sequence')(req, res, () => {
          nextCalled = true;
        });

        assert.equal(nextCalled, true);
        assert.equal(req.creditsDeducted, 3);
        assert.equal(req.creditsBalance, 17);
        assert.equal(fetchCalls.some((call) => call.url.includes('/rpc/deduct_credits')), true);
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});
