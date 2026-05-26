#!/usr/bin/env node
/**
 * scripts/graphify-som-cluster-summaries.mjs
 *
 * For each of the 87 autoencoder SOM clusters in Redis
 * (gpu:autoencoder:centroids_64), fetches representative Qdrant chunks,
 * calls Gemma4 to produce a 2-sentence semantic summary, then:
 *
 *   1. Writes  cluster:summary:{id}  to Redis (compatible with cluster-summary-forest.ts)
 *   2. Writes  ace:cluster:summary:{id}  (compatible with agents/regen loader)
 *   3. Merges  SOMCluster{id, summary, size, trainedAt}  node in Neo4j
 *   4. Creates BELONGS_TO_CLUSTER edges: (CodebaseFile) -> (SOMCluster)
 *
 * Usage:
 *   npx tsx scripts/graphify-som-cluster-summaries.mjs
 *   npx tsx scripts/graphify-som-cluster-summaries.mjs --limit 5   # first 5 clusters
 *   npx tsx scripts/graphify-som-cluster-summaries.mjs --skip-llm  # Redis+Neo4j only
 *   npx tsx scripts/graphify-som-cluster-summaries.mjs --force     # re-summarize all
 *   npx tsx scripts/graphify-som-cluster-summaries.mjs --no-neo4j  # skip Neo4j step
 */

import { Redis } from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const QDRANT_URL  = process.env.QDRANT_URL  ?? 'http://localhost:6333';
const REDIS_URL   = process.env.REDIS_URL   ?? 'redis://localhost:6379';
const NEO4J_URL   = process.env.NEO4J_URI   ?? 'bolt://localhost:7687';
const NEO4J_USER  = process.env.NEO4J_USER  ?? 'neo4j';
const NEO4J_PASS  = process.env.NEO4J_PASSWORD ?? 'neo4j123';
const OLLAMA_URL  = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const CHAT_MODEL  = process.env.OLLAMA_CHAT_MODEL ?? 'gemma4-rotorquant:latest';

const REDIS_CENTROIDS_HASH = 'gpu:autoencoder:centroids_64';
const REDIS_META_HASH      = 'gpu:autoencoder:centroids_64_meta';
const REDIS_CLUSTER_AUTH   = 'gpu:karpathy:clusters';
const COLLECTION           = 'codebase_chunks_768';
const CHUNKS_PER_CLUSTER   = 12;  // representative chunks for LLM context
const MIN_CLUSTER_SIZE     = 3;   // skip tiny clusters

const args       = process.argv.slice(2);
const LIMIT      = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const SKIP_LLM   = args.includes('--skip-llm');
const FORCE      = args.includes('--force');
const NO_NEO4J   = args.includes('--no-neo4j');

// ── Redis ─────────────────────────────────────────────────────────────────────

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
  enableOfflineQueue: false,
});
redis.on('error', () => {});
await redis.connect().catch(() => {});

// ── Qdrant helpers ────────────────────────────────────────────────────────────

async function qdrantScroll(filter, limit) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter,
      limit,
      with_payload: true,
      with_vector: false,
    }),
  });
  if (!res.ok) throw new Error(`Qdrant scroll ${res.status}`);
  const { result } = await res.json();
  return result?.points ?? [];
}

// ── LLM call ─────────────────────────────────────────────────────────────────

