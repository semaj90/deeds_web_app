#!/usr/bin/env node
/**
 * scripts/graphify-neo4j-clusters.mjs
 *
 * Reads Redis cluster:summary:* keys produced by graphify-som-cluster-summaries.mjs
 * and materialises enriched Cluster nodes + BELONGS_TO_CLUSTER edges in Neo4j.
 *
 * Nodes:   (n:SOMCluster:Cluster {id, label, summary, size, trainedAt, encoderVersion})
 * Edges:   (f:CodebaseFile)-[:BELONGS_TO_CLUSTER {source, encoderVersion, updatedAt}]->(n)
 *
 * Idempotent MERGE — safe to re-run after every ae:som-summaries run.
 *
 * Usage:
 *   npm run graphify:neo4j:clusters           # full run
 *   npm run graphify:neo4j:clusters:dry       # count-only, no writes
 */

import { Redis } from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const REDIS_URL      = process.env.REDIS_URL       ?? 'redis://localhost:6379';
const NEO4J_URL      = process.env.NEO4J_URI       ?? 'bolt://localhost:7687';
const NEO4J_USER     = process.env.NEO4J_USER      ?? 'neo4j';
const NEO4J_PASS     = process.env.NEO4J_PASSWORD  ?? 'neo4j123';
const ENCODER_VER    = process.env.AE_ENCODER_VERSION ?? '768-256-64-tanh-v1';
const BATCH_SIZE     = 20;

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// ── Redis ─────────────────────────────────────────────────────────────────────

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
  enableOfflineQueue: false,
});
redis.on('error', () => {});

// ── Neo4j ─────────────────────────────────────────────────────────────────────

let driver = null;
async function getNeo4j() {
  if (driver) return driver;
  const { default: neo4j } = await import('neo4j-driver');
  driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  await driver.verifyConnectivity();
  return driver;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive a short label from the LLM summary (first sentence, ≤80 chars). */
function deriveLabel(summary, clusterId) {
  if (!summary?.trim()) return `Cluster ${clusterId}`;
  const sentence = summary.match(/^[^.!?\n]+[.!?]?/)?.[0]?.trim() ?? summary;
  return sentence.length > 80 ? sentence.slice(0, 77) + '…' : sentence;
}

// Normalise absolute Windows/Unix paths to repo-relative (src/…, scripts/…, etc.)
// so they match CodebaseFile nodes created by the codebase scanner.
const REPO_ROOTS = [
  /^.*[/\\]sveltekit-frontend[/\\]/,
  /^.*[/\\]deeds-web-app[/\\]sveltekit-frontend[/\\]/,
];
function normalisePath(fp) {
  if (!fp) return fp;
  for (const re of REPO_ROOTS) {
    if (re.test(fp)) return fp.replace(re, '').replace(/\\/g, '/');
  }
  return fp.replace(/\\/g, '/');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Neo4j Cluster Materialisation ===');
  console.log(`[cfg] dryRun=${DRY_RUN} encoderVersion=${ENCODER_VER} batchSize=${BATCH_SIZE}`);

  await redis.connect().catch(() => {});

  // Scan all cluster:summary:* keys
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', 'cluster:summary:*', 'COUNT', 200);
    keys.push(...batch);
    cursor = next;
  } while (cursor !== '0');

  console.log(`[redis] Found ${keys.length} cluster:summary:* keys`);

  if (keys.length === 0) {
    console.error('[error] No cluster summaries in Redis — run npm run ae:som-summaries first');
    await redis.quit().catch(() => {});
    process.exit(1);
  }

  // Load all summaries
  const summaries = [];
  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    try {
      const rec = JSON.parse(raw);
      if (typeof rec.clusterId === 'number') summaries.push(rec);
    } catch { /* skip malformed */ }
  }

  summaries.sort((a, b) => a.clusterId - b.clusterId);
  console.log(`[redis] Loaded ${summaries.length} valid summaries`);

  if (DRY_RUN) {
    console.log('\n[dry-run] Would upsert Cluster nodes + BELONGS_TO_CLUSTER edges for:');
    for (const s of summaries.slice(0, 5)) {
      const label = deriveLabel(s.summary, s.clusterId);
      console.log(`  [${s.clusterId}] size=${s.size} files=${s.filePaths?.length ?? 0} label="${label.slice(0, 60)}"`);
    }
    if (summaries.length > 5) console.log(`  … and ${summaries.length - 5} more clusters`);
    console.log(`\n  Total clusters:     ${summaries.length}`);
    console.log(`  Total file targets: ${summaries.reduce((n, s) => n + (s.filePaths?.length ?? 0), 0)}`);
    await redis.quit().catch(() => {});
    return;
  }

  const neo4j = await getNeo4j();
  console.log('[neo4j] Connected');

  let clustersUpserted = 0;
  let edgesUpserted = 0;
  let batchesFailed = 0;
  const t0 = Date.now();

  for (let i = 0; i < summaries.length; i += BATCH_SIZE) {
    const batch = summaries.slice(i, i + BATCH_SIZE);
    const session = neo4j.session();
    try {
      // 1. Upsert Cluster nodes — add :Cluster label alongside :SOMCluster for forward compat
      await session.run(
        `UNWIND $clusters AS c
         MERGE (n:SOMCluster {id: c.clusterId})
         SET n:Cluster,
             n.label          = c.label,
             n.summary        = c.summary,
             n.size           = toInteger(c.size),
             n.trainedAt      = c.trainedAt,
             n.encoderVersion = c.encoderVersion,
             n.updatedAt      = datetime()`,
        {
          clusters: batch.map(s => ({
            clusterId:      s.clusterId,
            label:          deriveLabel(s.summary, s.clusterId),
            summary:        s.summary ?? '',
            size:           s.size ?? 0,
            trainedAt:      s.trainedAt ?? '',
            encoderVersion: ENCODER_VER,
          })),
        }
      );
      clustersUpserted += batch.length;

      // 2. BELONGS_TO_CLUSTER edges — one run per cluster (file list varies)
      for (const s of batch) {
        if (!s.filePaths?.length) continue;
        const paths = s.filePaths.slice(0, 30).map(normalisePath);
        await session.run(
          `UNWIND $paths AS fp
           MERGE (f:CodebaseFile {filePath: fp})
           MERGE (c:SOMCluster {id: $clusterId})
           MERGE (f)-[r:BELONGS_TO_CLUSTER]->(c)
           SET r.source          = 'som_cluster',
               r.encoderVersion  = $encoderVersion,
               r.updatedAt       = datetime()`,
          {
            paths,
            clusterId:      s.clusterId,
            encoderVersion: ENCODER_VER,
          }
        );
        edgesUpserted += paths.length;
      }

      process.stdout.write('✓');
    } catch (e) {
      batchesFailed++;
      process.stdout.write('✗');
      if (process.env.DEBUG) console.error(`\n[batch ${i}–${i + BATCH_SIZE}]`, e.message);
    } finally {
      await session.close();
    }
  }

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n\n=== Done in ${duration}s ===`);
  console.log(`  Cluster nodes upserted:       ${clustersUpserted}`);
  console.log(`  BELONGS_TO_CLUSTER edge targets: ${edgesUpserted}`);
  console.log(`  Failed batches:               ${batchesFailed}`);
  console.log(`  Encoder version:              ${ENCODER_VER}`);

  if (driver) await driver.close().catch(() => {});
  await redis.quit().catch(() => {});
}

main().catch(e => {
  console.error('[fatal]', e);
  process.exit(1);
});
