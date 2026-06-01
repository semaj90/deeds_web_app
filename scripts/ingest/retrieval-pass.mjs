#!/usr/bin/env node
/**
 * retrieval-pass.mjs
 *
 * Full-stack retrieval pipeline:
 *   1. Embed query via Ollama /api/embed (embeddinggemma:latest) with Redis L1 cache
 *   2. Qdrant ANN search on codebase_chunks_768 (content vector)
 *   3. Neo4j neighbor expansion (IMPORTS / SIMILAR_TOPOLOGY edges)
 *   4. Re-rank combined hits by authority score (Karpathy gpu:karpathy:scores)
 *   5. Cache result packet in Redis (ace:retrieval:packet:{queryHash})
 *   6. Langfuse trace (if LANGFUSE_SECRET_KEY set)
 *
 * Usage:
 *   node scripts/ingest/retrieval-pass.mjs "what handles ACE context assembly?"
 *   node scripts/ingest/retrieval-pass.mjs --collection=codebase_chunks_768 --top=20 "redis cache"
 *   node scripts/ingest/retrieval-pass.mjs --dry-run "test query"   # skip writes
 */

import crypto from 'crypto';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { QdrantClient } from '@qdrant/js-client-rest';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const REDIS_URL  = process.env.REDIS_URL  || 'redis://localhost:6379';
const NEO4J_URL  = process.env.NEO4J_URL  || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || process.env.NEO4J_PASSWORD || 'neo4j';
const LANGFUSE_URL    = process.env.LANGFUSE_URL    || 'http://localhost:3030';
const LANGFUSE_KEY    = process.env.LANGFUSE_SECRET_KEY || process.env.LANGFUSE_API_KEY || '';
const EMBED_MODEL     = process.env.EMBED_MODEL     || 'embeddinggemma:latest';

const args = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const NO_QDRANT_WRITE = args.includes('--no-qdrant-write');
const NO_NEO4J_WRITE = args.includes('--no-neo4j-write');
const NO_REDIS_WRITE = args.includes('--no-redis-write');
const NO_POSTGRES_WRITE = args.includes('--no-postgres-write');
const NO_LANGFUSE_WRITE = args.includes('--no-langfuse-write');
const TOP        = parseInt(args.find(a => a.startsWith('--top='))?.split('=')[1] ?? '15', 10);
const COLLECTION = args.find(a => a.startsWith('--collection='))?.split('=')[1] ?? 'codebase_chunks_768';
const QUERY      = args.filter(a => !a.startsWith('--')).join(' ') || 'ACE context assembly';

const EMBED_CACHE_TTL = 3600;    // Redis embed cache: 1h
const RESULT_CACHE_TTL = 300;    // Redis result packet cache: 5min

// ── Redis client (lazy, no reconnect loop) ────────────────────────────────────

let redisClient = null;
async function getRedis() {
  if (redisClient) return redisClient;
  try {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(REDIS_URL, {
      lazyConnect: true, maxRetriesPerRequest: 1,
      enableOfflineQueue: false, retryStrategy: () => null,
    });
    r.on('error', () => {});
    await r.connect();
    redisClient = r;
    return r;
  } catch {
    return null;
  }
}

// ── Embedding via Ollama with Redis L1 cache ──────────────────────────────────

