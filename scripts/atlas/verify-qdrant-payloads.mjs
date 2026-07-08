#!/usr/bin/env node
/**
 * Smoke test 2: Qdrant / HNSW readiness
 *
 * Checks:
 *   - collection exists
 *   - points > 0
 *   - vector dim = 384 (or 768, warns if wrong)
 *   - payload.source_ref exists on sampled points
 *   - payload.packet_key exists on sampled points (advisory)
 *
 * Usage:
 *   node scripts/atlas/verify-qdrant-payloads.mjs
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });
config({ path: resolve('.', 'sveltekit-frontend/.env.local'), override: false });

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = process.env.QDRANT_COLLECTION || 'codebase_chunks_768';
const SAMPLE_SIZE = 20;
// codebase_chunks_768 is intentionally 768-dim (see CLAUDE.md §Qdrant Collections)
// atlas_packets embed dim is 384 but that collection does not yet have a separate Qdrant mirror
const EXPECTED_DIM = COLLECTION.includes('768') ? 768 : 384;

let exitCode = 0;

function check(label, ok, value, warn = false) {
  const icon = ok ? '✅' : (warn ? '⚠️ ' : '❌');
  console.log(`  ${icon} ${label}: ${value}`);
  if (!ok && !warn) exitCode = 1;
}

async function qdrant(path, method = 'GET', body) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Qdrant ${method} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Smoke Test 2: Qdrant / HNSW Readiness          ║');
  console.log(`║  Collection: ${COLLECTION.padEnd(36)}║`);
  console.log('╚══════════════════════════════════════════════════╝\n');

  try {
    // 1. Collection exists
    const info = await qdrant(`/collections/${COLLECTION}`);
    const result = info.result;
    const points = result.points_count ?? 0;
    const vconf = result.config?.params?.vectors;

    check('collection exists', true, COLLECTION);
    check('points > 0', points > 0, points);

    // Dimension detection
    let dim = null;
    if (vconf) {
      if (typeof vconf === 'object' && 'size' in vconf) {
        dim = vconf.size;
      } else {
        // named vectors
        dim = Object.values(vconf)[0]?.size ?? null;
      }
    }
    if (dim !== null) {
      check(`vector dim = ${EXPECTED_DIM}`, dim === EXPECTED_DIM,
        `${dim}${dim !== EXPECTED_DIM ? ` (expected ${EXPECTED_DIM})` : ' ✓'}`,
        dim !== EXPECTED_DIM);
    } else {
      check('vector dim readable', false, 'could not determine from collection config');
    }

    // 2. Sample payload fields
    const scroll = await qdrant(`/collections/${COLLECTION}/points/scroll`, 'POST', {
      limit: SAMPLE_SIZE,
      with_payload: true,
      with_vector: false,
    });

    const pts = scroll.result?.points ?? [];
    check(`sample points returned (${SAMPLE_SIZE})`, pts.length > 0, pts.length);

    if (pts.length > 0) {
      const withSrcRef = pts.filter(p => p.payload?.source_ref).length;
      const withPkey = pts.filter(p => p.payload?.packet_key).length;
      const withFeatureId = pts.filter(p => p.payload?.feature_id).length;

      check(`payload.source_ref present (sample)`,
        withSrcRef === pts.length,
        `${withSrcRef}/${pts.length}`,
        withSrcRef < pts.length);
      check(`payload.packet_key present (sample)`,
        withPkey > 0,
        `${withPkey}/${pts.length}`,
        withPkey < pts.length);
      check(`payload.feature_id present (sample)`,
        withFeatureId > 0,
        `${withFeatureId}/${pts.length}`,
        true);

      console.log('\n  Sample payload keys:', Object.keys(pts[0].payload ?? {}).join(', '));
      console.log(`  Sample point id: ${pts[0].id}`);
      console.log(`  Sample source_ref: ${pts[0].payload?.source_ref ?? '(null)'}`);
    }

    // 3. Quick ANN test
    const countRes = await qdrant(`/collections/${COLLECTION}/points/count`, 'POST', { exact: false });
    console.log(`\n  Approximate count (fast): ${countRes.result?.count ?? 'n/a'}`);

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    exitCode = 1;
  }

  console.log(`\n  Result: ${exitCode === 0 ? '✅ PASS' : '❌ FAIL'}\n`);
  process.exit(exitCode);
}

main();
