#!/usr/bin/env node
/**
 * BIFROST-KEY-SEMANTICS-OWNER-01 Stage 2 proof.
 * Proves bifrost:sem:packet:* (identity A, packetKey) and bifrost:sem:query:*
 * (identity B, query_hash, newly split out) are now genuinely distinct
 * namespaces, and that invalidateBitfrostPacket() (identity A's invalidator)
 * does not touch identity B. Bounded, disposable synthetic keys only.
 *
 * Run from sveltekit-frontend/: npx tsx ../scripts/atlas/prove-bifrost-key-semantics-owner-v1-stage2.mjs
 */
import Redis from 'ioredis';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const REPORT_PATH = resolve(REPO_ROOT, 'docs/reports/parent-atlas-bitfrost-key-semantics-owner-v1-stage2.json');

const TEST_PACKET_KEY = 'packet:test-bifrost-key-semantics-stage2';
const TEST_QUERY_HASH = 'queryhash-test-bifrost-key-semantics-stage2';

function fail(step, msg) { throw new Error(`[${step}] FAILED: ${msg}`); }

async function main() {
  const { invalidateBitfrostPacket } = await import('$lib/server/cache/atlas-reward-cache.js');
  const { bifrostKey } = await import('$lib/server/cache-keys.js');

  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || 'redis',
    lazyConnect: true, enableOfflineQueue: false, retryStrategy: () => null,
  });
  redis.on('error', () => {});
  await redis.connect();
  await redis.ping();

  const packetKeyKey = bifrostKey.semantic.packet(TEST_PACKET_KEY);
  const queryKeyKey = bifrostKey.semantic.query(TEST_QUERY_HASH);
  const steps = {};

  try {
    if (packetKeyKey === queryKeyKey) fail('DISTINCT', 'packet() and query() produced the same key -- namespaces still collide');
    steps.namespaces_distinct = { ok: true, packetKeyKey, queryKeyKey };

    await redis.set(packetKeyKey, JSON.stringify({ kind: 'packet', packetKey: TEST_PACKET_KEY }), 'EX', 60);
    await redis.set(queryKeyKey, JSON.stringify({ kind: 'query', query_hash: TEST_QUERY_HASH }), 'EX', 60);

    const [packetExists, queryExists] = await Promise.all([redis.exists(packetKeyKey), redis.exists(queryKeyKey)]);
    if (packetExists !== 1 || queryExists !== 1) fail('SEED', 'one or both disposable keys failed to seed');
    steps.both_seeded = { ok: true, packetExists, queryExists };

    // Identity A's invalidator must delete ONLY the packet-keyed entry, never the query-keyed one.
    const result = await invalidateBitfrostPacket(redis, { packetKey: TEST_PACKET_KEY });
    if (!result.ok) fail('INVALIDATE', result.error);

    const [packetGone, queryStillThere] = await Promise.all([redis.exists(packetKeyKey), redis.exists(queryKeyKey)]);
    if (packetGone !== 0) fail('SCOPE', 'invalidateBitfrostPacket did not delete the identity-A key');
    if (queryStillThere !== 1) fail('SCOPE', 'invalidateBitfrostPacket incorrectly deleted the identity-B (query) key -- namespaces still entangled');
    steps.invalidation_scoped_to_identity_a = { ok: true, packetGone, queryStillThere };

    const report = {
      gate: 'BIFROST-KEY-SEMANTICS-OWNER-01',
      stage: 2,
      status: 'STAGE_2_PROOF_PASSED',
      executedAt: new Date().toISOString(),
      summary: 'bifrost:sem:packet:* (packetKey) and bifrost:sem:query:* (query_hash) confirmed genuinely distinct after migrating warm-bifrost-semantic-cache.mjs + query-router.ts off the collided prefix. invalidateBitfrostPacket() confirmed scoped to identity A only -- does not touch identity B.',
      filesChanged: [
        'sveltekit-frontend/src/lib/server/cache-keys.ts (added bifrostKey.semantic.query, .sourceRef)',
        'scripts/cache/warm-bifrost-semantic-cache.mjs (writer: bifrost:sem:packet:{query_hash} -> bifrost:sem:query:{query_hash})',
        'sveltekit-frontend/src/lib/server/ace/query-router.ts (reader: bifrostKey.semantic.packet(queryHash) -> bifrostKey.semantic.query(queryHash), 2 call sites)',
      ],
      knownUnrelatedPreExistingIssue: {
        file: 'sveltekit-frontend/src/lib/server/ace/query-router.ts',
        issue: "imports bifrostRetrievalCacheKeyV2 from cache-keys.js, which has never been exported there (confirmed via `git show HEAD:...cache-keys.ts` -- zero matches). Pre-existing, not introduced by this change. Not fixed here (out of this gate's scope).",
      },
      backwardCompatibilityNote: 'Old bifrost:sem:packet:{query_hash} entries written before this fix are NOT read by the new code (reading them would perpetuate the identity ambiguity this migration removes). They expire naturally under their original 3600s TTL; query-router.ts cache-misses and falls through to the next retrieval lane in the meantime -- fail-open, not fail-closed.',
      liveProof: steps,
      postgresWrites: false, valkeyWrites: true, qdrantWrites: false, neo4jWrites: false, modelCalls: false,
      note: 'valkeyWrites:true bounded to disposable synthetic test keys only.',
    };
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, report: REPORT_PATH }, null, 2));
  } finally {
    await redis.del(packetKeyKey, queryKeyKey).catch(() => {});
    await redis.quit().catch(() => {});
  }
}

main().catch((err) => { console.error('PROOF_FAILED:', err.message); process.exit(1); });
