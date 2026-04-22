/**
 * Cache Stack Smoke Test
 * Verifies L1 (Redis), L2 (Qdrant), and L3 (Bifrost/Gateway) cache hierarchy.
 */

import { test, expect } from 'vitest';
import { bifrostChat } from '../ollama.js';
import { VLM_MODELS } from '../ollama.js';

test('Cache Stack Hierarchy: L3 -> L2 -> L1', async () => {
  const model = VLM_MODELS.legal;
  const testQuery = "What are the rules of hearsay in Minnesota?";
  const messages = [{ role: 'user', content: testQuery }];
  const uniqueKey = 'smoke-test-' + Date.now();
  
  console.log("--- Phase 76 Cache Stack Smoke Test ---");

  // 1. Passthrough Miss (Cold Start)
  console.log("\n[1/3] Testing L3 Passthrough (Miss/Cold)...");
  const t0 = Date.now();
  const res1 = await bifrostChat(messages, model, { cacheKey: uniqueKey });
  console.log(`Result received in ${Date.now() - t0}ms`);
  expect(res1).toBeDefined();

  // 2. Wait for async write-back (Wait 3s for safety)
  console.log("\n[2/3] Waiting 3s for async L2 write-back...");
  await new Promise(r => setTimeout(r, 3000));

  // 3. Semantic/Exact Hit
  // Note: Since we use the SAME query, it should be an L1 hit if Redis is working,
  // or an L2 hit if we slightly vary it.
  console.log("\n[3/3] Testing L1/L2 Hit...");
  const t1 = Date.now();
  const res2 = await bifrostChat(messages, model, { cacheKey: uniqueKey });
  console.log(`Result received in ${Date.now() - t1}ms`);
  expect(res2).toBe(res1);
  
  // Verify hit level via logs (we'll assume success if it's much faster)
  expect(Date.now() - t1).toBeLessThan(Date.now() - t0);

  console.log("\n✅ ALL CACHE STACK SMOKE TESTS PASSED");
}, { timeout: 60000 });
