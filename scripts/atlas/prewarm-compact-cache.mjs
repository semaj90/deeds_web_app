#!/usr/bin/env node
/**
 * scripts/atlas/prewarm-compact-cache.mjs
 *
 * RETIRED: historical synthetic 384-D Warden/Nomic cache prewarm.
 * This script generated mock vectors, not qualified semantic representations, and must not run.
 *
 * CANONICAL EMBEDDING: embeddinggemma:latest = 768-dim (Qdrant codebase_chunks_768)
 * Canonical representation: semantic_768 / EmbeddingGemma.
 * Derived comparisons: semantic_mrl_512/256/128 and learned latent_256/128/64.
 * No synthetic or legacy 384-D cache vector is admissible as routing/retrieval evidence.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv } from './connection-config.mjs';
import { createAtlasRedisClient, VECTOR_LANE_REGISTRY } from './lib/redis-client-factory.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

Object.assign(process.env, loadRepoEnv(process.env));
const DRY_RUN = process.argv.includes('--dry-run');

console.error('RETIRED_UNQUALIFIED_384_PREWARM: this script produced synthetic vectors and cannot populate the active semantic cache.');
process.exit(78);

// High-priority manifold anchor files to pre-warm
const ANCHOR_FILES = [
  'sveltekit-frontend/src/lib/server/gpu/gpu-job-queue.ts',
  'simd-bridge/cpp/binding.cc',
  'simd-bridge/cpp/som_cache.cu',
  'sveltekit-frontend/src/routes/+page.server.ts',
  'scripts/atlas/smoke-vram-hygiene.mjs'
];

async function runPrewarm() {
  const config = {
    host: process.env.REDIS_HOST || process.env.VALKEY_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || process.env.VALKEY_PORT || '6379', 10),
    passwordSet: Boolean(process.env.REDIS_PASSWORD || process.env.VALKEY_PASSWORD),
  };
  console.log('RETIRED: historical synthetic 384-D cache prewarm is disabled.');
  console.log(`ℹ️ Redis Endpoint: ${config.host}:${config.port} (password: ${config.passwordSet ? 'set' : 'missing'})`);

  const report = {
    timestamp: new Date().toISOString(),
    canonicalEmbedding: 'embeddinggemma:latest (768-dim)',
    primaryVectorStore: 'Qdrant codebase_chunks_768',
    routingOptimization: 'RETIRED_UNQUALIFIED_SYNTHETIC_384D',
    gpuUsageBypassed: true,
    totalKeysPrewarmed: 0,
    prewarmedKeys: [],
    status: 'UNKNOWN'
  };

  const redis = createAtlasRedisClient();
  await redis.connect();

  try {
    // 1. Verify Redis is active
    await redis.ping();
    console.log('✔️ Redis / BitFrost cache is active.');

    // Unreachable legacy implementation retained for historical reference only.
    for (const filePath of ANCHOR_FILES) {
      const redisKey = `gpu:warden:cache:384d:${filePath}`;
      
      // Historical mock data only; this code is disabled by the module-level exit above.
      const vector = [];
      let hash = 0;
      for (let i = 0; i < filePath.length; i++) {
        hash = filePath.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      let sum = 0;
      for (let d = 0; d < 384; d++) {
        const val = Math.sin(hash + d);
        vector.push(val);
        sum += val * val;
      }
      
      // Normalize vector
      const norm = Math.sqrt(sum);
      const normalizedVector = vector.map(v => Number((v / norm).toFixed(6)));

      // Save to Redis (1 week expiry to remain ephemeral and rebuildable)
      if (!DRY_RUN) {
        await redis.set(redisKey, JSON.stringify(normalizedVector), 'EX', 604800);
      }
      
      report.prewarmedKeys.push({
        file: filePath,
        keyName: redisKey,
        dimension: 384,
        normalized: true
      });
      report.totalKeysPrewarmed++;
    }

    console.log(`Historical mock cache entries observed: ${report.totalKeysPrewarmed}`);
    report.status = 'PASS';
  } catch (err) {
    console.error(`🔴 Cache prewarm failed: ${err.message}`);
    report.status = 'FAIL';
  } finally {
    redis.disconnect();
  }

  // 3. Write reports
  const reportsDir = resolve(REPO_ROOT, 'docs/reports');
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }

  const jsonPath = join(reportsDir, 'compact-cache-prewarm-report.json');
  const mdPath = join(reportsDir, 'compact-cache-prewarm-report.md');

  if (!DRY_RUN) {
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  }

  // Format MD Report
  const mdContent = `# Retired Synthetic 384-D Cache Prewarm (Noncanonical)

## Execution Summary
- **Timestamp**: ${report.timestamp}
- **Prewarm Status**: **${report.status}**
- **GPU Usage Bypassed**: ${report.gpuUsageBypassed ? '✅ Yes (zero VRAM overhead)' : '❌ No'}

## Architecture Parity Check
- [x] **Compact Cache Lane**: \`${report.compactLane}\` (Used for lightweight semantic routing).
- [x] **Canonical Recall Authority**: \`${report.canonicalRecallAuthority}\` (Qdrant remains authoritative 768d truth).
- [x] **Total Routing Keys Loaded**: ${report.totalKeysPrewarmed} keys.

---

## Pre-warmed Manifold Anchors Detail

${report.prewarmedKeys.map((k, i) => `
### Anchor #${i+1}: ${k.file}
- **Redis Cache Key**: \\\`${k.keyName}\\\`
- **Vector Dimensions**: \`${k.dimension}d\`
- **Prewarming Strategy**: CPU hash-seeded normalized compact vector (VRAM safe).
`).join('\n')}

---
*Report programmatically generated by the prewarm-compact-cache coordinator.*
`;

  if (!DRY_RUN) {
    writeFileSync(mdPath, mdContent, 'utf8');
    console.log(`\n✔️ Compact prewarm reports successfully saved:`);
    console.log(`   - JSON: ${jsonPath}`);
    console.log(`   - Markdown: ${mdPath}\n`);
  } else {
    console.log(`\n✔️ Compact prewarm dry-run complete; no Redis writes or report files were created.\n`);
  }

  if (report.status === 'PASS') {
    console.log(`🎉 Compact Cache Prewarm completed with 100% SUCCESS${DRY_RUN ? ' (dry-run)' : ''}!`);
    process.exit(0);
  } else {
    console.error('🔴 Compact Cache Prewarm FAILED.');
    process.exit(1);
  }
}

runPrewarm().catch(err => {
  console.error('🔴 Critical prewarm coordinator failure:', err);
  process.exit(1);
});
