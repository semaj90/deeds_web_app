#!/usr/bin/env node
/**
 * scripts/atlas/warmup-bifrost-clusters.mjs
 *
 * Phase D — Pre-seed Bifrost L2 semantic cache with top cluster summaries.
 *
 * Reads ace:cluster:tags:__meta → ace:cluster:tags:{ck} from Redis,
 * then POSTs each cluster summary to Bifrost (/v1/chat/completions) so that
 * future ACE queries referencing these clusters hit L2 instead of GPU inference.
 *
 * Run after karpathy:gpu (which writes cluster scores to Redis):
 *   node scripts/atlas/warmup-bifrost-clusters.mjs
 *
 * npm alias: npm run warmup:bifrost:clusters (from sveltekit-frontend/)
 *
 * Flags:
 *   --dry-run    Print what would be sent, skip actual POST
 *   --limit N    Only warm top N clusters (default: all)
 *   --ttl N      Bifrost cache TTL in seconds (default: 3600)
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FE_ROOT = resolve(__dirname, '../../sveltekit-frontend');

dotenv.config({ path: resolve(FE_ROOT, '.env') });

const REDIS_URL      = process.env.REDIS_URL      || 'redis://127.0.0.1:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const BIFROST_URL    = process.env.BIFROST_URL     || 'http://127.0.0.1:3040';
const BIFROST_MODEL  = process.env.BIFROST_MODEL   || 'gemma3-legal:latest';

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const LIMIT_IDX = args.indexOf('--limit');
const LIMIT     = LIMIT_IDX !== -1 ? parseInt(args[LIMIT_IDX + 1], 10) : Infinity;
const TTL_IDX   = args.indexOf('--ttl');
const CACHE_TTL = TTL_IDX !== -1 ? parseInt(args[TTL_IDX + 1], 10) : 3600;

const ENDPOINT = `${BIFROST_URL}/v1/chat/completions`;

async function main() {
  console.log(`[warmup-bifrost] → Bifrost: ${ENDPOINT} | TTL: ${CACHE_TTL}s${DRY_RUN ? ' | DRY RUN' : ''}`);

  // ── connect Redis (ioredis cold-start pattern) ────────────────────────────
  const redisOpts = {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  };
  if (REDIS_PASSWORD) redisOpts.password = REDIS_PASSWORD;

  const redis = new Redis(REDIS_URL, redisOpts);
  redis.on('error', () => {});
  await redis.connect().catch(() => {
    console.error('[warmup-bifrost] Redis unavailable — exiting');
    process.exit(0);
  });

  // ── read manifest ─────────────────────────────────────────────────────────
  const metaRaw = await redis.get('ace:cluster:tags:__meta');
  if (!metaRaw) {
    console.warn('[warmup-bifrost] ace:cluster:tags:__meta not found — run graphify:sync-cluster-tags first');
    await redis.quit();
    return;
  }

  let meta;
  try { meta = JSON.parse(metaRaw); } catch {
    console.error('[warmup-bifrost] malformed __meta JSON');
    await redis.quit();
    return;
  }

  const clusterKeys = (meta.clusterKeys ?? []).slice(0, isFinite(LIMIT) ? LIMIT : undefined);
  console.log(`[warmup-bifrost] warming ${clusterKeys.length} of ${meta.count ?? '?'} clusters`);

  // ── for each cluster, read summary and POST to Bifrost ───────────────────
  let warmed = 0;
  let skipped = 0;
  let errors = 0;

  for (const ck of clusterKeys) {
    const summary = await redis.hget(`ace:cluster:tags:${ck}`, 'summary');
    if (!summary || !summary.trim()) {
      skipped++;
      continue;
    }

    const prompt = `Cluster ${ck} context: ${summary}`;

    if (DRY_RUN) {
      console.log(`  [dry] ${ck}: "${summary.slice(0, 80)}..."`);
      warmed++;
      continue;
    }

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-bf-cache-ttl': String(CACHE_TTL),
          'x-bf-cache-type': 'semantic',
        },
        body: JSON.stringify({
          model: BIFROST_MODEL,
          messages: [
            { role: 'system', content: 'You are a legal AI codebase assistant. Answer concisely.' },
            { role: 'user',   content: prompt },
          ],
          max_tokens: 32,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        warmed++;
      } else {
        const body = await res.text().catch(() => '');
        console.warn(`  [warn] ${ck}: HTTP ${res.status} — ${body.slice(0, 100)}`);
        errors++;
      }
    } catch (err) {
      // Bifrost may be down — non-fatal, just skip
      console.warn(`  [warn] ${ck}: ${err.message}`);
      errors++;
    }

    // small jitter to avoid hammering Bifrost
    await new Promise(r => setTimeout(r, 120));
  }

  await redis.quit();

  console.log(`[warmup-bifrost] done — warmed: ${warmed}, skipped (no summary): ${skipped}, errors: ${errors}`);
  if (errors > 0 && warmed === 0) {
    console.warn('[warmup-bifrost] all requests failed — is Bifrost running on port 3040?');
  }
}

main().catch(err => {
  console.error('[warmup-bifrost] fatal:', err.message);
  process.exit(1);
});
