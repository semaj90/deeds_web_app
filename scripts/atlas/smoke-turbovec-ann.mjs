#!/usr/bin/env node
/**
 * scripts/atlas/smoke-turbovec-ann.mjs
 *
 * Verifies that the TurboVec sidecar (on 8792/8793) is healthy,
 * has indexed vectors, and successfully returns non-empty results on POST /search.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../sveltekit-frontend/.env') });

const PORT = Number(process.env.TURBOVEC_PORT ?? 8792);
const SIDECAR_URL = `http://127.0.0.1:${PORT}`;

async function main() {
  console.log(`\n═══ TurboVec ANN Smoke Test ═══`);
  console.log(`Target Sidecar: ${SIDECAR_URL}`);

  // 1. Probe health
  console.log(`\nProbing health...`);
  let health;
  try {
    const res = await fetch(`${SIDECAR_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    health = await res.json();
    console.log(`✅ Sidecar is healthy!`);
    console.log(`   Backend:  ${health.backend}`);
    console.log(`   Indexed:  ${health.indexed} vectors`);
    console.log(`   Dimension: ${health.dim}`);
  } catch (err) {
    console.error(`❌ Health probe failed:`, err.message);
    process.exit(1);
  }

  if (health.indexed === 0) {
    console.warn(`⚠️  Sidecar has 0 indexed vectors. Please build/reindex the sidecar first.`);
    process.exit(1);
  }

  // 2. Perform a test search query (mock 768d query vector)
  console.log(`\nTesting search query (768d mock vector)...`);
  const mockVector = Array.from({ length: 768 }, () => Math.random() - 0.5);
  // Normalize
  let norm = 0;
  for (let i = 0; i < 768; i++) norm += mockVector[i] * mockVector[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < 768; i++) mockVector[i] /= norm;

  try {
    const start = Date.now();
    const res = await fetch(`${SIDECAR_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector: mockVector, topK: 10 }),
      signal: AbortSignal.timeout(5000)
    });
    const latency = Date.now() - start;

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} - ${await res.text()}`);
    }

    const data = await res.json();
    const candidates = data.candidates ?? [];
    console.log(`✅ Search query completed in ${latency}ms`);
    console.log(`   Candidates returned: ${candidates.length}`);

    if (candidates.length === 0) {
      console.error(`❌ Search returned 0 candidates!`);
      process.exit(1);
    }

    console.log(`\nSample candidates:`);
    candidates.slice(0, 3).forEach((c, idx) => {
      console.log(`  [${idx + 1}] ID: ${String(c.id).padEnd(50)} | Score: ${c.score.toFixed(4)} | Cluster: ${c.cluster}`);
    });

    console.log(`\n🎉 SMOKE TEST PASSED!`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ Search query failed:`, err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal:`, err);
  process.exit(1);
});
