#!/usr/bin/env node
/**
 * classify-qdrant-orphans.mjs
 *
 * Classify Qdrant points into:
 * - canonical_matched: has both source_ref + packet_key (enriched by backfill)
 * - legacy_qdrant_only: has source_ref but no packet_key (pre-backfill Qdrant points)
 * - missing_source_ref: no source_ref/path
 * - missing_packet_key: has source_ref but no packet_key
 * - unknown: other state
 */

import pg from 'pg';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const SAMPLE_SIZE = 500;

async function classifyOrphans() {
  console.log('\n═══ Qdrant Orphan Classification ═══\n');

  // Get Qdrant sample
  console.log('Sampling Qdrant points...');
  const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: SAMPLE_SIZE, with_payload: true })
  });

  if (!scrollRes.ok) {
    throw new Error(`Qdrant error: ${scrollRes.status}`);
  }

  const { result } = await scrollRes.json();
  const points = result.points || [];

  console.log(`Scanned ${points.length} points\n`);

  // Classify
  const classification = {
    canonical_matched: [],      // source_ref ✓ packet_key ✓
    legacy_qdrant_only: [],     // source_ref ✓ packet_key ✗
    missing_source_ref: [],     // source_ref ✗ packet_key ?
    missing_packet_key: [],     // source_ref ? packet_key ✗
    unknown: []
  };

  for (const point of points) {
    const p = point.payload || {};

    // Resolve source_ref with aliases
    const sourceRef =
      p.source_ref ??
      p.sourceRef ??
      p.canonicalSourceRef ??
      p.path ??
      p.filePath ??
      null;

    // Resolve packet_key with aliases
    const packetKey =
      p.packet_key ??
      p.packetKey ??
      null;

    // Classify
    if (sourceRef && packetKey) {
      classification.canonical_matched.push({ id: point.id, sourceRef, packetKey });
    } else if (sourceRef && !packetKey) {
      classification.legacy_qdrant_only.push({ id: point.id, sourceRef });
    } else if (!sourceRef && !packetKey) {
      classification.missing_source_ref.push({ id: point.id });
    } else if (!sourceRef && packetKey) {
      classification.missing_packet_key.push({ id: point.id, packetKey });
    } else {
      classification.unknown.push({ id: point.id });
    }
  }

  // Report
  console.log('--- Classification Results ---\n');
  console.log(`✅ canonical_matched:   ${classification.canonical_matched.length}/${points.length} (${((100 * classification.canonical_matched.length) / points.length).toFixed(1)}%)`);
  console.log(`⚠️  legacy_qdrant_only:   ${classification.legacy_qdrant_only.length}/${points.length} (${((100 * classification.legacy_qdrant_only.length) / points.length).toFixed(1)}%)`);
  console.log(`❌ missing_source_ref:   ${classification.missing_source_ref.length}/${points.length} (${((100 * classification.missing_source_ref.length) / points.length).toFixed(1)}%)`);
  console.log(`❌ missing_packet_key:   ${classification.missing_packet_key.length}/${points.length} (${((100 * classification.missing_packet_key.length) / points.length).toFixed(1)}%)`);
  console.log(`❓ unknown:              ${classification.unknown.length}/${points.length} (${((100 * classification.unknown.length) / points.length).toFixed(1)}%)\n`);

  // Gate
  const canonicalPercent = (100 * classification.canonical_matched.length) / points.length;
  if (canonicalPercent >= 80) {
    console.log(`✅ Gate PASS: ${canonicalPercent.toFixed(1)}% of sampled points are canonical-matched`);
    console.log(`   Phase D can proceed with ${classification.canonical_matched.length} enriched points`);
  } else {
    console.log(`⚠️ Gate FAIL: Only ${canonicalPercent.toFixed(1)}% of sampled points are canonical-matched`);
    console.log(`   Recommendation: Accept as MVP limitation — Phase 14 DuckDB will handle full reconciliation`);
  }

  // Sample detail
  console.log('\n--- Sample of legacy_qdrant_only (first 5) ---\n');
  for (const item of classification.legacy_qdrant_only.slice(0, 5)) {
    console.log(`  Point ${item.id}: sourceRef="${item.sourceRef}" (no packet_key)`);
  }

  console.log('\n--- Sample of missing_source_ref (first 5) ---\n');
  for (const item of classification.missing_source_ref.slice(0, 5)) {
    console.log(`  Point ${item.id}: (no source_ref or path)`);
  }
}

classifyOrphans().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
