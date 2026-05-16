/**
 * Phase 97: SSE Streaming + RabbitMQ + Database Integration Tests
 * Tests the complete chat streaming pipeline
 */

import { expect, test } from '@playwright/test';
import { PORTS } from './helpers/env-ports.js';
const BASE_URL = PORTS.APP_BASE;
const BASE_PORT = Number(new URL(BASE_URL).port);

test.beforeAll(async () => {
  console.log(`📡 Using dev server on port ${BASE_PORT}`);
});

test.describe('Phase 97: Streaming Chat API', () => {
  test('should stream AI responses via SSE', async ({ page }) => {
    // Navigate to chat page (if exists) or test API directly
    const apiUrl = `${BASE_URL}/api/chat/stream?q=What is a legal contract?&mode=rag`;

    const response = await page.request.get(apiUrl);

    // Verify SSE headers
    expect(response.headers()['content-type']).toContain('text/event-stream');
    expect(response.headers()['cache-control']).toBe('no-cache');

    // Collect stream chunks
    const chunks: string[] = [];
    const body = await response.body();
    const text = body.toString();

    // Parse SSE messages
    const messages = text.split('\n\n').filter(m => m.startsWith('data: '));
    expect(messages.length).toBeGreaterThan(0);

    // Verify chunk structure
    const firstChunk = JSON.parse(messages[0].replace('data: ', ''));
    expect(firstChunk).toHaveProperty('type');
    // Server sends: start, token, complete
    expect(['start', 'token', 'complete']).toContain(firstChunk.type);
  });

  test('should save messages to database', async ({ page }) => {
    // This would require authentication
    // Skipping for now - add after auth setup
    test.skip();
  });

  test('should handle RAG mode streaming', async ({ page }) => {
    const response = await page.request.get(
      `${BASE_URL}/api/chat/stream?q=test&mode=rag`
    );

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/event-stream');
  });

  test('should handle Ollama mode streaming', async ({ page }) => {
    const response = await page.request.get(
      `${BASE_URL}/api/chat/stream?q=test&mode=ollama`
    );

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/event-stream');
  });

  test('should reject requests without query parameter', async ({ page }) => {
    const response = await page.request.get(
      `${BASE_URL}/api/chat/stream`
    );

    // Auth guard returns 401, or endpoint returns 400 when query param missing
    expect([400, 401]).toContain(response.status());
  });
});

test.describe('Phase 97: Chat Session Management', () => {
  test('should create chat sessions', async ({ page }) => {
    // Placeholder for session creation tests
    // Requires auth implementation
    test.skip();
  });

  test('should retrieve chat history', async ({ page }) => {
    // Placeholder for history retrieval tests
    test.skip();
  });
});
