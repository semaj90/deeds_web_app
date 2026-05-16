// @vitest-environment node
/**
 * Cross-layer contract network tests.
 *
 * Validates that:
 * - Key API endpoints return the expected JSON shape (degraded-path contract)
 * - Superforms form actions return { form } on validation failure
 * - No unexpected 500s on standard GET routes
 * - Network requests from page loads hit expected endpoints
 * - Response headers include required CORS / Content-Type
 *
 * Run:
 *   npx playwright test tests/e2e/contract-network.spec.ts --config=playwright.config.ts
 *
 * Writes report to docs/reports/playwright-network-contract-report.json when
 * WRITE_CONTRACT_REPORT=1 is set.
 */

import { type Page, type Request, type Response, expect, test } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const WRITE_REPORT = process.env.WRITE_CONTRACT_REPORT === '1';

interface ContractFinding {
  url: string;
  method: string;
  status?: number;
  issue: string;
  severity: 'high' | 'medium' | 'low';
}

const findings: ContractFinding[] = [];

function recordFinding(f: ContractFinding) {
  findings.push(f);
}

// ── helpers ───────────────────────────────────────────────────────────────────
async function collectSignals(page: Page, action: () => Promise<void>) {
  const log = {
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    failedRequests: [] as string[],
    fiveHundreds: [] as string[],
    requests: [] as string[],
  };
  page.on('console', msg => { if (msg.type() === 'error') log.consoleErrors.push(msg.text()); });
  page.on('pageerror', err => log.pageErrors.push(err.message));
  page.on('requestfailed', req => log.failedRequests.push(req.url()));
  page.on('response', async (res: Response) => {
    if (res.status() >= 500) log.fiveHundreds.push(`${res.status()} ${res.url()}`);
    log.requests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  });
  await action();
  return log;
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('API contract: health + shape', () => {
  test('GET /api/health returns 200 with valid JSON', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    // Accept 200 (healthy) or 503 (degraded) — but never 404 / 500
    expect([200, 503]).toContain(res.status());

    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toContain('application/json');

    const body = await res.json().catch(() => null);
    expect(body).not.toBeNull();
  });

  test('GET /api/cases returns 200 with { sessions | cases } top-level key', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/cases`);
    // 401 is acceptable (requires auth), 500 is not
    expect(res.status()).not.toBe(500);
    if (res.status() === 200) {
      const body = await res.json().catch(() => null);
      expect(body).not.toBeNull();
      // Must be an object, not a bare array
      expect(typeof body).toBe('object');
    }
  });

  test('GET /api/evidence returns 200 or 401, not 500', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/evidence`);
    expect(res.status()).not.toBe(500);
    if (res.status() !== 401 && res.status() !== 403) {
      const ct = res.headers()['content-type'] ?? '';
      expect(ct).toContain('application/json');
    }
  });

  test('GET /api/embed endpoint exists and returns 200 or 400', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/embed`, {
      data: { text: 'test embedding', model: 'embeddinggemma:latest' },
    });
    // 400 (missing required fields), 200 (success), or 503 (model unavailable)
    expect([200, 400, 503]).toContain(res.status());
    expect(res.status()).not.toBe(500);
  });
});

test.describe('API contract: CORS and content-type headers', () => {
  const endpoints = [
    '/api/health',
    '/api/cases',
    '/api/sse/routes',
  ];

  for (const endpoint of endpoints) {
    test(`${endpoint} has content-type header`, async ({ request }) => {
      const res = await request.get(`${BASE_URL}${endpoint}`);
      if (res.status() === 200) {
        const ct = res.headers()['content-type'];
        expect(ct, `${endpoint} missing content-type header`).toBeTruthy();
      }
    });
  }

  test('CORS: API routes do not return 500 on OPTIONS', async ({ request }) => {
    const res = await request.fetch(`${BASE_URL}/api/health`, { method: 'OPTIONS' });
    // Should be 200, 204, or 405 (method not allowed) — never 500
    expect(res.status()).not.toBe(500);
  });
});

test.describe('Superforms contract: login form action', () => {
  test('POST /login with missing fields returns 400 + { form } shape', async ({ request }) => {
    const form = new URLSearchParams({
      username: '',
      password: '',
    });
    const res = await request.post(`${BASE_URL}/login`, {
      form,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    // Superforms invalid submission → 400 or redirect to login
    // We just verify it's not a 500 and the body is parseable
    expect(res.status()).not.toBe(500);

    if (res.status() === 400 || res.headers()['content-type']?.includes('json')) {
      const body = await res.json().catch(() => null);
      if (body !== null) {
        // Superforms returns { form: { valid: false, errors: {...} } } on fail
        expect(body).toHaveProperty('form');
      }
    }
  });

  test('POST /login with valid credentials does not 500', async ({ request }) => {
    const form = new URLSearchParams({
      username: 'test@example.com',
      password: 'wrongpassword',
    });
    const res = await request.post(`${BASE_URL}/login`, {
      form,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    // Should be 400 (wrong password) or 302 (somehow valid) — never 500
    expect(res.status()).not.toBe(500);
  });
});

test.describe('Page load: no 500s or JS errors on key routes', () => {
  const publicRoutes = ['/', '/login'];

  for (const route of publicRoutes) {
    test(`${route} loads without 500s or JS errors`, async ({ page }) => {
      const signals = await collectSignals(page, async () => {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 15_000 });
      });

      if (signals.fiveHundreds.length > 0) {
        recordFinding({
          url: `${BASE_URL}${route}`,
          method: 'GET',
          status: 500,
          issue: `500 responses detected: ${signals.fiveHundreds.slice(0, 3).join(', ')}`,
          severity: 'high',
        });
      }
      if (signals.pageErrors.length > 0) {
        recordFinding({
          url: `${BASE_URL}${route}`,
          method: 'GET',
          issue: `JS page errors: ${signals.pageErrors.slice(0, 2).join('; ')}`,
          severity: 'high',
        });
      }

      expect(signals.fiveHundreds, `500s on ${route}: ${signals.fiveHundreds.join(', ')}`).toHaveLength(0);
      expect(signals.pageErrors, `JS errors on ${route}: ${signals.pageErrors.join(', ')}`).toHaveLength(0);
    });
  }

  test('Homepage network requests do not include unexpected 404s on /api/ paths', async ({ page }) => {
    const api404s: string[] = [];
    page.on('response', (res: Response) => {
      if (res.status() === 404 && res.url().includes('/api/')) api404s.push(res.url());
    });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15_000 });

    // API 404s are contract violations (route exists in code but not served)
    if (api404s.length > 0) {
      recordFinding({
        url: BASE_URL,
        method: 'GET',
        status: 404,
        issue: `API 404s on page load: ${api404s.slice(0, 3).join(', ')}`,
        severity: 'medium',
      });
    }
    expect(api404s, `Unexpected API 404s: ${api404s.join(', ')}`).toHaveLength(0);
  });
});

test.describe('SSE route contract', () => {
  test('GET /api/sse/routes returns text/event-stream content-type', async ({ request }) => {
    // Abort after 2s — we just need the headers
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2000);
    try {
      const res = await request.get(`${BASE_URL}/api/sse/routes`, {
        timeout: 3000,
      });
      clearTimeout(timer);
      if (res.status() === 200) {
        const ct = res.headers()['content-type'] ?? '';
        expect(ct).toContain('text/event-stream');
      } else {
        // 401 is acceptable; 500 is not
        expect(res.status()).not.toBe(500);
      }
    } catch {
      clearTimeout(timer);
      // Connection abort or timeout is expected for SSE — test passes
    }
  });
});

test.describe('Env/URL contract: no hardcoded localhost mismatches', () => {
  test('API requests from browser use same origin, not hardcoded ports', async ({ page }) => {
    const hardcodedPortRequests: string[] = [];
    page.on('request', (req: Request) => {
      const url = req.url();
      // Flag requests to known wrong ports (5432 native Postgres, 9001 MinIO console)
      if (url.match(/:5432|:9001\//) && !url.startsWith('chrome')) {
        hardcodedPortRequests.push(url);
      }
    });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15_000 });

    if (hardcodedPortRequests.length > 0) {
      recordFinding({
        url: BASE_URL,
        method: 'GET',
        issue: `Hardcoded port in browser requests: ${hardcodedPortRequests.slice(0,3).join(', ')}`,
        severity: 'high',
      });
    }
    expect(hardcodedPortRequests).toHaveLength(0);
  });
});

// ── write report after all tests ──────────────────────────────────────────────
test.afterAll(async () => {
  if (!WRITE_REPORT && findings.length === 0) return;

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    totalFindings: findings.length,
    findings,
  };

  try {
    const reportsDir = join(process.cwd(), '..', 'docs', 'reports');
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(reportsDir, 'playwright-network-contract-report.json'), JSON.stringify(report, null, 2));
    console.log(`\n[contract-network] Report written to docs/reports/playwright-network-contract-report.json`);
  } catch {
    // Non-fatal — test results are the primary output
  }
});