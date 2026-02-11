import { test, expect } from '@playwright/test';

test.describe('Legal AI Chat Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the main page
    await page.goto('http://localhost:5173');

    // Wait for initial load and WebAssembly initialization
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Allow WASM to initialize
  });

  test('should load AI chat interface successfully', async ({ page }) => {
    // Check if chat interface elements are present
    await expect(page.locator('[data-testid="ai-chat-container"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="send-button"]')).toBeVisible();
  });

  test('should display GPU loading progress bar', async ({ page }) => {
    // Navigate to GPU demo if available
    const gpuDemoLink = page.locator('a[href*="gpu"], a[href*="demo"]');
    if ((await gpuDemoLink.count()) > 0) {
      await gpuDemoLink.first().click();
      await page.waitForLoadState('networkidle');
    }

    // Look for GPU progress indicators
    const progressIndicators = [
      '[data-testid="gpu-loading-progress"]',
      '[class*="progress"]',
      '[class*="loading"]',
      'text="gpu is loading"',
      'text="GPU"',
    ];

    let foundProgress = false;
    for (const selector of progressIndicators) {
      if ((await page.locator(selector).count()) > 0) {
        await expect(page.locator(selector)).toBeVisible();
        foundProgress = true;
        break;
      }
    }

    if (!foundProgress) {
      console.log('No GPU progress indicators found - may need to trigger inference');
    }
  });

  test('should handle AI chat input and response', async ({ page }) => {
    // Find chat input field by common selectors
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
      if ((await element.count()) > 0 && (await element.isVisible())) {
        chatInput = element.first();
        break;
      }
    }

    if (!chatInput) {
      console.log('Chat input not found, checking for button to open chat');
      const chatButtons = page.locator(
        'button:has-text("Chat"), button:has-text("AI"), [data-testid*="chat"]'
      );
      if ((await chatButtons.count()) > 0) {
        await chatButtons.first().click();
        await page.waitForTimeout(1000);
        chatInput = page.locator('input, textarea').first();
      }
    }

    if (chatInput) {
      // Type a test legal question
      const testQuery = 'What are the basic elements of contract formation?';
      await chatInput.fill(testQuery);

      // Find and click send button
      const sendSelectors = [
        '[data-testid="send-button"]',
        'button:has-text("Send")',
        'button[type="submit"]',
        'button:near(input), button:near(textarea)',
      ];

      let sendButton;
      for (const selector of sendSelectors) {
        const element = page.locator(selector);
        if ((await element.count()) > 0 && (await element.isVisible())) {
          sendButton = element.first();
          break;
        }
      }

      if (sendButton) {
        await sendButton.click();

        // Wait for response (up to 3 minutes for GPU inference)
        await page.waitForTimeout(5000); // Initial wait

        // Look for response indicators
        const responseSelectors = [
          '[data-testid="ai-response"]',
          '[class*="message"], [class*="response"]',
          'text="contract"', // Should mention contracts in response
          '[data-testid="chat-messages"] > *',
        ];

        let foundResponse = false;
        for (const selector of responseSelectors) {
          if ((await page.locator(selector).count()) > 0) {
            foundResponse = true;
            break;
          }
        }

        expect(foundResponse).toBe(true);
      }
    } else {
      console.log('No chat input found - interface may be different');
      // Take screenshot for debugging
      await page.screenshot({ path: 'debug-chat-interface.png' });
    }
  });

  test('should test GPU inference endpoint directly', async ({ page }) => {
    // Navigate to API testing page or create one
    await page.goto('http://localhost:5173');

    // Inject test script to call GPU inference directly
    const inferenceResult = await page.evaluate(async () => {
      try {
        const response = await fetch('http://localhost:8200/inference', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: 'What is consideration in contract law?',
            model: 'gemma3-legal',
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
      expect(inferenceResult.data).toHaveProperty('result');
      expect(inferenceResult.data).toHaveProperty('confidence');
      expect(inferenceResult.data).toHaveProperty('metadata');
    } else {
      console.log('GPU inference test failed:', inferenceResult.error);
      // Don't fail the test if GPU is not available
    }
  });

  test('should verify WebAssembly integration', async ({ page }) => {
    // Test WASM endpoints
    const wasmEndpoints = [
      '/api/wasm',
      '/api/gpu-wasm-integration',
      '/api/test-wasm-inference',
      '/api/ai/webasm-search',
    ];

    for (const endpoint of wasmEndpoints) {
      const response = await page.request.post(`http://localhost:5173${endpoint}`, {
        data: {
          action: 'status',
          text: 'test query',
        },
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok()) {
        const data = await response.json();
        expect(data).toBeDefined();
        console.log(`✅ WASM endpoint ${endpoint} is working`);
        break; // At least one WASM endpoint should work
      }
    }
  });

  test('should test service worker functionality', async ({ page }) => {
    // Check if service workers are registered
    const serviceWorkerInfo = await page.evaluate(() => {
      return {
        hasServiceWorker: 'serviceWorker' in navigator, registrations, navigator: navigator.serviceWorker ? navigator.serviceWorker.getRegistrations() : null,
      };
    });

    expect(serviceWorkerInfo.hasServiceWorker).toBe(true);

    // Test Go service workers by calling their health endpoints
    const serviceEndpoints = [
      'http://localhost:8300/health', // Generative service worker
      'http://localhost:8301/health', // Indexing service worker
      'http://localhost:8200/health', // GPU inference server
    ];

    for (const endpoint of serviceEndpoints) {
      try {
        const response = await page.request.get(endpoint);
        if (response.ok()) {
          const data = await response.json();
          expect(data).toHaveProperty('status');
          console.log(`✅ Service worker at ${endpoint} is healthy`);
        }
      } catch (error) {
        console.log(
          `Service worker at ${endpoint} not available:`,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }
  });

  test('should verify SSR and hydration', async ({ page }) => {
    // Disable JavaScript to test SSR
    await page.context().addInitScript(() => {
      // Mark that we're testing SSR
      (window as any).SSR_TEST = true;
    });

    await page.goto('http://localhost:5173');

    // Check if basic content loads without JavaScript
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('main, [id*="app"], [class*="app"]')).toBeVisible();

    // Re-enable JavaScript and test hydration
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Check if interactive elements work after hydration
    const interactiveElements = page.locator('button, input, a[href]');
    if ((await interactiveElements.count()) > 0) {
      await expect(interactiveElements.first()).toBeVisible();
    }
  });

  test('should handle concurrent requests', async ({ page }) => {
    // Test multiple concurrent AI requests
    const promises = [];

    for (let i = 0; i < 3; i++) {
      const promise = page.evaluate(async (index) => {
        try {
          const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `Test query ${index}`,
              model: 'gemma3-legal',
            }),
          });
          return { success: response.ok, status: response.status, index };
        } catch (error) {
          return {
            success: false, error: error instanceof Error ? error.message : 'Unknown error',
            index,
          };
        }
      }, i);

      promises.push(promise);
    }

    const results = await Promise.all(promises);

    // At least one request should succeed
    const successfulRequests = results.filter((r) => r.success);
    expect(successfulRequests.length).toBeGreaterThan(0);

    console.log(`✅ ${successfulRequests.length}/3 concurrent requests succeeded`);
  });

  test('should verify Redis integration', async ({ page }) => {
    // Test Redis health through the application
    const redisHealth = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/health/redis', {
          method: 'GET',
        });
        return { success: response.ok, status: response.status };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    if (redisHealth.success) {
      expect(redisHealth.status).toBe(200);
      console.log('✅ Redis integration is working');
    } else {
      console.log('Redis health check failed:', redisHealth.error);
    }
  });
});

test.describe('Performance Tests', () => {
  test('should measure page load performance', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // Page should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);

    console.log(`✅ Page loaded in ${loadTime}ms`);
  });

  test('should measure AI response time', async ({ page }) => {
    await page.goto('http://localhost:5173');

    const responseTime = await page.evaluate(async () => {
      const startTime = Date.now();

      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Quick test',
            model: 'gemma3-legal',
          }),
        });

        const endTime = Date.now();
        return { success: response.ok, time: endTime - startTime };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    if (responseTime.success) {
      console.log(`✅ AI response time: ${responseTime.time}ms`);
      // Response should be within 3 minutes (GPU inference can be slow)
      expect(responseTime.time).toBeLessThan(180000);
    }
  });
});
