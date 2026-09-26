#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const failuresPath = path.join(ROOT, 'memory', 'agentic', 'failures.ndjson');
const typescriptEvidencePath = path.join(ROOT, 'docs', 'reports', 'typescript-error-evidence-v1.json');
const workflowPath = path.join(ROOT, 'docs', 'reports', 'agentic-recommendation-workflow.json');

// Ensure output dirs
mkdirSync(path.dirname(workflowPath), { recursive: true });

// Historical seed cards are retained as fixtures only. They are never included in
// the live recommendation index unless explicitly requested for a fixture replay.
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
  const evidenceRefs = Array.isArray(f.evidence_refs) ? f.evidence_refs.filter(Boolean) : [];
  const selectedFiles = Array.isArray(f.selected_files) ? f.selected_files.filter(Boolean) : [];
  const failureSignature = f.failure_signature || f.error_code || null;
  const stableInput = JSON.stringify({
    traceId: f.trace_id || null,
    signature: failureSignature,
    selectedFiles,
    evidenceRefs,
  });
  const dedupKey = `repair:${crypto.createHash('sha256').update(stableInput).digest('hex')}`;
  return {
    task_id: dedupKey,
    dedup_key: dedupKey,
    trace_id: f.trace_id || null,
    intent: f.intent || "error_fix",
    query: f.query || "unknown error query",
    symptom: failureSignature || "unclassified failure observation",
    root_cause: f.root_cause || null,
    top_files: selectedFiles,
    graph_neighbors: [],
    prior_fixes: [],
    recommended_commands: Array.isArray(f.commands) ? f.commands : [],
    verification_commands: Array.isArray(f.verification_commands) ? f.verification_commands : [],
    confidence: Number.isFinite(f.confidence) ? f.confidence : null,
    status: "observed",
    evidence_refs: evidenceRefs,
    canonical_authority: false,
    executable: false,
    authorization_required: true,
  };
});

// Machine-readable checker evidence is planning input only. It cannot mark a
// repair complete, mint canonical identity, or authorize command execution.
const typescriptEvidenceCards = [];
if (existsSync(typescriptEvidencePath)) {
  try {
    const evidence = JSON.parse(readFileSync(typescriptEvidencePath, 'utf8'));
    const rows = Array.isArray(evidence.errors) ? evidence.errors : [];
    for (const error of rows) {
      const sourceRef = typeof error.sourceRef === 'string' && error.sourceRef ? error.sourceRef : null;
      const errorId = typeof error.errorId === 'string' && error.errorId ? error.errorId : null;
      if (!sourceRef || !errorId) continue;
      const stableInput = JSON.stringify({ errorId, sourceRef, code: error.code ?? null, message: error.message ?? null });
      const dedupKey = `repair:typescript:${crypto.createHash('sha256').update(stableInput).digest('hex')}`;
      typescriptEvidenceCards.push({
        task_id: dedupKey,
        dedup_key: dedupKey,
        trace_id: null,
        intent: 'error_fix',
        query: `investigate ${error.code ?? 'TypeScript error'} in ${sourceRef}`,
        symptom: error.message || error.code || 'unclassified TypeScript checker observation',
        root_cause: null,
        top_files: [sourceRef],
        graph_neighbors: [],
        graph_neighbors_status: 'NOT_REQUESTED',
        graph_neighbors_canonical: false,
        prior_fixes: [],
        recommended_commands: [],
        verification_commands: [],
        confidence: null,
        status: 'observed',
        source: 'SVELTE_CHECK_MACHINE_JSON',
        error_id: errorId,
        evidence_refs: [`docs/reports/typescript-error-evidence-v1.json#${errorId}`],
        workspace_revision: error.workspaceRevision ?? evidence.lineage?.workspaceRevision ?? null,
        source_revision: error.sourceRevision ?? evidence.lineage?.sourceRevision ?? null,
        evidence_checksum: evidence.input?.artifactChecksum ?? null,
        canonical_authority: false,
        executable: false,
        authorization_required: true,
      });
    }
  } catch (error) {
    console.warn(`⚠️ TypeScript evidence report unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const includeFixtureSeeds = process.env.ATLAS_INCLUDE_AGENTIC_FIXTURE_SEEDS === 'true';
const fixtureCards = includeFixtureSeeds
  ? seedCards.map((card) => ({
      ...card,
      source: 'STATIC_FIXTURE',
      canonical_authority: false,
      executable: false,
      authorization_required: true,
      status: 'fixture',
    }))
  : [];
const allCards = [...fixtureCards, ...failureCards, ...typescriptEvidenceCards];

writeFileSync(workflowPath, JSON.stringify(allCards, null, 2));
console.log(`✓ Wrote ${allCards.length} recommendation cards to docs/reports/agentic-recommendation-workflow.json`);
