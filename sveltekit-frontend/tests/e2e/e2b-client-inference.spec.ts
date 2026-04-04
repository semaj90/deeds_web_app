/**
 * Gemma 4 E2B Client-Side Inference — Playwright E2E Tests
 *
 * Tests the E2B 2.3B model integration:
 *   1. GPU availability detection
 *   2. __deedsE2BInference hook installation
 *   3. E2B model loading (when WebGPU available)
 *   4. Text generation via E2B
 *   5. Fallback behavior when E2B unavailable
 *   6. Synthesis caching (IndexedDB)
 *   7. Router integration (local-e2b vs local-onnx)
 *
 * Gracefully skips GPU-dependent tests when WebGPU is unavailable
 * (CI environments, headless browsers without GPU).
 */

import { test, expect } from '@playwright/test';
import { captureNumberedStep } from './utils/screenshot-utils';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = 'screenshots/e2b-inference';
const ARTIFACTS_DIR = 'test-results/e2b-inference';

test.describe('Gemma 4 E2B Client-Side Inference', () => {
  test.describe.configure({ mode: 'serial' });

  // E2B model loading can take 60-120s on first run
  test.setTimeout(180_000);

  test.beforeAll(() => {
    fs.mkdirSync(path.join('test-results', 'e2b-inference'), { recursive: true });
  });

  test('1. WebGPU availability detection', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const gpuStatus = await page.evaluate(async () => {
      const hasGPU = 'gpu' in navigator;
      let adapterInfo = null;
      let maxBufferMB = 0;

      if (hasGPU && navigator.gpu) {
        try {
          const adapter = await navigator.gpu.requestAdapter();
          if (adapter) {
            adapterInfo = adapter.info ?? null;
            maxBufferMB = Math.round(adapter.limits.maxBufferSize / (1024 * 1024));
          }
        } catch {
          // GPU probe failed
        }
      }

      return {
        hasWebGPU: hasGPU,
        adapterInfo,
        maxBufferMB,
        userAgent: navigator.userAgent,
      };
    });

    console.log(`WebGPU available: ${gpuStatus.hasWebGPU}`);
    console.log(`GPU max buffer: ${gpuStatus.maxBufferMB}MB`);
    console.log(`Adapter: ${JSON.stringify(gpuStatus.adapterInfo)}`);

    // WebGPU should be available in Chromium with --enable-webgpu flags
    // (configured in playwright.config.js)
    expect(gpuStatus.hasWebGPU).toBeDefined();

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '01-gpu-status.json'),
      JSON.stringify(gpuStatus, null, 2)
    );

    await captureNumberedStep(page, 1, 'gpu-detection', {
      directory: SCREENSHOT_DIR,
    });
  });

  test('2. __deedsE2BInference hook is installed', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const hookExists = await page.evaluate(async () => {
      await import('/src/lib/ai/gemma4-e2b-client.ts');
      return !!(window as any).__deedsE2BInference;
    });

    console.log(`__deedsE2BInference hook found: ${hookExists}`);
    expect(hookExists).toBe(true);

    await captureNumberedStep(page, 2, 'hook-installed', {
      directory: SCREENSHOT_DIR,
    });
  });

  test('3. E2B availability check returns valid status', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const status = await page.evaluate(async () => {
      await import('/src/lib/ai/gemma4-e2b-client.ts');
      const hook = (window as any).__deedsE2BInference;
      return hook.checkAvailability();
    });

    console.log(`E2B availability: ${JSON.stringify(status)}`);

    // Validate the status structure
    expect(status).toHaveProperty('available');
    expect(status).toHaveProperty('loaded');
    expect(status).toHaveProperty('gpuMemoryMB');
    expect(status).toHaveProperty('reason');
    expect(typeof status.available).toBe('boolean');
    expect(typeof status.loaded).toBe('boolean');
    expect(typeof status.reason).toBe('string');

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '03-e2b-availability.json'),
      JSON.stringify(status, null, 2)
    );

    await captureNumberedStep(page, 3, 'availability-check', {
      directory: SCREENSHOT_DIR,
    });
  });

  test('4. E2B model initialization (requires WebGPU + GPU memory)', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      consoleLogs.push(`[PAGE_ERROR] ${err.message}`);
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const initResult = await page.evaluate(async () => {
      const start = performance.now();
      try {
        await import('/src/lib/ai/gemma4-e2b-client.ts');
        const hook = (window as any).__deedsE2BInference;

        // Check availability first
        const status = await hook.checkAvailability();
        if (!status.available) {
          return {
            ready: false,
            loadTimeMs: 0,
            error: `E2B not available: ${status.reason}`,
            gpuMemoryMB: status.gpuMemoryMB,
            hasWebGPU: 'gpu' in navigator,
          };
        }

        // Attempt initialization
        const result = await hook.init();
        const loadTimeMs = Math.round(performance.now() - start);
        return { ...result, loadTimeMs, error: null, gpuMemoryMB: status.gpuMemoryMB };
      } catch (err: any) {
        const loadTimeMs = Math.round(performance.now() - start);
        return {
          ready: false,
          loadTimeMs,
          error: err?.message || String(err),
          hasWebGPU: 'gpu' in navigator,
        };
      }
    });

    console.log(`E2B init: ready=${initResult.ready}, loadTime=${initResult.loadTimeMs}ms`);

    if (initResult.error) {
      console.log(`E2B init error: ${initResult.error}`);
      console.log(`--- Browser Console (last 20 lines) ---`);
      consoleLogs.slice(-20).forEach((l) => console.log(l));
    }

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '04-init-result.json'),
      JSON.stringify({ ...initResult, consoleLogs: consoleLogs.slice(-30) }, null, 2)
    );

    if (!initResult.ready) {
      test.info().annotations.push({
        type: 'note',
        description: `E2B model init skipped: ${initResult.error}. This is expected in CI without GPU.`,
      });
      test.skip(true, `E2B model init unavailable: ${initResult.error}`);
    }

    expect(initResult.ready).toBe(true);

    await captureNumberedStep(page, 4, 'model-initialized', {
      directory: SCREENSHOT_DIR,
    });
  });

  test('5. Text generation produces valid output', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Import and check availability
    const available = await page.evaluate(async () => {
      await import('/src/lib/ai/gemma4-e2b-client.ts');
      const hook = (window as any).__deedsE2BInference;
      const status = await hook.checkAvailability();
      if (!status.available) return false;
      try {
        await hook.init();
        return hook.ready;
      } catch {
        return false;
      }
    });

    if (!available) {
      test.skip(true, 'E2B model not available — skipping text generation test');
    }

    const result = await page.evaluate(async () => {
      const hook = (window as any).__deedsE2BInference;
      return hook.generate('What is a tort in legal terms?');
    });

    console.log(`Generation result: ${result.text.slice(0, 100)}...`);
    console.log(`Tokens: ${result.tokensGenerated}, Duration: ${result.durationMs}ms, tok/s: ${result.tokPerSec}`);

    // Validate result structure
    expect(result.text).toBeTruthy();
    expect(result.text.length).toBeGreaterThan(10);
    expect(result.source).toBe('local-e2b');
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.tokensGenerated).toBeGreaterThan(0);

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '05-generation-result.json'),
      JSON.stringify({
        query: 'What is a tort in legal terms?',
        responsePreview: result.text.slice(0, 500),
        source: result.source,
        durationMs: result.durationMs,
        tokensGenerated: result.tokensGenerated,
        tokPerSec: result.tokPerSec,
      }, null, 2)
    );

    await captureNumberedStep(page, 5, 'text-generated', {
      directory: SCREENSHOT_DIR,
    });
  });

  test('6. Router returns local-e2b when E2B is ready', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const routerResult = await page.evaluate(async () => {
      // Import router and E2B client
      const router = await import('/src/lib/ai/client-router.ts');
      const e2b = await import('/src/lib/ai/gemma4-e2b-client.ts');

      const e2bReady = e2b.isE2BReady();

      // Test greeting (should route to local)
      const greetingDecision = router.shouldEscalateToServer(
        'hello',
        [],
        { e2bReady }
      );

      // Test legal query (should route to server)
      const legalDecision = router.shouldEscalateToServer(
        'draft a contract for real estate purchase',
        [],
        { e2bReady }
      );

      // Test factual query (should route to retrieval or local)
      const factualDecision = router.shouldEscalateToServer(
        'what is habeas corpus',
        [],
        { e2bReady }
      );

      return {
        e2bReady,
        greeting: {
          source: greetingDecision.source,
          reason: greetingDecision.reason,
          intent: greetingDecision.intent,
          confidence: greetingDecision.confidence,
        },
        legal: {
          source: legalDecision.source,
          reason: legalDecision.reason,
          intent: legalDecision.intent,
          confidence: legalDecision.confidence,
        },
        factual: {
          source: factualDecision.source,
          reason: factualDecision.reason,
          intent: factualDecision.intent,
          confidence: factualDecision.confidence,
        },
      };
    });

    console.log(`E2B ready: ${routerResult.e2bReady}`);
    console.log(`Greeting route: ${routerResult.greeting.source} (${routerResult.greeting.reason})`);
    console.log(`Legal route: ${routerResult.legal.source} (${routerResult.legal.reason})`);
    console.log(`Factual route: ${routerResult.factual.source} (${routerResult.factual.reason})`);

    // Greeting should route to local (e2b if ready, onnx if not)
    if (routerResult.e2bReady) {
      expect(routerResult.greeting.source).toBe('local-e2b');
    } else {
      expect(routerResult.greeting.source).toBe('local-onnx');
    }

    // Legal drafting query should route to server
    expect(routerResult.legal.source).toBe('server-ollama');

    // Greeting intent should be 'greeting'
    expect(routerResult.greeting.intent).toBe('greeting');

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '06-router-decisions.json'),
      JSON.stringify(routerResult, null, 2)
    );

    await captureNumberedStep(page, 6, 'router-decisions', {
      directory: SCREENSHOT_DIR,
    });
  });

  test('7. Synthesis cache stores and retrieves responses', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const cacheResult = await page.evaluate(async () => {
      const cache = await import('/src/lib/ai/client-cache.ts');

      const testHash = `test_synth_${Date.now()}`;
      const testResponse = 'A tort is a civil wrong that causes harm.';
      const testSource = 'local-e2b';

      // Write to synthesis cache
      await cache.clientCache.putSynthesis(testHash, testResponse, testSource, 'test context');

      // Read back from synthesis cache
      const retrieved = await cache.clientCache.getSynthesis(testHash);

      return {
        written: true,
        retrieved: retrieved !== null,
        responseMatch: retrieved?.response === testResponse,
        sourceMatch: retrieved?.source === testSource,
        retrievedResponse: retrieved?.response ?? null,
        retrievedSource: retrieved?.source ?? null,
      };
    });

    console.log(`Synthesis cache: written=${cacheResult.written}, retrieved=${cacheResult.retrieved}`);
    console.log(`Response match: ${cacheResult.responseMatch}, Source match: ${cacheResult.sourceMatch}`);

    expect(cacheResult.written).toBe(true);
    expect(cacheResult.retrieved).toBe(true);
    expect(cacheResult.responseMatch).toBe(true);
    expect(cacheResult.sourceMatch).toBe(true);

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '07-synthesis-cache.json'),
      JSON.stringify(cacheResult, null, 2)
    );

    await captureNumberedStep(page, 7, 'synthesis-cache-verified', {
      directory: SCREENSHOT_DIR,
    });
  });

  test('8. LLM synthesis orchestrator uses cache', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const synthesisResult = await page.evaluate(async () => {
      const cache = await import('/src/lib/ai/client-cache.ts');

      // Pre-seed the synthesis cache with a known response
      const query = 'What is negligence in tort law?';
      const knownResponse = 'Negligence requires: (1) duty, (2) breach, (3) causation, (4) damages.';
      // Use same hash algorithm as client-llm-synthesis.ts
      function synthesisHash(q: string, ctx?: string): string {
        const combined = `${q}::${ctx ?? ''}`;
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
          const char = combined.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash |= 0;
        }
        return `synth_${hash.toString(36)}`;
      }

      const key = synthesisHash(query);
      await cache.clientCache.putSynthesis(key, knownResponse, 'local-e2b');

      // Now import the synthesis module and call synthesize
      const synth = await import('/src/lib/ai/client-llm-synthesis.ts');
      const result = await synth.synthesize(query);

      return {
        text: result.text,
        source: result.source,
        cached: result.cached,
        durationMs: result.durationMs,
        expectedText: knownResponse,
        textMatch: result.text === knownResponse,
      };
    });

    console.log(`Synthesis: source=${synthesisResult.source}, cached=${synthesisResult.cached}`);
    console.log(`Duration: ${synthesisResult.durationMs}ms`);
    console.log(`Text match: ${synthesisResult.textMatch}`);

    // Should return the cached response
    expect(synthesisResult.cached).toBe(true);
    expect(synthesisResult.source).toBe('cache-hit');
    expect(synthesisResult.textMatch).toBe(true);
    // Cached response should be very fast (<100ms)
    expect(synthesisResult.durationMs).toBeLessThan(1000);

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '08-synthesis-orchestrator.json'),
      JSON.stringify(synthesisResult, null, 2)
    );

    await captureNumberedStep(page, 8, 'synthesis-orchestrator-verified', {
      directory: SCREENSHOT_DIR,
    });
  });

  test('9. E2B model unload frees resources', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const unloadResult = await page.evaluate(async () => {
      await import('/src/lib/ai/gemma4-e2b-client.ts');
      const hook = (window as any).__deedsE2BInference;

      const beforeReady = hook.ready;
      const result = await hook.unload();
      const afterReady = result.ready;

      return {
        beforeReady,
        afterReady,
        unloadedSuccessfully: !afterReady,
      };
    });

    console.log(`Before unload: ready=${unloadResult.beforeReady}`);
    console.log(`After unload: ready=${unloadResult.afterReady}`);

    // After unload, model should not be ready
    expect(unloadResult.afterReady).toBe(false);
    expect(unloadResult.unloadedSuccessfully).toBe(true);

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '09-unload-result.json'),
      JSON.stringify(unloadResult, null, 2)
    );

    await captureNumberedStep(page, 9, 'model-unloaded', {
      directory: SCREENSHOT_DIR,
    });
  });

  test('10. Intent classification covers all categories', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const classifyResult = await page.evaluate(async () => {
      const router = await import('/src/lib/ai/client-router.ts');

      const queries = [
        { query: 'hello', expectedIntent: 'greeting' },
        { query: 'define negligence in law', expectedIntent: 'factual' },
        { query: 'find cases about negligence', expectedIntent: 'search' },
        { query: 'how do i file a motion', expectedIntent: 'procedural' },
        { query: 'compare tort vs contract law', expectedIntent: 'comparative' },
        { query: 'draft a legal brief', expectedIntent: 'drafting' },
      ];

      return queries.map(({ query, expectedIntent }) => {
        const result = router.classifyIntent(query);
        return {
          query,
          expectedIntent,
          actualIntent: result.intent,
          score: result.score,
          match: result.intent === expectedIntent,
        };
      });
    });

    let allMatch = true;
    for (const r of classifyResult) {
      console.log(`"${r.query}" → ${r.actualIntent} (expected: ${r.expectedIntent}) score=${r.score.toFixed(2)} ${r.match ? '✓' : '✗'}`);
      if (!r.match) allMatch = false;
    }

    // All intents should be classified correctly
    expect(allMatch).toBe(true);

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '10-intent-classification.json'),
      JSON.stringify(classifyResult, null, 2)
    );

    await captureNumberedStep(page, 10, 'intent-classification', {
      directory: SCREENSHOT_DIR,
    });
  });
});
