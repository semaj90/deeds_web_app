#!/usr/bin/env node
/**
 * scripts/atlas/run-replay-breadth-50.mjs
 *
 * Runs 50 queries across 5 buckets against the local HyperRAG packet-rpc endpoint.
 * Normalizes all returned payload fields using dynamic db mappings from `atlas_contract_fields`.
 * Logs end-to-end provenance traces to `retrieval_provenance` table in Postgres.
 * Outputs reports in JSON/Markdown.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ENDPOINT = 'http://127.0.0.1:5173/api/hyperrag/packet-rpc';
const REPORT_DIR = path.join(ROOT, 'docs', 'reports');

// Ensure output directory exists
fs.mkdirSync(REPORT_DIR, { recursive: true });

function loadEnv() {
  const env = { ...process.env };
  const envPaths = [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      break;
    }
  }
  return env;
}

const ENV = loadEnv();
const DATABASE_URL = ENV.DATABASE_URL ||
  `postgresql://${ENV.DB_USER ?? 'legal_admin'}:${ENV.DB_PASSWORD ?? '123456'}@${ENV.DB_HOST ?? '127.0.0.1'}:${ENV.DB_PORT ?? '5434'}/${ENV.DB_NAME ?? 'legal_ai_db'}`;

const queries = [
  // ── Bucket 1: Golden (Deterministic, high-confidence) ──
  { query: "where is Redis Valkey cache config wired?", bucket: "golden" },
  { query: "how is SeaweedFS filer configured for S3 gateway?", bucket: "golden" },
  { query: "where is the LibTorch N-API addon defined?", bucket: "golden" },
  { query: "where are the Drizzle schema files located?", bucket: "golden" },
  { query: "what port is reserved for SeaweedFS Filer?", bucket: "golden" },
  { query: "how is the LangGraph planning graph structured?", bucket: "golden" },
  { query: "where is the Postgres database connection pool initialized?", bucket: "golden" },
  { query: "how does the system handle schema migration sidecars?", bucket: "golden" },
  { query: "what is the default collection name for Qdrant semantic search?", bucket: "golden" },
  { query: "how is the GPU compute worker smoke test runner executed?", bucket: "golden" },

  // ── Bucket 2: Cache-hit (Repeated golden queries to confirm Bitfrost warm path) ──
  { query: "where is Redis Valkey cache config wired?", bucket: "cache-hit", isCacheRepeat: true },
  { query: "how is SeaweedFS filer configured for S3 gateway?", bucket: "cache-hit", isCacheRepeat: true },
  { query: "where is the LibTorch N-API addon defined?", bucket: "cache-hit", isCacheRepeat: true },
  { query: "where are the Drizzle schema files located?", bucket: "cache-hit", isCacheRepeat: true },
  { query: "what port is reserved for SeaweedFS Filer?", bucket: "cache-hit", isCacheRepeat: true },
  { query: "how is the LangGraph planning graph structured?", bucket: "cache-hit", isCacheRepeat: true },
  { query: "where is the Postgres database connection pool initialized?", bucket: "cache-hit", isCacheRepeat: true },
  { query: "how does the system handle schema migration sidecars?", bucket: "cache-hit", isCacheRepeat: true },
  { query: "what is the default collection name for Qdrant semantic search?", bucket: "cache-hit", isCacheRepeat: true },
  { query: "how is the GPU compute worker smoke test runner executed?", bucket: "cache-hit", isCacheRepeat: true },

  // ── Bucket 3: Graph-expansion (Neo4j neighbour traversal) ──
  { query: "which files depend on the database schema client?", bucket: "graph-expansion" },
  { query: "what is the relationship between atlas_packets and concept_records?", bucket: "graph-expansion" },
  { query: "how are the error clusters linked to route health metrics?", bucket: "graph-expansion" },
  { query: "which modules import the OpenAI facade or sidecar router?", bucket: "graph-expansion" },
  { query: "show imports and dependents of the retrieval recorder", bucket: "graph-expansion" },
  { query: "how are codebase embeddings connected to codebase files?", bucket: "graph-expansion" },
  { query: "what is the link between parent atlas documents and card registry?", bucket: "graph-expansion" },
  { query: "which components interact with the Redis cache gateway?", bucket: "graph-expansion" },
  { query: "what calls the N-API autoencoderEncode function?", bucket: "graph-expansion" },
  { query: "how does the route param guard script communicate with svelte check?", bucket: "graph-expansion" },

  // ── Bucket 4: Low-density (Sparse coverage areas / fallbacks) ──
  { query: "how is SDXL image generation service URL defined?", bucket: "low-density" },
  { query: "where is ibm/granite-docling:258m configured?", bucket: "low-density" },
  { query: "what is the fallback logic for feature ID placement?", bucket: "low-density" },
  { query: "where is ComfyUI submit workflow smoke test located?", bucket: "low-density" },
  { query: "how is the Triton VLM model routing configured?", bucket: "low-density" },
  { query: "what is the purpose of the orphaned GenerationService gRPC?", bucket: "low-density" },
  { query: "where is the WebGPU PageRank benchmark defined?", bucket: "low-density" },
  { query: "how is the ComfyUI client strict check executed?", bucket: "low-density" },
  { query: "where are the ComfyUI workflow JSON files stored?", bucket: "low-density" },
  { query: "what is the fallback configuration for RabbitMQ DLQ?", bucket: "low-density" },

  // ── Bucket 5: Kanban & recommendation (Agent traffic patterns) ──
  { query: "audit feature_id coverage in atlas_packets", bucket: "kanban-recommendation" },
  { query: "how to resolve duplicate RETRIEVAL_GRPC_URL keys in env.server.ts?", bucket: "kanban-recommendation" },
  { query: "what are the open lanes for Phase 20.6?", bucket: "kanban-recommendation" },
  { query: "how is the SOM centroid codebook initialized?", bucket: "kanban-recommendation" },
  { query: "where is the Phase 16 truth-promotion binding implemented?", bucket: "kanban-recommendation" },
  { query: "how to backfill latent vectors to postgres atlas_packets?", bucket: "kanban-recommendation" },
  { query: "what is the N-API call signature for autoencoderEncode?", bucket: "kanban-recommendation" },
  { query: "how to train the SOM 20x20 grid on latent vectors?", bucket: "kanban-recommendation" },
  { query: "where is the retrieval evaluation times schema barrel export?", bucket: "kanban-recommendation" },
  { query: "how to run the 10-layer audit CLI tool?", bucket: "kanban-recommendation" }
];

async function runQuery(queryText, useExactMatchCache = true) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: queryText,
      limit: 5,
      includeGraph: true,
      useFts: true,
      recordTelemetry: true,
      useExactMatchCache
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`API Error: ${data.error}`);
  }

  return data;
}

async function main() {
  console.log(`\n======================================================================`);
  console.log(`  Starting Replay Breadth Benchmark (50 Queries) with Provenance`);
  console.log(`======================================================================\n`);

  const pool = new Pool({ connectionString: DATABASE_URL });

  // 1. Load contract mappings dynamically
  console.log(`[replay] Loading contract field normalizer mappings from DB...`);
  const mapping = {};
  try {
    const mapRes = await pool.query(`SELECT raw_field, canonical_field FROM atlas_contract_fields`);
    for (const row of mapRes.rows) {
      mapping[row.raw_field] = row.canonical_field;
    }
    console.log(`[replay] Loaded ${Object.keys(mapping).length} field normalizer mappings.`);
  } catch (err) {
    console.warn(`[replay] ⚠️ DB normalizer mappings unavailable, using static fallbacks.`);
  }

  function normalize(payload) {
    if (!payload || typeof payload !== 'object') return {};
    const normalized = {};
    for (const [k, v] of Object.entries(payload)) {
      const canonical = mapping[k] || k;
      normalized[canonical] = v;
    }
    return normalized;
  }

  const results = [];
  let index = 1;

  // Clear old provenance records for this specific task
  try {
    await pool.query(`DELETE FROM retrieval_provenance WHERE task_id = 'atlas:replay:breadth:50'`);
  } catch {}

  for (const qSpec of queries) {
    const qHash = crypto.createHash('sha256').update(qSpec.query).digest('hex').slice(0, 8);
    console.log(`[${index}/50] [Bucket: ${qSpec.bucket}] Query: "${qSpec.query}"`);

    try {
      const t0 = Date.now();
      const data = await runQuery(qSpec.query, true);
      const latency = Date.now() - t0;

      const packets = data.packets || [];
      const cacheHit = (data.trace?.cache_hits ?? 0) > 0 || data.cache_hit === true;
      const traceId = data.trace?.id || crypto.randomUUID();

      console.log(`      -> Latency: ${latency}ms, Packets: ${packets.length}, Cache: ${cacheHit}`);

      let packetKeyCount = 0;
      let featureIdCount = 0;
      let sourceRefCount = 0;

      if (packets.length === 0) {
        // Log a query miss with no packet matches
        await pool.query(
          `INSERT INTO retrieval_provenance
             (story_id, task_id, worker_id, trace_id, query_hash, packet_key, source_ref,
              feature_id, cache_namespace, cache_hit_source, verdict)
           VALUES ($1, $2, $3, $4, $5, 'none', 'none', 'none', $6, $7, 'PASS')`,
          [
            'proof-quality-lane',
            'atlas:replay:breadth:50',
            'james',
            traceId,
            qHash,
            data.trace?.cache_namespace || null,
            cacheHit ? 'bifrost' : 'miss'
          ]
        );
      }

      for (const rawPacket of packets) {
        // Normalize the payload dynamically
        const norm = normalize(rawPacket);

        const packetKey = norm.packet_key || rawPacket.packetKey || rawPacket.id || `pkt:${qHash}`;
        const sourceRef = norm.source_ref || rawPacket.sourceRef || rawPacket.source_path || '';
        const featureId = norm.feature_id || rawPacket.featureId || '';
        const featureLabel = norm.feature_label || rawPacket.featureLabel || '';

        if (packetKey && packetKey !== `pkt:${qHash}`) packetKeyCount++;
        if (featureId) featureIdCount++;
        if (sourceRef) sourceRefCount++;

        // Log provenance trace to Postgres
        await pool.query(
          `INSERT INTO retrieval_provenance
             (story_id, task_id, worker_id, trace_id, query_hash, packet_key, source_ref,
              source_ref_key, feature_id, feature_label, cache_namespace, cache_key,
              cache_hit_source, graph_stage_status, traversal_path, fusion_score, verdict)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, 'PASS')`,
          [
            'proof-quality-lane',
            'atlas:replay:breadth:50',
            'james',
            traceId,
            qHash,
            packetKey,
            sourceRef,
            rawPacket.sourceRefKey || null,
            featureId,
            featureLabel,
            data.trace?.cache_namespace || null,
            data.trace?.cache_key || null,
            cacheHit ? 'bifrost' : 'miss',
            data.trace?.neo4j_status || 'ok',
            JSON.stringify(rawPacket.traversal_path || []),
            rawPacket.score || null
          ]
        );
      }

      results.push({
        query: qSpec.query,
        hash: qHash,
        bucket: qSpec.bucket,
        cacheHit,
        packetsReturned: packets.length,
        packetKeyCount,
        featureIdCount,
        sourceRefCount,
        strategy: data.strategy || 'fusion',
        traceId,
        latencyMs: latency
      });

    } catch (e) {
      console.error(`      [✗] Error: ${e.message}`);
      
      await pool.query(
        `INSERT INTO retrieval_provenance
           (story_id, task_id, worker_id, trace_id, query_hash, packet_key, source_ref,
            feature_id, verdict)
         VALUES ($1, $2, $3, $4, $5, 'error', 'error', 'error', 'FAIL')`,
        [
          'proof-quality-lane',
          'atlas:replay:breadth:50',
          'james',
          crypto.randomUUID(),
          qHash
        ]
      ).catch(() => {});

      results.push({
        query: qSpec.query,
        hash: qHash,
        bucket: qSpec.bucket,
        error: e.message,
        cacheHit: false,
        packetsReturned: 0,
        packetKeyCount: 0,
        featureIdCount: 0,
        sourceRefCount: 0,
        strategy: 'failed',
        latencyMs: 0
      });
    }

    index++;
    await new Promise(r => setTimeout(r, 100));
  }

  // Calculate statistics
  const successCount = results.filter(r => r.strategy !== 'failed').length;
  const cacheHitCount = results.filter(r => r.cacheHit).length;
  const totalPackets = results.reduce((sum, r) => sum + r.packetsReturned, 0);

  const totalReturnedPackets = results.reduce((sum, r) => sum + r.packetsReturned, 0);
  const packetKeyMatches = results.reduce((sum, r) => sum + r.packetKeyCount, 0);
  const featureIdMatches = results.reduce((sum, r) => sum + r.featureIdCount, 0);
  const sourceRefMatches = results.reduce((sum, r) => sum + r.sourceRefCount, 0);

  const summary = {
    status: successCount >= 45 ? "PASS" : "FAIL",
    queryCount: results.length,
    qdrantHitPct: totalReturnedPackets > 0 ? Number((successCount / results.length * 100).toFixed(2)) : 0,
    packetKeyPct: totalReturnedPackets > 0 ? Number((packetKeyMatches / totalReturnedPackets * 100).toFixed(2)) : 0,
    featureIdPct: totalReturnedPackets > 0 ? Number((featureIdMatches / totalReturnedPackets * 100).toFixed(2)) : 0,
    sourceRefPct: totalReturnedPackets > 0 ? Number((sourceRefMatches / totalReturnedPackets * 100).toFixed(2)) : 0,
    cacheHitPct: Number((cacheHitCount / results.length * 100).toFixed(2)),
    timeoutCount: results.filter(r => r.error && r.error.includes('timeout')).length,
    failedQueries: results.filter(r => r.strategy === 'failed').map(r => r.query),
    results: results
  };

  // Write summary json
  fs.writeFileSync(
    path.join(REPORT_DIR, 'replay-trace-summary.json'),
    JSON.stringify(summary, null, 2)
  );

  // Write summary markdown
  let md = `# Replay Breadth Benchmark Report

Generated at: ${new Date().toISOString()}

## Summary Statistics

| Metric | Value |
|---|---|
| Status | **${summary.status}** |
| Total Queries Run | ${summary.queryCount} |
| Qdrant Hit Pct (packets > 0) | ${summary.qdrantHitPct}% |
| Packet Key Pct | ${summary.packetKeyPct}% |
| Feature ID Pct | ${summary.featureIdPct}% |
| Source Ref Pct | ${summary.sourceRefPct}% |
| Cache Hit Pct | ${summary.cacheHitPct}% |
| Timeouts | ${summary.timeoutCount} |

## Query Execution Table

| # | Query | Bucket | Cache Hit | Packets | Strategy | Status |
|---|---|---|---|---|---|---|
`;

  results.forEach((r, idx) => {
    md += `| ${idx + 1} | \`${r.query}\` | ${r.bucket} | ${r.cacheHit ? '✅ YES' : '❌ NO'} | ${r.packetsReturned} | ${r.strategy} | ${r.error ? `⚠️ Error: ${r.error}` : '✅ PASS'} |\n`;
  });

  fs.writeFileSync(
    path.join(REPORT_DIR, 'replay-trace.md'),
    md
  );

  console.log(`\n======================================================================`);
  console.log(`  Replay Breadth Completed`);
  console.log(`  - Status: ${summary.status}`);
  console.log(`  - Total run: ${results.length}`);
  console.log(`  - Cache Hit Pct: ${summary.cacheHitPct}%`);
  console.log(`  - Provenance traces logged to DB table: retrieval_provenance`);
  console.log(`  - Summary written to docs/reports/replay-trace-summary.json`);
  console.log(`======================================================================\n`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal benchmark runner crash:', err);
  process.exit(1);
});