async function embedText(text) {
  const cacheKey = `emb:${EMBED_MODEL}:${createHash('sha256').update(text).digest('hex').slice(0, 32)}`;
  const redis = await getRedis();
  if (redis) {
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);
  }

  const resp = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Ollama embed failed: ${resp.status}`);
  const data = await resp.json();
  const vec = data.embeddings?.[0] ?? data.embedding;
  if (!vec) throw new Error('No embedding in Ollama response');

  if (redis && !DRY_RUN) {
    await redis.setex(cacheKey, EMBED_CACHE_TTL, JSON.stringify(vec)).catch(() => {});
  }
  return vec;
}

// ── Qdrant ANN search ─────────────────────────────────────────────────────────

async function qdrantSearch(vec, top) {
  const client = new QdrantClient({ url: QDRANT_URL });
  const resp = await client.search(COLLECTION, {
    vector: { name: 'content', vector: vec },
    limit: top,
    with_payload: true,
    with_vector: false,
  });
  return resp.map(pt => ({
    id: pt.id,
    score: pt.score,
    filePath: pt.payload?.file_path ?? '',
    chunkIndex: pt.payload?.chunk_index ?? 0,
    content: (pt.payload?.content ?? '').slice(0, 300),
    tags: pt.payload?.tags ?? [],
    feature: pt.payload?.domain ?? pt.payload?.feature ?? 'unknown',
    gpuCluster: pt.payload?.gpuCluster ?? null,
    source: 'qdrant',
  }));
}

// ── Neo4j neighbor expansion ──────────────────────────────────────────────────

async function neo4jExpand(filePaths, maxNeighbors = 5) {
  if (!filePaths.length) return [];
  let driver;
  try {
    const neo4j = await import('neo4j-driver');
    const d = neo4j.default || neo4j;
    driver = d.driver(NEO4J_URL, d.auth.basic(NEO4J_USER, NEO4J_PASS), { encrypted: false });
    const session = driver.session({ database: 'neo4j' });
    try {
      const result = await session.run(
        `UNWIND $paths AS fp
         MATCH (f:CodebaseFile {relativePath: fp})
         OPTIONAL MATCH (f)-[:IMPORTS]->(dep:CodebaseFile)
         OPTIONAL MATCH (caller:CodebaseFile)-[:IMPORTS]->(f)
         WITH fp, collect(DISTINCT dep.relativePath)[0..$max] AS deps,
              collect(DISTINCT caller.relativePath)[0..$max] AS callers
         RETURN fp, deps, callers`,
        { paths: filePaths, max: neo4j.default?.integer ? neo4j.default.int(maxNeighbors) : maxNeighbors }
      );
      const neighbors = [];
      for (const rec of result.records) {
        const deps    = rec.get('deps')    ?? [];
        const callers = rec.get('callers') ?? [];
        for (const p of [...deps, ...callers]) {
          if (p && !filePaths.includes(p)) neighbors.push({ filePath: p, source: 'neo4j' });
        }
      }
      await session.close();
      return neighbors.slice(0, 20);
    } finally {
      await session.close().catch(() => {});
    }
  } catch (e) {
    return [];
  } finally {
    if (driver) await driver.close().catch(() => {});
  }
}

// ── Karpathy authority re-rank ─────────────────────────────────────────────────

async function applyAuthorityBoost(hits) {
  const redis = await getRedis();
  if (!redis) return hits;
  const keys = hits.map(h => h.filePath).filter(Boolean);
  if (!keys.length) return hits;
  const scores = await redis.hmget('gpu:karpathy:scores', ...keys).catch(() => keys.map(() => null));
  return hits.map((h, i) => {
    const raw = scores[i];
    if (!raw) return h;
    try {
      const { blend } = JSON.parse(raw);
      return { ...h, authorityBlend: blend, score: h.score * 0.7 + Math.min(blend / 10, 1) * 0.3 };
    } catch { return h; }
  }).sort((a, b) => b.score - a.score);
}

// ── Cache result packet ────────────────────────────────────────────────────────

async function cacheResultPacket(queryHash, packet) {
  const redis = await getRedis();
  if (!redis || DRY_RUN || NO_REDIS_WRITE) return;
  await redis.setex(`ace:retrieval:packet:${queryHash}`, RESULT_CACHE_TTL, JSON.stringify(packet)).catch(() => {});
}

// ── Langfuse trace ─────────────────────────────────────────────────────────────

async function langfuseTrace(traceData) {
  if (!LANGFUSE_KEY || DRY_RUN || NO_LANGFUSE_WRITE) return;
  try {
    await fetch(`${LANGFUSE_URL}/api/public/ingestion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LANGFUSE_KEY}` },
      body: JSON.stringify({
        batch: [{
          type: 'trace-create',
          body: {
            id: traceData.traceId,
            name: 'retrieval-pass',
            input: traceData.query,
            metadata: { collection: COLLECTION, topK: TOP, durationMs: traceData.durationMs },
          },
        }],
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  const queryHash = createHash('sha256').update(QUERY + COLLECTION + TOP).digest('hex').slice(0, 32);

  console.log(`\n🔍 Retrieval Pass`);
  console.log(`Query:      "${QUERY}"`);
  console.log(`Collection: ${COLLECTION} | Top: ${TOP} | Dry-run: ${DRY_RUN}\n`);

  // Check Redis result cache first
  const redis = await getRedis();
  if (redis) {
    const cached = await redis.get(`ace:retrieval:packet:${queryHash}`).catch(() => null);
    if (cached) {
      const packet = JSON.parse(cached);
      console.log(`✅ Cache hit (ace:retrieval:packet:${queryHash})`);
      printResults(packet.hits);
      return;
    }
  }

  // 1. Embed
  let vec;
  try {
    process.stdout.write('Embedding query via Ollama... ');
    vec = await embedText(QUERY);
    console.log(`✅ ${vec.length}-dim vector`);
  } catch (e) {
    console.error(`❌ Embed failed: ${e.message}`);
    process.exit(1);
  }

  // 2. Qdrant ANN
  let qdrantHits = [];
  try {
    process.stdout.write(`Searching Qdrant ${COLLECTION}... `);
    qdrantHits = await qdrantSearch(vec, TOP);
    console.log(`✅ ${qdrantHits.length} hits`);
  } catch (e) {
    console.warn(`⚠️  Qdrant search failed: ${e.message}`);
  }

  // 3. Neo4j neighbor expansion
  const seedPaths = [...new Set(qdrantHits.map(h => h.filePath).filter(Boolean))].slice(0, 5);
  let neo4jNeighbors = [];
  try {
    process.stdout.write('Neo4j neighbor expansion... ');
    neo4jNeighbors = await neo4jExpand(seedPaths);
    console.log(`✅ ${neo4jNeighbors.length} neighbors`);
  } catch (e) {
    console.warn(`⚠️  Neo4j expansion failed: ${e.message}`);
  }

  // 4. Authority re-rank
  const allHits = [
    ...qdrantHits,
    ...neo4jNeighbors.map(n => ({ ...n, score: 0.5 })),
  ];
  const ranked = await applyAuthorityBoost(allHits);

  // 5. Cache packet
  const durationMs = Date.now() - t0;
  const packet = { query: QUERY, queryHash, collection: COLLECTION, hits: ranked.slice(0, TOP), durationMs, generatedAt: new Date().toISOString() };
  await cacheResultPacket(queryHash, packet);

  // 6. Langfuse
  await langfuseTrace({ traceId: `retrieval-${queryHash}`, query: QUERY, durationMs });

  if (DRY_RUN) {
    emitDryRunArtifacts({
      query: QUERY,
      queryHash,
      collection: COLLECTION,
      top: TOP,
      durationMs,
      vecDims: vec.length,
      flags: {
        dryRun: DRY_RUN,
        noQdrantWrite: NO_QDRANT_WRITE,
        noNeo4jWrite: NO_NEO4J_WRITE,
        noRedisWrite: NO_REDIS_WRITE,
        noPostgresWrite: NO_POSTGRES_WRITE,
        noLangfuseWrite: NO_LANGFUSE_WRITE,
      },
      qdrantHits,
      neo4jNeighbors,
      ranked,
      redisAvailable: Boolean(redis),
      langfuseReady: Boolean(LANGFUSE_KEY),
    });
  }

  printResults(ranked.slice(0, TOP));
  console.log(`\n⏱  ${durationMs}ms | Qdrant:${qdrantHits.length} Neo4j:${neo4jNeighbors.length} → ranked:${ranked.length}`);
  if (!DRY_RUN && redis) console.log(`💾 Packet cached at ace:retrieval:packet:${queryHash} (${RESULT_CACHE_TTL}s TTL)`);
}

function emitDryRunArtifacts({
  query,
  queryHash,
  collection,
  top,
  durationMs,
  vecDims,
  flags,
  qdrantHits,
  neo4jNeighbors,
  ranked,
  redisAvailable,
  langfuseReady,
}) {
  const root = process.cwd();
  const tmpDir = path.join(root, '.tmp');
  const reportsDir = path.join(root, 'reports');
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });

  const readiness = ranked.slice(0, top).map((hit, index) => {
    const filePath = String(hit.filePath ?? '');
    const sourceRefValid = Boolean(filePath);
    const qdrantReady = hit.source === 'qdrant';
    const neo4jReady = neo4jNeighbors.some((n) => n.filePath === filePath);
    const redisReady = redisAvailable;
    const langfuseReadyHit = langfuseReady;
    const freshness = sourceRefValid ? 0.8 : 0.2;
    const errorPenalty = sourceRefValid ? 0 : 0.25;
    const readinessScore = Math.max(
      0,
      Math.min(
        1,
        Number(hit.score ?? 0) * 0.45 +
          (qdrantReady ? 0.2 : 0) +
          (neo4jReady ? 0.15 : 0) +
          (redisReady ? 0.1 : 0) +
          (langfuseReadyHit ? 0.05 : 0) +
          freshness -
          errorPenalty
      )
    );
    return {
      rank: index + 1,
      sourceRef: filePath || String(hit.id ?? ''),
      sourceRefValid,
      feature_label: hit.feature ?? null,
      qdrantReady,
      neo4jReady,
      redisReady,
      langfuseReady: langfuseReadyHit,
      aliasConfidence: sourceRefValid ? 1 : 0,
      freshness,
      errorPenalty,
      readinessScore: Number(readinessScore.toFixed(4)),
      score: Number((hit.score ?? 0).toFixed(6)),
      filePath: filePath || null,
      authorityBlend: hit.authorityBlend ?? null,
      source: hit.source ?? null,
    };
  });

  const json = {
    generatedAt: new Date().toISOString(),
    query,
    queryHash,
    collection,
    top,
    durationMs,
    vecDims,
    flags,
    counts: {
      qdrantHits: qdrantHits.length,
      neo4jNeighbors: neo4jNeighbors.length,
      ranked: ranked.length,
    },
    readiness,
    notes: [
      'Dry-run only; no external writes were performed.',
      'This report records retrieval-path readiness, not promotion into recommendation storage.',
    ],
  };

  const ndjson = readiness.map((row) => JSON.stringify(row)).join('\n') + (readiness.length ? '\n' : '');
  const md = [
    '# Retrieval Pass Dry Run',
    '',
    `**Generated:** ${json.generatedAt}`,
    `**Query:** ${query}`,
    `**Collection:** ${collection}`,
    `**Top:** ${top}`,
    `**DurationMs:** ${durationMs}`,
    '',
    '## Gate Status',
    '',
    `- Qdrant hits: ${qdrantHits.length}`,
    `- Neo4j neighbors: ${neo4jNeighbors.length}`,
    `- Redis available: ${redisAvailable ? 'yes' : 'no'}`,
    `- Langfuse ready: ${langfuseReady ? 'yes' : 'no'}`,
    `- External writes: disabled`,
    '',
    '## Top Candidates',
    '',
    '| Rank | SourceRef | Feature | Score | Readiness |',
    '|---:|---|---|---:|---:|',
    ...readiness.slice(0, 10).map((row) =>
      `| ${row.rank} | \`${row.sourceRef}\` | ${row.feature_label ?? ''} | ${row.score.toFixed(4)} | ${row.readinessScore.toFixed(4)} |`
    ),
    '',
    '## Notes',
    '',
    '- Qdrant path is read-only in dry-run.',
    '- Neo4j neighbor expansion is read-only in dry-run.',
    '- Redis packet cache is not written in dry-run.',
    '- Langfuse tracing is skipped in dry-run.',
  ].join('\n');

  writeFileSync(path.join(tmpDir, 'retrieval-pass-dry-run.json'), JSON.stringify(json, null, 2));
  writeFileSync(path.join(tmpDir, 'retrieval-pass-dry-run.ndjson'), ndjson);
  writeFileSync(path.join(reportsDir, 'retrieval-pass-dry-run.md'), md);
}

function printResults(hits) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`${'Score'.padEnd(8)} ${'File Path'.padEnd(52)} Feature`);
  console.log(`${'─'.repeat(72)}`);
  for (const h of hits.slice(0, 20)) {
    const score = (h.score ?? 0).toFixed(4);
    const fp = (h.filePath ?? 'N/A').slice(-50).padEnd(52);
    console.log(`${score.padEnd(8)} ${fp} ${h.feature ?? ''}`);
  }
  console.log(`${'─'.repeat(72)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
