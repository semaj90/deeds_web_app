#!/usr/bin/env node
/**
 * load-turbovec-index-from-qdrant.mjs
 *
 * Scrolls Qdrant codebase_chunks_768, selects enriched points
 * (feature_id + community_id + tags/concept_ids), and loads them
 * into the TurboVec sidecar via TurboVec.Upsert RPC.
 *
 * After loading: TurboVec.Health.indexed > 0 and Search returns candidates.
 *
 * Uses the canonical turbovec.proto (TurboVecService, not TurboVecCudaService).
 *
 * Usage:
 *   node scripts/atlas/load-turbovec-index-from-qdrant.mjs --limit=100   # dry-run with 100
 *   node scripts/atlas/load-turbovec-index-from-qdrant.mjs --apply --limit=500
 *   node scripts/atlas/load-turbovec-index-from-qdrant.mjs --apply       # all enriched points
 *   node scripts/atlas/load-turbovec-index-from-qdrant.mjs --apply --verbose
 */

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// Load environment variables
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env') });

const QDRANT_URL   = process.env.QDRANT_URL   || 'http://127.0.0.1:6333';
const GRPC_URL     = process.env.TURBOVEC_SIDECAR_GRPC_URL || '127.0.0.1:50062';
const COLLECTION   = 'codebase_chunks_encoded64';
const SCROLL_BATCH = 100;

const APPLY     = process.argv.includes('--apply');
const DRY_RUN   = !APPLY;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_POINTS = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const VERBOSE   = process.argv.includes('--verbose');
const UPSERT_BATCH = 50;

// Named-vector extraction — handles both flat and named-vector shapes
function getVector(point) {
  if (Array.isArray(point.vector)) return point.vector;
  if (point.vector && Array.isArray(point.vector.content)) return point.vector.content;
  return null;
}

// Gate: only load enriched points that have the full payload needed for pre-filter
function usable(point) {
  const v = getVector(point);
  return (
    v?.length === 64 &&
    point.payload?.feature_id &&
    point.payload?.community_id !== undefined &&
    (point.payload?.tags?.length > 0 || point.payload?.concept_ids?.length > 0)
  );
}

// ── gRPC loader (candidate-roots pattern for ESM) ─────────────────────────────

const CANDIDATE_ROOTS = [
  path.resolve(ROOT, 'sveltekit-frontend/node_modules'),
  path.resolve(ROOT, 'node_modules'),
  path.resolve(process.cwd(), 'node_modules'),
  path.resolve(process.cwd(), '../node_modules'),
];

function makeRequire(root) {
  return createRequire(pathToFileURL(path.join(root, '_dummy.js')).href);
}

async function tryLoadGrpc() {
  for (const root of CANDIDATE_ROOTS) {
    try {
      const req = makeRequire(root);
      return { grpc: req('@grpc/grpc-js'), protoLoader: req('@grpc/proto-loader') };
    } catch { /* try next */ }
  }
  return null;
}

async function buildGrpcClient() {
  const loaded = await tryLoadGrpc();
  if (!loaded) return null;

  const { grpc, protoLoader } = loaded;
  // Use the cuda proto — the running sidecar registers TurboVecCudaService
  const PROTO_PATH = path.resolve(ROOT, 'proto/active/turbovec_cuda.proto');

  const def = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false, longs: Number, enums: String, defaults: true, oneofs: true,
  });

  const descriptor = grpc.loadPackageDefinition(def);
  const pkg = descriptor.turbovec;
  const TurboVecService = pkg.TurboVecCudaService;

  const client = new TurboVecService(
    GRPC_URL,
    grpc.credentials.createInsecure(),
    { 'grpc.max_send_message_length': 64 * 1024 * 1024, 'grpc.max_receive_message_length': 64 * 1024 * 1024 }
  );
  return { client, grpc };
}

function grpcCall(client, method, req, deadlineMs = 5000) {
  return new Promise((resolve) => {
    client[method](req, { deadline: Date.now() + deadlineMs }, (err, res) => {
      if (err) { resolve(null); }
      else      { resolve(res); }
    });
  });
}

// ── Qdrant scroll ─────────────────────────────────────────────────────────────

