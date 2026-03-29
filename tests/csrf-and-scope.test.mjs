import test from 'node:test';
import assert from 'node:assert/strict';

import { csrfProtection, isTrustedMutationRequest } from '../server/lib/middleware.js';
import { isRecordScopedToUser } from '../server/lib/scope.js';

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

const createMockResponse = () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return response;
};

test('trusted mutation helper blocks production writes when origin is missing or untrusted', () => {
  const req = {
    method: 'POST',
    headers: {
      'x-requested-with': 'XMLHttpRequest',
    },
  };

  assert.equal(
    isTrustedMutationRequest(req, {
      isProduction: true,
      corsOrigin: 'https://app.aimlead.io',
    }),
    false
  );
});

test('trusted mutation helper allows production writes from trusted origin', () => {
  const req = {
    method: 'PATCH',
    headers: {
      origin: 'https://app.aimlead.io',
      'x-csrf-token': 'token_123',
      'x-requested-with': 'XMLHttpRequest',
    },
    cookies: {
      aimleads_csrf: 'token_123',
    },
  };

  assert.equal(
    isTrustedMutationRequest(req, {
      isProduction: true,
      corsOrigin: 'https://app.aimlead.io',
    }),
    true
  );
});

test('csrfProtection still allows trusted csrf-backed xhr mutations in non-production', async () => {
  await withEnv(
    {
      NODE_ENV: 'test',
      CORS_ORIGIN: '',
    },
    async () => {
      const req = {
        method: 'POST',
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          'x-csrf-token': 'token_abc',
        },
        cookies: {
          aimleads_csrf: 'token_abc',
        },
      };
      const res = createMockResponse();
      let nextCalled = false;

      csrfProtection(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, 200);
    }
  );
});

test('csrfProtection blocks production writes when csrf token is missing', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://app.aimlead.io',
    },
    async () => {
      const req = {
        method: 'POST',
        headers: {
          origin: 'https://app.aimlead.io',
          'x-requested-with': 'XMLHttpRequest',
        },
        cookies: {},
      };
      const res = createMockResponse();
      let nextCalled = false;

      csrfProtection(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
      assert.match(res.body.message, /csrf/i);
    }
  );
});

test('scope ignores owner_user_id fallback and requires workspace match', () => {
  const user = {
    id: 'user_123',
    email: 'owner@example.com',
    workspace_context: {
      workspace_id: 'ws_a',
      role: 'owner',
      app_user_id: 'user_123',
    },
    workspace_membership_verified: true,
  };

  assert.equal(
    isRecordScopedToUser(
      {
        owner_user_id: 'user_123',
      },
      user
    ),
    false
  );

  assert.equal(
    isRecordScopedToUser(
      {
        workspace_id: 'ws_a',
        owner_user_id: 'someone_else',
      },
      user
    ),
    true
  );
});
