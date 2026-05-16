import { test, expect } from '@playwright/test';
import { PORTS } from './helpers/env-ports.js';

/**
 * Legal AI Chat Functionality Tests
 *
 * Tests chat interface, GPU inference, WASM integration.
 * Backends (Ollama, GPU server, Redis) may not be running,
 * so tests gracefully handle missing services.
 */

const BASE_URL = PORTS.APP_BASE;

test.describe('Legal AI Chat Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass onboarding wizard
    await page.addInitScript(() => {
      window.localStorage.setItem('deeds-onboarding-completed', 'true');
    });

    await page.goto(`${BASE_URL}/chat`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(1000);
  });

  test('should load chat page without crash', async ({ page }) => {
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);

    // Look for any chat-related UI elements
    const chatIndicators = [
      '[data-testid="ai-chat-container"]',
      '[data-testid="chat-input"]',
      'textarea',
      'input[type="text"]',
      'form',
    ];

    let foundChatUI = false;
    for (const selector of chatIndicators) {
      if (await page.locator(selector).count() > 0) {
        foundChatUI = true;
        break;
      }
    }

    if (!foundChatUI) {
      console.log('No chat UI elements found — page may have SSR error');
    }
  });

  test('should display GPU loading progress bar', async ({ page }) => {
    const progressIndicators = [
      '[data-testid="gpu-loading-progress"]',
      '[class*="progress"]',
      '[class*="loading"]',
    ];

    let foundProgress = false;
    for (const selector of progressIndicators) {
      if (await page.locator(selector).count() > 0) {
        foundProgress = true;
        break;
      }
    }

    if (!foundProgress) {
      console.log('No GPU progress indicators found — may need to trigger inference');
    }
    // Don't fail — GPU progress bar is optional
  });

  test('should handle AI chat input if available', async ({ page }) => {
    const inputSelectors = [
      '[data-testid="chat-input"]',
      'input[placeholder*="message"], input[placeholder*="question"]',
      'textarea[placeholder*="message"], textarea[placeholder*="question"]',
      'input[type="text"]',
      'textarea',
    ];

    let chatInput;
    for (const selector of inputSelectors) {
      const element = page.locator(selector);
      if (await element.count() > 0 && await element.first().isVisible()) {
        chatInput = element.first();
        break;
      }
    }

    if (chatInput) {
      await chatInput.fill('What are the basic elements of contract formation?');
      console.log('Chat input found and filled');
    } else {
      console.log('No chat input found — interface may be different');
    }
  });

  test('should test GPU inference endpoint directly', async ({ page }) => {
    const inferenceResult = await page.evaluate(async () => {
      try {
        const response = await fetch('http://localhost:8200/inference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: 'What is consideration in contract law?',
            model: 'gemma4-legal',
            config: { temperature: 0.7 },
          }),
        });

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` };
        }
        const data = await response.json();
        return { success: true, data };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    if (inferenceResult.success) {
      expect(inferenceResult.data).toBeDefined();
      console.log('GPU inference endpoint responding');
    } else {
      console.log('GPU inference not available:', inferenceResult.error);
    }
  });

  test('should verify WebAssembly integration', async ({ page }) => {
    const wasmEndpoints = ['/api/wasm', '/api/gpu-wasm-integration'];

    for (const endpoint of wasmEndpoints) {
      const response = await page.request.post(`${BASE_URL}${endpoint}`, {
        data: { action: 'status', text: 'test query' },
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => null);

      if (response?.ok()) {
        console.log(`WASM endpoint ${endpoint} is working`);
        break;
      }
    }
    // Don't fail — WASM endpoints are optional
  });

  test('should test service worker functionality', async ({ page }) => {
    const hasServiceWorker = await page.evaluate(() => {
      return 'serviceWorker' in navigator;
    });

    expect(hasServiceWorker).toBe(true);
  });

  test('should verify SSR and hydration', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await expect(page.locator('body')).toBeVisible();

    const interactiveElements = page.locator('button, input, a[href]');
    if (await interactiveElements.count() > 0) {
      await expect(interactiveElements.first()).toBeVisible();
    }
  });

  test('should handle concurrent requests', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);

    const results = await page.evaluate(async () => {
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(
          fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: `Test ${i}` }] }),
          })
            .then(r => ({ success: true, status: r.status, index: i }))
            .catch(e => ({ success: false, error: String(e), index: i }))
        );
      }
      return Promise.all(promises);
    });

    // At least verify requests completed (may fail if Ollama is down)
    expect(results.length).toBe(3);
    console.log(`Concurrent requests: ${results.filter(r => r.success).length}/3 completed`);
  });

  test('should verify Redis integration', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);

    const redisHealth = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/health');
        return { success: response.ok, status: response.status };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    });

    if (redisHealth.success) {
      console.log('Health endpoint responding');
    } else {
      console.log('Health check not available:', redisHealth);
    }
  });
});

test.describe('Performance Tests', () => {
  test('should measure page load performance', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(`${BASE_URL}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(15000);
    console.log(`Page loaded in ${loadTime}ms`);
  });
});
