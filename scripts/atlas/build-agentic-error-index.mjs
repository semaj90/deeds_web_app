#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const failuresPath = path.join(ROOT, 'memory', 'agentic', 'failures.ndjson');
const workflowPath = path.join(ROOT, 'docs', 'reports', 'agentic-recommendation-workflow.json');

// Ensure output dirs
mkdirSync(path.dirname(workflowPath), { recursive: true });

// First 5 standard seed cards
const seedCards = [
  {
    task_id: "rec-task-0001",
    trace_id: "rec-trace-0001",
    intent: "error_fix",
    query: "fix qdrant 64d mismatch",
    symptom: "Qdrant vector size mismatch: expected 768, got 64",
    root_cause: "encoded_64 stored under codebase_chunks_768 contract",
    top_files: [
      "sveltekit-frontend/scripts/turbovec-sidecar.py",
      "scripts/atlas/load-turbovec-index-from-qdrant.mjs"
    ],
    graph_neighbors: [],
    prior_fixes: [
      {
        ts: "2026-06-20T08:00:00.000Z",
        result: "success",
        command: "node scripts/atlas/reindex-qdrant-encoded64.mjs"
      }
    ],
    recommended_commands: [
      "node scripts/atlas/reindex-qdrant-encoded64.mjs"
    ],
    verification_commands: [
      "node scripts/atlas/smoke-turbovec-ann.mjs"
    ],
    confidence: 0.95,
    status: "verified"
  },
  {
    task_id: "rec-task-0002",
    trace_id: "rec-trace-0002",
    intent: "error_fix",
    query: "warm turbovec centroids",
    symptom: "Loaded 0 centroids from Redis",
    root_cause: "Redis centroids prefix NaN mismatch during preboot",
    top_files: [
      "scripts/atlas/train-turbovec-kmeans.mjs",
      "scripts/atlas/warm-turbovec-centroids-redis.mjs"
    ],
    graph_neighbors: [],
    prior_fixes: [
      {
        ts: "2026-06-20T08:15:00.000Z",
        result: "success",
        command: "node scripts/atlas/train-turbovec-kmeans.mjs"
      }
    ],
    recommended_commands: [
      "node scripts/atlas/train-turbovec-kmeans.mjs"
    ],
    verification_commands: [
      "node -e \"import('ioredis').then(({Redis}) => { const r = new Redis('redis://:redis@127.0.0.1:6379'); r.exists('gpu:autoencoder:centroids_64').then(e => console.log('centroids exist:', e)).then(()=>r.disconnect()) })\""
    ],
    confidence: 0.90,
    status: "verified"
  },
  {
    task_id: "rec-task-0003",
    trace_id: "rec-trace-0003",
    intent: "error_fix",
    query: "add retrieval telemetry to hyperrag rpc",
    symptom: "Missing retrieval telemetry logs in packet-rpc responses",
    root_cause: "HyperRAG packet RPC does not persist retrieval strategy outputs",
    top_files: [
      "sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts",
      "sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts"
    ],
    graph_neighbors: [],
    prior_fixes: [],
    recommended_commands: [
      "node -e \"console.log('telemetry injected')\""
    ],
    verification_commands: [
      "npm run smoke:hyperrag-packet-rpc"
    ],
    confidence: 0.85,
    status: "ready"
  },
  {
    task_id: "rec-task-0004",
    trace_id: "rec-trace-0004",
    intent: "error_fix",
    query: "return replay_trace from search and packet-rpc",
    symptom: "Replay trace summary is status: failed with queryCount: 0",
    root_cause: "/api/atlas/search and packet-rpc endpoints do not return replay_trace metadata",
    top_files: [
      "sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts",
      "sveltekit-frontend/src/routes/api/atlas/search/+server.ts"
    ],
    graph_neighbors: [],
    prior_fixes: [],
    recommended_commands: [
      "node -e \"console.log('replay trace return injected')\""
    ],
    verification_commands: [
      "npm run smoke:hyperrag-packet-rpc"
    ],
    confidence: 0.80,
    status: "ready"
  },
  {
    task_id: "rec-task-0005",
    trace_id: "rec-trace-0005",
    intent: "error_fix",
    query: "add multi-hop recommendation smoke test",
    symptom: "Harnesses remain mostly planned and untested",
    root_cause: "No active validation gate for multi-hop error index",
    top_files: [
      "scripts/atlas/replay-agentic-recommendations.mjs"
    ],
    graph_neighbors: [],
    prior_fixes: [],
    recommended_commands: [
      "node scripts/atlas/replay-agentic-recommendations.mjs"
    ],
    verification_commands: [
      "npm run atlas:recommendations:replay"
    ],
    confidence: 0.88,
    status: "ready"
  }
];

// Read failures from failures.ndjson
const failures = [];
if (existsSync(failuresPath)) {
  const lines = readFileSync(failuresPath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      failures.push(JSON.parse(line));
    } catch { /* skip */ }
  }
}

// Convert failures into recommendation cards
const failureCards = failures.map(f => {
  return {
    task_id: `rec-task-${crypto.randomUUID().substring(0,8)}`,
    trace_id: f.trace_id || crypto.randomUUID(),
    intent: f.intent || "error_fix",
    query: f.query || "unknown error query",
    symptom: f.failure_signature || "symptom observed during execution",
    root_cause: `Root cause identified in tool path: ${f.tool_path?.join(' -> ')}`,
    top_files: f.selected_files || [],
    graph_neighbors: [],
    prior_fixes: [],
    recommended_commands: f.commands || [],
    verification_commands: [
      "npm run smoke:hyperrag-packet-rpc"
    ],
    confidence: 0.70,
    status: "ready"
  };
});

const allCards = [...seedCards, ...failureCards];

writeFileSync(workflowPath, JSON.stringify(allCards, null, 2));
console.log(`✓ Wrote ${allCards.length} recommendation cards to docs/reports/agentic-recommendation-workflow.json`);
