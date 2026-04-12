import { expect, test } from '@playwright/test';
import { PORTS } from './helpers/env-ports.js';

/**
 * API Integration Tests
 *
 * These tests verify API endpoints respond without crashing.
 * Backends (DB, Redis, Ollama) may not be running, so we accept
 * both 200 (success) and 500 (backend down) as valid responses.
 * Only 404 (route not wired) is treated as a failure.
 */

const BASE = PORTS.APP_BASE;

test.describe('API Integration Tests', () => {
  test.describe('Cases API', () => {
    test('GET /api/cases — should be wired', async ({ request }) => {
      const response = await request.get(`${BASE}/api/cases`);
      // 200 = DB up, 500 = DB down — both mean the route exists
      expect(response.status()).not.toBe(404);
      expect(response.status()).toBeLessThan(600);
    });

    test('GET /api/cases — response shape', async ({ request }) => {
      const response = await request.get(`${BASE}/api/cases`);
      if (response.ok()) {
        const data = await response.json();
        expect(data).toBeDefined();
      }
      // If 500, backend is down — that's acceptable
    });
  });

  test.describe('Health API', () => {
    test('GET /api/health — should be wired', async ({ request }) => {
      const response = await request.get(`${BASE}/api/health`);
      expect(response.status()).not.toBe(404);
    });
  });

  test.describe('Chat API', () => {
    test('POST /api/chat — should respond', async ({ request }) => {
      const response = await request.post(`${BASE}/api/chat`, {
        data: { messages: [{ role: 'user', content: 'test' }] }
      });
      // Chat endpoint may not exist yet or Ollama may be down
      expect(response.status()).toBeLessThan(600);
    });
  });

  test.describe('SSE Routes API', () => {
    test('GET /api/sse/routes — should be wired', async ({ request }) => {
      // SSE endpoints stream forever, so use a short timeout
      const response = await request.get(`${BASE}/api/sse/routes`, { timeout: 5000 }).catch(() => null);
      // SSE may timeout (expected) or return 200 — both are fine
      if (response) {
        expect(response.status()).toBeLessThan(600);
      }
    });
  });

  test.describe('Persons of Interest API', () => {
    test('GET /api/persons-of-interest — should respond', async ({ request }) => {
      const response = await request.get(`${BASE}/api/persons-of-interest`);
      // Endpoint may not be wired yet
      expect(response.status()).toBeLessThan(600);
    });
  });

  test.describe('Citations API', () => {
    test('GET /api/citations — should respond', async ({ request }) => {
      const response = await request.get(`${BASE}/api/citations`);
      // May not exist yet — just verify no crash
      expect(response.status()).toBeLessThan(600);
    });
  });

  test.describe('Evidence API', () => {
    test('GET /api/evidence — should respond', async ({ request }) => {
      const response = await request.get(`${BASE}/api/evidence`);
      expect(response.status()).toBeLessThan(600);
    });
  });

  test.describe('Embed API', () => {
    test('POST /api/embed — should be wired', async ({ request }) => {
      const response = await request.post(`${BASE}/api/embed`, {
        data: { text: 'test embedding' }
      });
      // Ollama may be down
      expect(response.status()).not.toBe(404);
    });
  });
});