#!/usr/bin/env node
/**
 * scripts/graphify-som-cluster-summaries.mjs
 *
 * For each of the 87 autoencoder SOM clusters in Redis
 * (gpu:autoencoder:centroids_64), fetches representative Qdrant chunks,
 * calls the canonical llama-server synthesis model to produce a 2-sentence semantic summary, then:
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
import { fileURLToPath } from 'node:url';

const ROOT_ENV = fileURLToPath(
  new URL('../../.env', import.meta.url)
);

dotenv.config({ path: ROOT_ENV, override: true });

const {
  LLM_BASE_URL,
  LLM_MODEL_ID,
} = await import('../../scripts/lib/llm-runtime.mjs');

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD ?? '';
const REDIS_URL = (() => {
  const raw = process.env.REDIS_URL ?? 'redis://localhost:6379';
  try {
    const parsed = new URL(raw);
    if (!parsed.password && REDIS_PASSWORD) {
      parsed.password = REDIS_PASSWORD;
      return parsed.toString().replace(/\/$/, '');
    }
  } catch {
    // fall through to raw URL
  }
  return raw;
})();
const NEO4J_URL = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? 'neo4j123';

const REDIS_CENTROIDS_HASH = 'gpu:autoencoder:centroids_64';
const REDIS_META_HASH = 'gpu:autoencoder:centroids_64_meta';
const REDIS_CLUSTER_AUTH = 'gpu:karpathy:clusters';
const COLLECTION = 'codebase_chunks_768';
const CHUNKS_PER_CLUSTER = 12;
const MIN_CLUSTER_SIZE = 3;
const REQUIRED_META_KEYS = ['trainedAt', 'clusterCount'];

const args = process.argv.slice(2);
const LIMIT = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10);
const SKIP_LLM = args.includes('--skip-llm');
const FORCE = args.includes('--force');
const NO_NEO4J = args.includes('--no-neo4j');

// ── Redis ─────────────────────────────────────────────────────────────────────

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  connectTimeout: 5_000,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
  enableOfflineQueue: false,
});

redis.on('error', (err) => {
  if (process.env.DEBUG) {
    console.error(`[redis] ${err.message}`);
  }
});

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

  if (!res.ok) {
    throw new Error(`Qdrant scroll ${res.status}`);
  }

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

  // Canonical synthesis path: native llama-server OpenAI-compatible API.
  // Model identity comes from basename(ROTORQUANT_MODEL_PATH) via llm-runtime.mjs.
  const res = await fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LLM_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      stream: false,
      temperature: 0.2,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    throw new Error(`llama-server ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();

  const text = (body.choices?.[0]?.message?.content ?? '').trim();

  if (!text) {
    throw new Error(`llama-server returned empty content for cluster ${clusterId}`);
  }

  if (text.length < 40) {
    throw new Error(`Summary too short (${text.length} chars) for cluster ${clusterId}: "${text}"`);
  }

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
      {
        id: clusterId,
        summary,
        size,
        trainedAt,
      }
    );

    // 2. BELONGS_TO_CLUSTER edges — batch UNWIND
    if (filePaths.length > 0) {
      await session.run(
        `UNWIND $paths AS fp
         MERGE (f:CodebaseFile {filePath: fp})
         MERGE (c:SOMCluster {id: $clusterId})
         MERGE (f)-[:BELONGS_TO_CLUSTER]->(c)`,
        {
          paths: filePaths,
          clusterId,
        }
      );
    }
  } finally {
    await session.close();
  }
}

async function loadClusterAuthority(clusterId) {
  const byKey = await redis.get(`cluster:pagerank:${clusterId}`).catch(() => null);

  const raw = byKey ?? (await redis.hget(REDIS_CLUSTER_AUTH, String(clusterId)).catch(() => null));

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

  console.log(
    `[cfg] limit=${LIMIT || 'all'} skipLlm=${SKIP_LLM} force=${FORCE} noNeo4j=${NO_NEO4J}`
  );

  console.log(`[llm] ${LLM_BASE_URL}/v1/chat/completions model=${LLM_MODEL_ID}`);
  console.log(`[redis] ${REDIS_URL}`);

  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error(`Unexpected PING response: ${pong}`);
    }
    console.log('[redis] Connected');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Redis unavailable at ${REDIS_URL}: ${message}`);
  }

  // Load centroid metadata
  const meta = await redis.hgetall(REDIS_META_HASH);

  if (!meta?.trainedAt) {
    const presentKeys = Object.keys(meta ?? {});
    const missingKeys = REQUIRED_META_KEYS.filter((key) => !presentKeys.includes(key));
    console.error(
      `[error] Missing centroid metadata in Redis hash ${REDIS_META_HASH}`
    );
    console.error(`[error] Expected keys: ${REQUIRED_META_KEYS.join(', ')}`);
    console.error(`[error] Present keys: ${presentKeys.length ? presentKeys.join(', ') : '(none)'}`);
    console.error(`[error] Missing keys: ${missingKeys.length ? missingKeys.join(', ') : '(none)'}`);
    console.error(
      '[error] Run node scripts/train-autoencoder.mjs to publish ace:autoencoder:weights + ace:autoencoder:meta, then run node scripts/autoencoder-centroids.mjs'
    );
    process.exit(1);
  }

  const trainedAt = meta.trainedAt;

  console.log(`[meta] trainedAt=${trainedAt} clusterCount=${meta.clusterCount}`);

  // Load cluster IDs
  const centroidsRaw = await redis.hgetall(REDIS_CENTROIDS_HASH);

  let clusterIds = Object.keys(centroidsRaw)
    .map((k) => parseInt(k.replace('cluster_', ''), 10))
    .filter((id) => !Number.isNaN(id))
    .sort((a, b) => a - b);

  if (LIMIT > 0) {
    clusterIds = clusterIds.slice(0, LIMIT);
  }

  console.log(`[clusters] Processing ${clusterIds.length} clusters`);

  // Connect to Neo4j (optional)
  const driver = await getNeo4j();

  if (driver) {
    console.log('[neo4j] Connected');
  } else if (!NO_NEO4J) {
    console.log('[neo4j] Not connected — graph writes skipped');
  }

  let written = 0;
  let skipped = 0;
  let failed = 0;

  const t0 = Date.now();

  for (const clusterId of clusterIds) {
    try {
      // Check if summary already exists and is current
      if (!FORCE) {
        const existing = await redis.get(`cluster:summary:${clusterId}`);

        if (existing) {
          try {
            const parsed = JSON.parse(existing);

            if (
              parsed.trainedAt === trainedAt &&
              String(parsed.clusterCount ?? '') === String(meta.clusterCount ?? '')
            ) {
              skipped++;
              process.stdout.write('.');
              continue;
            }
          } catch {
            // Parse error — regenerate.
          }
        }
      }

      // Fetch representative chunks from Qdrant
      const points = await qdrantScroll(
        {
          must: [
            {
              key: 'community_id',
              match: {
                value: clusterId,
              },
            },
          ],
        },
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

            `- top files: ${
              topFiles.length
                ? topFiles
                    .map(
                      (f, i) =>
                        `${i + 1}. ${f.filePath} [PR ${Number(f.pageRank ?? 0).toFixed(
                          4
                        )}, blend ${Number(f.karpathyBlend ?? 0).toFixed(4)}]`
                    )
                    .join(' | ')
                : 'none'
            }`,
          ].join('\n')
        : 'none available';

      if (!SKIP_LLM) {
        try {
          summary = await summarizeCluster(clusterId, points, authorityLine);
        } catch (e) {
          console.warn(`\n[cluster ${clusterId}] LLM failed: ${e.message} — using fallback`);
        }
      }

      const filePaths = [
        ...new Set(
          points
            .map((pt) => pt.payload?.file_path ?? pt.payload?.path ?? pt.payload?.canonical_source_ref ?? pt.payload?.source_ref)
            .filter(Boolean)
        ),
      ];

      const topFilePaths = [
        ...new Set(topFiles.map((f) => f.filePath).filter(Boolean)),
      ];

      const mergedFilePaths = [...new Set([...filePaths, ...topFilePaths])];

      const record = JSON.stringify({
        summary,
        clusterId,
        size: points.length,
        clusterCount: Number(meta.clusterCount ?? 0),
        filePaths: mergedFilePaths.slice(0, 30),
        authority,
        pageRankTop5: topFiles,
        trainedAt,
        updatedAt: new Date().toISOString(),
      });

      // Write to Redis (two key formats for compatibility)
      await redis.setex(`cluster:summary:${clusterId}`, 6 * 3600, record);

      await redis.setex(`ace:cluster:summary:${clusterId}`, 6 * 3600, summary);

      // Write to Neo4j
      if (driver && mergedFilePaths.length > 0) {
        await writeNeo4jCluster(driver, clusterId, summary, mergedFilePaths, trainedAt, points.length);
      }

      written++;
      process.stdout.write('✓');
    } catch (e) {
      failed++;
      process.stdout.write('✗');

      if (process.env.DEBUG) {
        console.error(`\n[cluster ${clusterId}]`, e.message);
      }
    }
  }

  const duration = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n\n=== Done in ${duration}s ===`);

  console.log(`  Written: ${written}`);
  console.log(`  Skipped: ${skipped} (cached or too small)`);
  console.log(`  Failed:  ${failed}`);

  if (driver) {
    console.log('  Neo4j:   BELONGS_TO_CLUSTER edges written for all written clusters');
  }

  if (driver) {
    await neo4jDriver.close().catch(() => {});
  }

}

main()
  .catch((e) => {
    console.error('[fatal]', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await redis.quit().catch(() => {});
  });
