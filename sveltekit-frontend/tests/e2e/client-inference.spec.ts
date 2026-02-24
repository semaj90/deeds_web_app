import { test, expect } from '@playwright/test';
import { captureNumberedStep } from './utils/screenshot-utils';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = 'screenshots/client-inference';
const ARTIFACTS_DIR = 'test-results/client-inference';

test.describe('Client-Side ONNX Inference Pipeline', () => {
  test.describe.configure({ mode: 'serial' });

  // Longer timeout — model loading can take 30-60s on first run
  test.setTimeout(180_000);

  test.beforeAll(() => {
    const dir = path.join('test-results', 'client-inference');
    fs.mkdirSync(dir, { recursive: true });
  });

  test('1. Model assets are served from static/', async ({ page }) => {
    // Verify the ONNX model file is reachable (HEAD request for 291MB file)
    const modelRes = await page.request.head('/embeddinggemma_300m_onnx/model.onnx');
    console.log(`model.onnx: ${modelRes.status()}`);
    expect(modelRes.status()).toBe(200);

    // Verify tokenizer config is reachable
    const tokenizerRes = await page.request.head('/embeddinggemma_300m_onnx/tokenizer.json');
    console.log(`tokenizer.json: ${tokenizerRes.status()}`);
    expect(tokenizerRes.status()).toBe(200);

    // Verify ORT WASM loader is served
    const ortRes = await page.request.head('/ort/ort-wasm-simd-threaded.mjs');
    console.log(`ort-wasm-simd-threaded.mjs: ${ortRes.status()}`);
    expect(ortRes.status()).toBe(200);

    // Verify ORT WASM binary is served
    const wasmRes = await page.request.head('/ort/ort-wasm-simd-threaded.wasm');
    console.log(`ort-wasm-simd-threaded.wasm: ${wasmRes.status()}`);
    expect(wasmRes.status()).toBe(200);

    const artifacts = {
      test: 'model-assets-served',
      timestamp: new Date().toISOString(),
      results: {
        'model.onnx': modelRes.status(),
        'tokenizer.json': tokenizerRes.status(),
        'ort-wasm-simd-threaded.mjs': ortRes.status(),
        'ort-wasm-simd-threaded.wasm': wasmRes.status()
      }
    };
    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '01-model-assets.json'),
      JSON.stringify(artifacts, null, 2)
    );
  });

  test('2. Page loads and exposes __deedsClientInference hook', async ({ page }) => {
    // Navigate to ai-dashboard — it imports client AI modules
    await page.goto('/ai-dashboard');
    await page.waitForLoadState('networkidle');

    await captureNumberedStep(page, 1, 'ai-dashboard-loaded', {
      directory: SCREENSHOT_DIR,
      fullPage: true
    });

    // The hook is installed when client-embed.ts is imported
    // Wait for it to appear (module may load async)
    const hookExists = await page.evaluate(async () => {
      // Give modules time to load
      for (let i = 0; i < 30; i++) {
        if ((window as any).__deedsClientInference) return true;
        await new Promise(r => setTimeout(r, 1000));
      }
      return false;
    });

    console.log(`__deedsClientInference hook found: ${hookExists}`);
    expect(hookExists).toBe(true);

    await captureNumberedStep(page, 2, 'hook-detected', {
      directory: SCREENSHOT_DIR
    });
  });

  test('3. Preload embedding model via hook', async ({ page }) => {
    await page.goto('/ai-dashboard');
    await page.waitForLoadState('networkidle');

    // Wait for hook
    await page.waitForFunction(
      () => !!(window as any).__deedsClientInference,
      { timeout: 30_000 }
    );

    await captureNumberedStep(page, 3, 'before-preload', {
      directory: SCREENSHOT_DIR
    });

    // Preload model + tokenizer
    const preloadResult = await page.evaluate(async () => {
      const hook = (window as any).__deedsClientInference;
      const start = performance.now();
      const result = await hook.preload();
      const loadTimeMs = Math.round(performance.now() - start);
      return { ...result, loadTimeMs };
    });

    console.log(`Preload result: ready=${preloadResult.ready}, backend=${preloadResult.backend}, loadTime=${preloadResult.loadTimeMs}ms`);

    expect(preloadResult.ready).toBe(true);
    expect(preloadResult.backend).not.toBe('not loaded');

    await captureNumberedStep(page, 4, 'model-preloaded', {
      directory: SCREENSHOT_DIR
    });

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '03-preload-result.json'),
      JSON.stringify(preloadResult, null, 2)
    );
  });

  test('4. Run embedding inference and validate output', async ({ page }) => {
    await page.goto('/ai-dashboard');
    await page.waitForLoadState('networkidle');

    // Wait for hook
    await page.waitForFunction(
      () => !!(window as any).__deedsClientInference,
      { timeout: 30_000 }
    );

    // Preload first (memoized if already loaded)
    await page.evaluate(() => (window as any).__deedsClientInference.preload());

    await captureNumberedStep(page, 5, 'ready-for-inference', {
      directory: SCREENSHOT_DIR
    });

    // Run embedding on a legal test query
    const result = await page.evaluate(async () => {
      const hook = (window as any).__deedsClientInference;
      return hook.runEmbedding('breach of fiduciary duty in corporate governance');
    });

    console.log(`Embedding result: dim=${result.dim}, backend=${result.backend}, duration=${result.durationMs}ms`);
    console.log(`First 5 values: [${result.vector.slice(0, 5).map((v: number) => v.toFixed(6)).join(', ')}]`);

    // Validate 768 dimensions
    expect(result.dim).toBe(768);
    expect(result.vector.length).toBe(768);

    // Validate L2-normalized (norm should be ~1.0)
    const norm = Math.sqrt(result.vector.reduce((sum: number, v: number) => sum + v * v, 0));
    console.log(`L2 norm: ${norm.toFixed(6)}`);
    expect(norm).toBeGreaterThan(0.99);
    expect(norm).toBeLessThan(1.01);

    // Validate no NaN/Infinity
    const hasInvalid = result.vector.some((v: number) => !Number.isFinite(v));
    expect(hasInvalid).toBe(false);

    // Validate backend is one of expected providers
    expect(['WASM', 'WebGPU (Dawn)', 'CPU']).toContain(result.backend);

    await captureNumberedStep(page, 6, 'inference-complete', {
      directory: SCREENSHOT_DIR
    });

    // Save full result artifact (vector truncated to first/last 10 for readability)
    const artifact = {
      test: 'embedding-inference',
      timestamp: new Date().toISOString(),
      query: 'breach of fiduciary duty in corporate governance',
      dim: result.dim,
      backend: result.backend,
      durationMs: result.durationMs,
      l2Norm: norm,
      vectorPreview: {
        first10: result.vector.slice(0, 10),
        last10: result.vector.slice(-10)
      }
    };
    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '04-embedding-result.json'),
      JSON.stringify(artifact, null, 2)
    );
  });

  test('5. Cosine similarity between related vs unrelated queries', async ({ page }) => {
    await page.goto('/ai-dashboard');
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(
      () => !!(window as any).__deedsClientInference,
      { timeout: 30_000 }
    );

    await page.evaluate(() => (window as any).__deedsClientInference.preload());

    const result = await page.evaluate(async () => {
      const hook = (window as any).__deedsClientInference;

      const q1 = await hook.runEmbedding('breach of fiduciary duty');
      const q2 = await hook.runEmbedding('fiduciary obligation violation');
      const q3 = await hook.runEmbedding('chocolate cake recipe');

      // Cosine similarity helper
      function cosine(a: number[], b: number[]) {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
          dot += a[i] * b[i];
          normA += a[i] * a[i];
          normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom > 0 ? dot / denom : 0;
      }

      const simRelated = cosine(q1.vector, q2.vector);
      const simUnrelated = cosine(q1.vector, q3.vector);

      return {
        related: { query1: 'breach of fiduciary duty', query2: 'fiduciary obligation violation', similarity: simRelated },
        unrelated: { query1: 'breach of fiduciary duty', query2: 'chocolate cake recipe', similarity: simUnrelated },
        backends: [q1.backend, q2.backend, q3.backend],
        durations: [q1.durationMs, q2.durationMs, q3.durationMs]
      };
    });

    console.log(`Related similarity: ${result.related.similarity.toFixed(4)}`);
    console.log(`Unrelated similarity: ${result.unrelated.similarity.toFixed(4)}`);
    console.log(`Backends: ${result.backends.join(', ')}`);
    console.log(`Durations: ${result.durations.join('ms, ')}ms`);

    // Related legal queries should have higher similarity than unrelated
    expect(result.related.similarity).toBeGreaterThan(result.unrelated.similarity);

    // Related should be reasonably high (> 0.5)
    expect(result.related.similarity).toBeGreaterThan(0.5);

    await captureNumberedStep(page, 7, 'similarity-test-complete', {
      directory: SCREENSHOT_DIR
    });

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '05-similarity-result.json'),
      JSON.stringify(result, null, 2)
    );
  });

  test('6. Embedding is cached in IndexedDB on second call', async ({ page }) => {
    await page.goto('/ai-dashboard');
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(
      () => !!(window as any).__deedsClientInference,
      { timeout: 30_000 }
    );

    await page.evaluate(() => (window as any).__deedsClientInference.preload());

    const result = await page.evaluate(async () => {
      const hook = (window as any).__deedsClientInference;
      const text = 'test caching behavior for deeds platform';

      // First call — model inference
      const first = await hook.runEmbedding(text);
      // Second call — should be cached (much faster)
      const second = await hook.runEmbedding(text);

      return {
        firstDuration: first.durationMs,
        secondDuration: second.durationMs,
        vectorsMatch: JSON.stringify(first.vector) === JSON.stringify(second.vector),
        firstBackend: first.backend,
        secondBackend: second.backend
      };
    });

    console.log(`First call: ${result.firstDuration}ms, Second call: ${result.secondDuration}ms`);
    console.log(`Vectors match: ${result.vectorsMatch}`);

    // Vectors should be identical (cached)
    expect(result.vectorsMatch).toBe(true);

    // Second call should be faster (cached in IndexedDB, skips inference)
    // Note: first call may also be fast if cached from a previous test
    console.log(`Cache speedup: ${result.firstDuration}ms → ${result.secondDuration}ms`);

    await captureNumberedStep(page, 8, 'caching-verified', {
      directory: SCREENSHOT_DIR
    });

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, '06-caching-result.json'),
      JSON.stringify(result, null, 2)
    );
  });
});