async function summarizeCluster(clusterId, chunks, authorityLine = '') {
  const snippets = chunks
    .map((pt, i) => {
      const fp = pt.payload?.file_path ?? pt.payload?.path ?? 'unknown';
      const txt = (pt.payload?.content ?? pt.payload?.chunk_text ?? '').slice(0, 300);
      return `[${i + 1}] ${fp}\n${txt}`;
    })
    .join('\n\n');

  const prompt = `You are analyzing a cluster of code files grouped by semantic similarity.
Cluster ID: ${clusterId}

PageRank authority hints:
${authorityLine || 'none available'}
- Use these as representative examples.
- Do not summarize only by keyword frequency.
- Prefer structurally central code paths.

Representative code snippets:
${snippets}

Write a single 2-sentence technical summary of what this cluster of files is about.
Focus on the functional role and relationships, not individual files.
Be specific and concise. No bullet points.`;

  // Use /api/chat — Gemma4 thinking models return empty `response` on /api/generate
  // but populate `message.content` correctly via the chat endpoint.
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      // VLM-thinking models can spend most of a short budget on reasoning.
      // Give them enough tokens to emit the final two-sentence summary.
      options: { temperature: 0.2, num_predict: 1024 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const text = (body.message?.content ?? body.response ?? '').trim();
  if (!text) throw new Error(`Ollama returned empty content for cluster ${clusterId}`);
  if (text.length < 40) throw new Error(`Summary too short (${text.length} chars) for cluster ${clusterId}: "${text}"`);
  return text;
}

// ── Neo4j helpers ─────────────────────────────────────────────────────────────

let neo4jDriver = null;

async function getNeo4j() {
  if (NO_NEO4J) return null;
  if (neo4jDriver) return neo4jDriver;
  try {
    const { default: neo4j } = await import('neo4j-driver');
    neo4jDriver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
    await neo4jDriver.verifyConnectivity();
    return neo4jDriver;
  } catch (e) {
    console.warn(`[neo4j] Unavailable (${e.message}) — skipping graph writes`);
    return null;
  }
}

async function writeNeo4jCluster(driver, clusterId, summary, filePaths, trainedAt, size) {
  const session = driver.session();
  try {
    // 1. Merge cluster node
    await session.run(
      `MERGE (c:SOMCluster {id: $id})
       SET c.summary   = $summary,
           c.size      = $size,
           c.trainedAt = $trainedAt,
           c.updatedAt = datetime()`,
      { id: clusterId, summary, size, trainedAt }
    );

    // 2. BELONGS_TO_CLUSTER edges — batch UNWIND
    if (filePaths.length > 0) {
      await session.run(
        `UNWIND $paths AS fp
         MERGE (f:CodebaseFile {filePath: fp})
         MERGE (c:SOMCluster   {id: $clusterId})
         MERGE (f)-[:BELONGS_TO_CLUSTER]->(c)`,
        { paths: filePaths, clusterId }
      );
    }
  } finally {
    await session.close();
  }
}

async function loadClusterAuthority(clusterId) {
  const byKey = await redis.get(`cluster:pagerank:${clusterId}`).catch(() => null);
  const raw = byKey ?? await redis.hget(REDIS_CLUSTER_AUTH, String(clusterId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadClusterTopFiles(clusterId) {
  const raw = await redis.get(`cluster:pagerank:top5:${clusterId}`).catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== SOM Cluster Summaries + Neo4j BELONGS_TO_CLUSTER ===');
  console.log(`[cfg] limit=${LIMIT || 'all'} skipLlm=${SKIP_LLM} force=${FORCE} noNeo4j=${NO_NEO4J}`);

  // Load centroid metadata
  const meta = await redis.hgetall(REDIS_META_HASH);
  if (!meta?.trainedAt) {
    console.error('[error] No centroid metadata in Redis — publish ace:autoencoder:weights first (npm run ae:train:js), then run ae:centroids');
    process.exit(1);
  }
  const trainedAt = meta.trainedAt;
  console.log(`[meta] trainedAt=${trainedAt} clusterCount=${meta.clusterCount}`);

  // Load cluster IDs
  const centroidsRaw = await redis.hgetall(REDIS_CENTROIDS_HASH);
  let clusterIds = Object.keys(centroidsRaw)
    .map(k => parseInt(k.replace('cluster_', '')))
    .filter(id => !isNaN(id))
    .sort((a, b) => a - b);

  if (LIMIT > 0) clusterIds = clusterIds.slice(0, LIMIT);
  console.log(`[clusters] Processing ${clusterIds.length} clusters`);

  // Connect to Neo4j (optional)
  const driver = await getNeo4j();
  if (driver) console.log('[neo4j] Connected');
  else if (!NO_NEO4J) console.log('[neo4j] Not connected — graph writes skipped');

  let written = 0, skipped = 0, failed = 0;
  const t0 = Date.now();

  for (const clusterId of clusterIds) {
    try {
      // Check if summary already exists and is current
      if (!FORCE) {
        const existing = await redis.get(`cluster:summary:${clusterId}`);
        if (existing) {
          try {
            const parsed = JSON.parse(existing);
            if (parsed.trainedAt === trainedAt) {
              skipped++;
              process.stdout.write('.');
              continue;
            }
          } catch { /* parse error — regenerate */ }
        }
      }

      // Fetch representative chunks from Qdrant
      const points = await qdrantScroll(
        { must: [{ key: 'som_cluster', match: { value: clusterId } }] },
        CHUNKS_PER_CLUSTER
      );

      if (points.length < MIN_CLUSTER_SIZE) {
        process.stdout.write('s');
        skipped++;
        continue;
      }

      // Generate summary
      let summary = `Cluster ${clusterId}: semantic group of ${points.length} code files.`;
      const authority = await loadClusterAuthority(clusterId);
      const topFiles = await loadClusterTopFiles(clusterId);
      const authorityLine = authority
        ? [
            `- clusterAuthorityScore: ${Number(authority.clusterAuthorityScore ?? 0).toFixed(4)}`,
            `- max PR: ${Number(authority.maxPageRank ?? authority.maxPr ?? 0).toFixed(4)}`,
            `- avg PR: ${Number(authority.avgPageRank ?? authority.avgPr ?? 0).toFixed(4)}`,
            `- memberCount: ${authority.memberCount ?? authority.totalFiles ?? 0}`,
            `- top files: ${topFiles.length ? topFiles.map((f, i) => `${i + 1}. ${f.filePath} [PR ${Number(f.pageRank ?? 0).toFixed(4)}, blend ${Number(f.karpathyBlend ?? 0).toFixed(4)}]`).join(' | ') : 'none'}`,
          ].join('\n')
        : 'none available';
      if (!SKIP_LLM) {
        try {
          summary = await summarizeCluster(clusterId, points, authorityLine);
        } catch (e) {
          console.warn(`\n[cluster ${clusterId}] LLM failed: ${e.message} — using fallback`);
        }
      }

      const filePaths = [...new Set(
        points.map(pt => pt.payload?.file_path ?? pt.payload?.path).filter(Boolean)
      )];

      const record = JSON.stringify({
        summary,
        clusterId,
        size: points.length,
        filePaths: filePaths.slice(0, 30),
        authority,
        pageRankTop5: topFiles,
        trainedAt,
        updatedAt: new Date().toISOString(),
      });

      // Write to Redis (two key formats for compatibility)
      await redis.setex(`cluster:summary:${clusterId}`, 6 * 3600, record);
      await redis.setex(`ace:cluster:summary:${clusterId}`, 6 * 3600, summary);

      // Write to Neo4j
      if (driver && filePaths.length > 0) {
        await writeNeo4jCluster(driver, clusterId, summary, filePaths, trainedAt, points.length);
      }

      written++;
      process.stdout.write('✓');
    } catch (e) {
      failed++;
      process.stdout.write('✗');
      if (process.env.DEBUG) console.error(`\n[cluster ${clusterId}]`, e.message);
    }
  }

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n\n=== Done in ${duration}s ===`);
  console.log(`  Written: ${written}`);
  console.log(`  Skipped: ${skipped} (cached or too small)`);
  console.log(`  Failed:  ${failed}`);
  if (driver) console.log(`  Neo4j:   BELONGS_TO_CLUSTER edges written for all written clusters`);

  if (driver) await neo4jDriver.close().catch(() => {});
  await redis.quit().catch(() => {});
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('[fatal]', e);
    process.exit(1);
  });