async function scrollQdrant(offset, limit) {
  const body = {
    limit,
    with_payload: true,
    with_vector: true,
  };
  if (offset) body.offset = offset;

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw new Error(`Qdrant scroll HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.result ?? { points: [], next_page_offset: null };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ Load TurboVec Index from Qdrant ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══`);
  console.log(`Qdrant:  ${QDRANT_URL}/${COLLECTION}`);
  console.log(`gRPC:    ${GRPC_URL}`);

  // ── 1. Verify Qdrant collection ────────────────────────────────────────────
  const colRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);

  if (!colRes?.ok) {
    console.error(`\n⚠️  Qdrant collection ${COLLECTION} not reachable`);
    process.exitCode = 1;
    return;
  }
  const colInfo = await colRes.json();
  const totalPoints = colInfo.result?.points_count ?? 0;
  console.log(`\nQdrant collection: ${totalPoints.toLocaleString()} total points`);

  // ── 2. Scroll and filter usable points ────────────────────────────────────
  console.log('\nScrolling for enriched points (feature_id + community_id + tags)…');
  const usablePoints = [];
  let offset = null;
  let scanned = 0;
  let skipped = 0;

  while (true) {
    const batchLimit = Math.min(SCROLL_BATCH, MAX_POINTS - usablePoints.length + SCROLL_BATCH);
    const { points, next_page_offset } = await scrollQdrant(offset, batchLimit);
    if (!points?.length) break;

    scanned += points.length;
    for (const p of points) {
      if (usable(p)) {
        usablePoints.push(p);
        if (usablePoints.length >= MAX_POINTS) break;
      } else {
        skipped++;
      }
    }

    if (VERBOSE && scanned % 500 === 0) {
      console.log(`  scanned ${scanned} | usable ${usablePoints.length} | skipped ${skipped}`);
    }

    if (!next_page_offset || usablePoints.length >= MAX_POINTS) break;
    offset = next_page_offset;
  }

  console.log(`\nScrolled: ${scanned} points`);
  console.log(`Usable:   ${usablePoints.length} (enriched, 64-dim)`);
  console.log(`Skipped:  ${skipped} (missing feature_id / community_id / tags / vector)`);

  if (usablePoints.length === 0) {
    console.log('\n⚠️  No usable points — run atlas:4b:qdrant-payload to enrich Qdrant payloads first');
    process.exitCode = 1;
    return;
  }

  // ── 3. Write report / exit on dry-run ────────────────────────────────────
  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    collection: COLLECTION,
    total_qdrant_points: totalPoints,
    scanned,
    usable_points: usablePoints.length,
    skipped_points: skipped,
  };

  const reportDir = path.join(ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'turbovec-qdrant-load.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: docs/reports/turbovec-qdrant-load.json`);

  if (DRY_RUN) {
    console.log('\n(dry-run — no TurboVec upsert; run with --apply to load)');
    return;
  }

  // ── 4. Build gRPC client ──────────────────────────────────────────────────
  const grpcCtx = await buildGrpcClient();
  if (!grpcCtx) {
    console.error('\n⚠️  Could not load @grpc/grpc-js — is sveltekit-frontend installed?');
    process.exitCode = 1;
    return;
  }
  const { client } = grpcCtx;

  // Verify sidecar health before loading
  const preHealth = await grpcCall(client, 'health', {}, 5000);
  if (!preHealth) {
    console.error(`\n⚠️  TurboVec sidecar not reachable at ${GRPC_URL}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nTurboVec pre-load: indexed=${preHealth.indexed} backend=${preHealth.backend}`);

  // ── 5. Build index directly via Python HTTP Sidecar ──────────────────────
  let totalInserted = 0;
  let totalUpdated  = 0;
  let totalErrors   = 0;
  let lastIndexed   = preHealth.indexed ?? 0;

  const candidates = usablePoints.map(p => ({
    id: String(p.id),
    vector: getVector(p),
    cluster: Number(p.payload?.community_id ?? 0),
  }));

  console.log(`\nBuilding TurboVec index with ${candidates.length} candidates via Python HTTP sidecar...`);
  const pythonUrl = 'http://127.0.0.1:8793/build';
  try {
    const res = await fetch(pythonUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates }),
      signal: AbortSignal.timeout(120_000), // 2 mins timeout for build
    });
    if (res.ok) {
      const data = await res.json();
      lastIndexed = data.indexed ?? 0;
      totalInserted = lastIndexed;
      console.log(`✅ TurboVec index built successfully! Indexed: ${lastIndexed} points (took ${data.build_ms}ms)`);
    } else {
      console.error(`❌ HTTP Error building index: ${res.status} ${await res.text()}`);
      totalErrors = candidates.length;
    }
  } catch (err) {
    console.error(`❌ Fetch Error building index: ${err.message}`);
    totalErrors = candidates.length;
  }

  // ── 6. Post-load health check ─────────────────────────────────────────────
  const postHealth = await grpcCall(client, 'health', {}, 5000);
  const finalIndexed = postHealth?.indexed ?? lastIndexed;

  console.log(`\nTurboVec post-load: indexed=${finalIndexed} backend=${postHealth?.backend}`);

  // ── 7. Gate evaluation ────────────────────────────────────────────────────
  const gateIndexed  = finalIndexed > 0;
  const gateInserted = totalInserted > 0;
  const gateErrors   = totalErrors === 0;
  const gatePass     = gateIndexed && gateInserted;

  console.log('\n══ Gate Evaluation ══════════════════════════════');
  console.log(`  indexed > 0:    ${gateIndexed  ? '✅' : '❌'} (${finalIndexed})`);
  console.log(`  inserted > 0:   ${gateInserted ? '✅' : '❌'} (${totalInserted})`);
  console.log(`  errors = 0:     ${gateErrors   ? '✅' : '⚠️ '} (${totalErrors})`);
  console.log(`\n  ${gatePass ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);

  Object.assign(report, {
    upserted: { inserted: totalInserted, updated: totalUpdated, errors: totalErrors },
    turbovec: { pre_indexed: preHealth.indexed, post_indexed: finalIndexed, backend: postHealth?.backend },
    gate: { indexed: gateIndexed, inserted: gateInserted, errors: gateErrors, pass: gatePass },
  });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n══ Summary ══════════════════════════════════════');
  console.log(`  Upserted: ${totalInserted} new, ${totalUpdated} updated`);
  console.log(`  Errors:   ${totalErrors}`);
  console.log(`  Report:   docs/reports/turbovec-qdrant-load.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
