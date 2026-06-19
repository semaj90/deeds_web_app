#!/usr/bin/env node
/**
 * scripts/tests/run-replay-breadth-50.mjs
 *
 * Runs 50 queries across 5 buckets against the local HyperRAG packet-rpc endpoint.
 * Outputs detailed trace files for each query and generates summary reports.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ENDPOINT = 'http://127.0.0.1:5173/api/hyperrag/packet-rpc';
const REPORT_DIR = path.join(ROOT, 'docs', 'reports', 'replay');

// Ensure output directories exist
fs.mkdirSync(REPORT_DIR, { recursive: true });

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
  // These will be executed twice: first to prime the cache, then to record a cache-hit.
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
  console.log(`  Starting Replay Breadth Benchmark (50 Queries)`);
  console.log(`======================================================================\n`);

  const results = [];
  let index = 1;

  for (const qSpec of queries) {
    const qHash = crypto.createHash('sha256').update(qSpec.query).digest('hex');
    console.log(`[${index}/50] [Bucket: ${qSpec.bucket}] Query: "${qSpec.query}"`);

    try {
      let data;
      if (qSpec.isCacheRepeat) {
        // Prime the cache first if needed, though golden queries already ran
        // Just execute it with useExactMatchCache: true to get a hit
        const t0 = Date.now();
        data = await runQuery(qSpec.query, true);
        const latency = Date.now() - t0;
        
        console.log(`      -> Cache hits: ${data.trace?.cache_hits ?? 0}, Latency: ${latency}ms`);
      } else {
        const t0 = Date.now();
        data = await runQuery(qSpec.query, true);
        const latency = Date.now() - t0;

        console.log(`      -> Latency: ${latency}ms, Packets: ${data.packets?.length ?? 0}`);
      }

      const hitCount = data.packets?.length ?? 0;
      const cacheHit = (data.trace?.cache_hits ?? 0) > 0;
      
      const resultObj = {
        query: qSpec.query,
        hash: qHash,
        bucket: qSpec.bucket,
        cacheHit,
        packetsReturned: hitCount,
        provenanceCount: data.provenance?.length ?? 0,
        strategy: data.strategy ?? 'fusion',
        trace: data.trace ?? {}
      };

      results.push(resultObj);

      // Write individual trace file
      const tracePath = path.join(REPORT_DIR, `${qHash}.trace.json`);
      fs.writeFileSync(tracePath, JSON.stringify({
        query: qSpec.query,
        hash: qHash,
        bucket: qSpec.bucket,
        timestamp: new Date().toISOString(),
        payload: data
      }, null, 2));

    } catch (e) {
      console.error(`      [✗] Error: ${e.message}`);
      results.push({
        query: qSpec.query,
        hash: qHash,
        bucket: qSpec.bucket,
        error: e.message,
        cacheHit: false,
        packetsReturned: 0,
        provenanceCount: 0,
        strategy: 'failed',
        trace: {}
      });
    }

    index++;
    // Small sleep to let dev server breathe
    await new Promise(r => setTimeout(r, 100));
  }

  // Calculate statistics
  const successCount = results.filter(r => r.strategy !== 'failed').length;
  const cacheHitCount = results.filter(r => r.cacheHit).length;
  const totalPackets = results.reduce((sum, r) => sum + r.packetsReturned, 0);

  const summary = {
    total_queries: results.length,
    successful_queries: successCount,
    failed_queries: results.length - successCount,
    cache_hits: cacheHitCount,
    total_packets_returned: totalPackets,
    avg_packets_per_query: successCount > 0 ? (totalPackets / successCount).toFixed(2) : 0,
    timestamp: new Date().toISOString()
  };

  // Write summary json
  fs.writeFileSync(
    path.join(ROOT, 'docs', 'reports', 'replay-trace-summary.json'),
    JSON.stringify({ summary, results }, null, 2)
  );

  // Write summary markdown
  let md = `# Replay Breadth Benchmark Report

Generated at: ${new Date().toISOString()}

## Summary Statistics

| Metric | Value |
|---|---|
| Total Queries Run | ${summary.total_queries} |
| Successful Queries | ${summary.successful_queries} |
| Failed Queries | ${summary.failed_queries} |
| Cache Hits (Bitfrost Warm) | ${summary.cache_hits} |
| Total Packets Retrieved | ${summary.total_packets_returned} |
| Avg Packets / Query | ${summary.avg_packets_per_query} |

## Query Execution Table

| # | Query | Bucket | Cache Hit | Packets | Strategy | Status |
|---|---|---|---|---|---|---|
`;

  results.forEach((r, idx) => {
    md += `| ${idx + 1} | \`${r.query}\` | ${r.bucket} | ${r.cacheHit ? '✅ YES' : '❌ NO'} | ${r.packetsReturned} | ${r.strategy} | ${r.error ? `⚠️ Error: ${r.error}` : '✅ PASS'} |\n`;
  });

  fs.writeFileSync(
    path.join(ROOT, 'docs', 'reports', 'replay-trace.md'),
    md
  );

  console.log(`\n======================================================================`);
  console.log(`  Replay Breadth Completed`);
  console.log(`  - Total run: ${results.length}`);
  console.log(`  - Successful: ${successCount}`);
  console.log(`  - Cache hits: ${cacheHitCount}`);
  console.log(`  - Reports written to docs/reports/`);
  console.log(`======================================================================\n`);
}

main().catch(err => {
  console.error('Fatal benchmark runner crash:', err);
  process.exit(1);
});
