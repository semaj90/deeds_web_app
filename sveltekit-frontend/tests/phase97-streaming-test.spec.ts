/**
 * Phase 97: SSE Streaming + RabbitMQ + Database Integration Tests
 * Tests the complete chat streaming pipeline
 */

import { expect, test } from '@playwright/test';

/**
 * Dynamically find the active dev server port in range 5173-5180
 * Uses multiple detection methods for robustness
 */
async function findActivePort(): Promise<number> {
  const portRange = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180];

  // Method 1: Check Vite-specific endpoint
  for (const port of portRange) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/@vite/client`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok || response.status === 404) {
        console.log(`✅ Found Vite dev server on port ${port} (via @vite/client)`);
        return port;
      }
    } catch (error) {
      // Try next port
    }
  }

  // Method 2: Check SvelteKit root route
  for (const port of portRange) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok || response.status === 404 || response.status === 500) {
        console.log(`✅ Found dev server on port ${port} (via HEAD /)`);
        return port;
      }
    } catch (error) {
      // Try next port
    }
  }

  // Method 3: Try API endpoint directly
  for (const port of portRange) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/chat/stream?q=test&mode=rag`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      // Even if it errors, if we get a response the server is running
      console.log(`✅ Found dev server on port ${port} (via API endpoint)`);
      return port;
    } catch (error) {
      // Try next port
    }
  }

  throw new Error(
    `❌ No active dev server found in port range 5173-5180.\n` +
    `   Please start the dev server with: npm run dev\n` +
    `   Checked ports: ${portRange.join(', ')}`
  );
}

let BASE_PORT: number;

test.beforeAll(async () => {
  BASE_PORT = await findActivePort();
  console.log(`📡 Using dev server on port ${BASE_PORT}`);
});

test.describe('Phase 97: Streaming Chat API', () => {
  test('should stream AI responses via SSE', async ({ page }) => {
    // Navigate to chat page (if exists) or test API directly
    const apiUrl = `http://127.0.0.1:${BASE_PORT}/api/chat/stream?q=What is a legal contract?&mode=rag`;

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
      `http://127.0.0.1:${BASE_PORT}/api/chat/stream?q=test&mode=rag`
    );

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/event-stream');
  });

  test('should handle Ollama mode streaming', async ({ page }) => {
    const response = await page.request.get(
      `http://127.0.0.1:${BASE_PORT}/api/chat/stream?q=test&mode=ollama`
    );

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/event-stream');
  });

  test('should reject requests without query parameter', async ({ page }) => {
    const response = await page.request.get(
      `http://127.0.0.1:${BASE_PORT}/api/chat/stream`
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
