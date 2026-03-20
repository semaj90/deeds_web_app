import pg from 'pg';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { TEST_CASE_PREFIX } from './fixtures/test-cases.js';

const API_ENDPOINT = '/api/persons';
const DB_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

interface ApiTestUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

function buildUser(label: string): ApiTestUser {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  return {
    email: `playwright-${label}-${nonce}@test.legal.ai`,
    password: 'TestPass123!',
    firstName: 'Playwright',
    lastName: label,
  };
}

async function cleanupAuthApiArtifacts(email: string, personNames: string[] = []) {
  const pool = new pg.Pool({ connectionString: DB_URL });

  try {
    if (personNames.length > 0) {
      await pool.query('DELETE FROM persons_of_interest WHERE name = ANY($1::text[])', [
        personNames,
      ]);
    }

    const usersResult = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);

    for (const row of usersResult.rows) {
      await pool.query('DELETE FROM cases WHERE user_id = $1', [row.id]);
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [row.id]);
      await pool.query('DELETE FROM users WHERE id = $1', [row.id]);
    }
  } finally {
    await pool.end();
  }
}

async function registerUser(request: APIRequestContext, user: ApiTestUser) {
  const registerResponse = await request.post('/api/auth/register', {
    data: user,
  });
  expect(registerResponse.status()).toBe(201);
}

async function createCase(request: APIRequestContext, title: string) {
  const response = await request.post('/api/cases', {
    data: {
      title,
      description: 'Playwright auth-api case fixture',
      priority: 'medium',
    },
  });

  expect(response.status()).toBe(201);

  const body = await response.json();
  const caseId = body.data?.case?.id;
  expect(caseId).toBeTruthy();

  return caseId as string;
}

test.describe('Authenticated API Endpoints', () => {
  test('persons-of-interest API requires authentication', async ({ request }) => {
    const response = await request.get(API_ENDPOINT);
    expect(response.status()).toBe(401);
  });

  test('demo-login seeds a persistent admin user with a real password', async ({ request }) => {
    const demoEmail = 'demo@legal-ai.local';
    const demoPassword = 'password123';

    const seedResponse = await request.post('/api/auth/demo-login', {
      data: {
        email: demoEmail,
        role: 'admin',
      },
    });

    expect(seedResponse.status()).toBe(200);
    const seedBody = await seedResponse.json();
    expect(seedBody.success).toBe(true);
    expect(seedBody.user?.email).toBe(demoEmail);
    expect(seedBody.user?.role).toBe('admin');
    expect(seedBody.credentials?.password).toBe(demoPassword);

    const meAfterSeedResponse = await request.get('/api/auth/me');
    expect(meAfterSeedResponse.status()).toBe(200);
    const meAfterSeedBody = await meAfterSeedResponse.json();
    expect(meAfterSeedBody.user?.email).toBe(demoEmail);
    expect(meAfterSeedBody.user?.role).toBe('admin');

    const logoutResponse = await request.post('/api/auth/logout');
    expect(logoutResponse.status()).toBe(200);

    const manualLoginResponse = await request.post('/api/auth/login', {
      data: {
        email: demoEmail,
        password: demoPassword,
      },
    });

    expect(manualLoginResponse.status()).toBe(200);
    const manualLoginBody = await manualLoginResponse.json();
    expect(manualLoginBody.success).toBe(true);
    expect(manualLoginBody.user?.email).toBe(demoEmail);
    expect(manualLoginBody.user?.role).toBe('admin');
  });

  test('persons-of-interest API works with a real authenticated session', async ({ request }) => {
    const user = buildUser('persons-list');

    try {
      await registerUser(request, user);

      const response = await request.get(API_ENDPOINT);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    } finally {
      await cleanupAuthApiArtifacts(user.email);
    }
  });

  test('can create person of interest with authenticated case context', async ({ request }) => {
    const user = buildUser('persons-create');
    const personName = `Playwright Person ${Date.now()}`;

    try {
      await registerUser(request, user);
      const caseId = await createCase(request, `${TEST_CASE_PREFIX} Persons API ${Date.now()}`);

      const response = await request.post(API_ENDPOINT, {
        data: {
          caseId,
          name: personName,
          threatLevel: 'medium',
          status: 'active',
          aliases: ['Playwright Alias'],
          description: 'Auth API coverage for persons of interest creation.',
        },
      });

      expect(response.status()).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data?.name).toBe(personName);
    } finally {
      await cleanupAuthApiArtifacts(user.email, [personName]);
    }
  });

  test('can list persons of interest with filters after authenticated creation', async ({
    request,
  }) => {
    const user = buildUser('persons-filter');
    const personName = `Playwright Filtered Person ${Date.now()}`;

    try {
      await registerUser(request, user);
      const caseId = await createCase(request, `${TEST_CASE_PREFIX} Persons Filter ${Date.now()}`);

      const createResponse = await request.post(API_ENDPOINT, {
        data: {
          caseId,
          name: personName,
          threatLevel: 'medium',
          status: 'active',
          aliases: ['Playwright Filter Alias'],
          description: 'Auth API coverage for persons of interest filtering.',
        },
      });
      expect(createResponse.status()).toBe(201);

      const response = await request.get(`${API_ENDPOINT}?threatLevel=medium&limit=10`);
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.some((entry: { name?: string }) => entry.name === personName)).toBe(true);
    } finally {
      await cleanupAuthApiArtifacts(user.email, [personName]);
    }
  });
});
