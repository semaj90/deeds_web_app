#!/usr/bin/env node
/**
 * Enrich Qdrant codebase_chunks_768 with NESCHROM97 metadata (Phase 1-3 of Tier 2)
 *
 * Phase 1: Load registry (5 min)
 * Phase 2: Query Qdrant (10 min)
 * Phase 3: Enrich payloads (15 min)
 *
 * Usage:
 *   node scripts/atlas/enrich-qdrant-neschrom97.mjs --dry-run
 *   node scripts/atlas/enrich-qdrant-neschrom97.mjs --apply
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../');
const registryPath = path.join(repoRoot, 'docs/reports/neschrom97-card-registry.json');

const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');
const verbose = process.argv.includes('--verbose');
const limit = process.argv.includes('--limit') ? parseInt(process.argv[process.argv.indexOf('--limit') + 1]) : Infinity;

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';
const BATCH_SIZE = 100;

let stats = {
  phase1_cards_loaded: 0,
  phase1_mapped_count: 0,
  phase1_unmapped_count: 0,
  phase2_qdrant_points_queried: 0,
  phase2_enrichable_points_found: 0,
  phase3_points_enriched: 0,
  phase3_matched_cards_linked: 0,
  phase3_surface_added: 0,
  errors: []
};

async function phase1_loadRegistry() {
  console.log('\n⏱️  Phase 1: Load Registry (5 min)\n');

  if (!fs.existsSync(registryPath)) {
    throw new Error(`Registry not found: ${registryPath}`);
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const mappings = registry.mappings || [];

  stats.phase1_cards_loaded = mappings.length;
  stats.phase1_mapped_count = mappings.filter(m => m.retrieval_temperature === 'hot' || m.retrieval_temperature === 'warm').length;
  stats.phase1_unmapped_count = mappings.filter(m => m.retrieval_temperature === 'cold').length;

  console.log(`✅ Loaded ${stats.phase1_cards_loaded} cards`);
  console.log(`   - Mapped (hot+warm): ${stats.phase1_mapped_count}`);
  console.log(`   - Unmapped (cold): ${stats.phase1_unmapped_count}`);

  // Build lookup map: source_ref → {card_id, feature_id, confidence, ...}
  const lookup = new Map();
  for (const card of mappings) {
    if (!lookup.has(card.source_ref)) {
      lookup.set(card.source_ref, []);
    }
    lookup.get(card.source_ref).push({
      card_id: card.card_id,
      packet_id: card.packet_id,
      packet_key: card.packet_key,
      feature_id: card.feature_id,
      som_cluster: card.som_cluster,
      match_confidence: card.match_confidence,
      retrieval_temperature: card.retrieval_temperature
    });
  }

  console.log(`✅ Built lookup map: ${lookup.size} unique source_refs\n`);
  return { mappings, lookup, registry };
}

async function phase2_queryQdrant(lookup) {
  console.log('\n⏱️  Phase 2: Query Qdrant (10 min)\n');

  // Get collection info
  try {
    const resp = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`);
    if (!resp.ok) throw new Error(`Collection not found: ${QDRANT_COLLECTION}`);
    const coll = await resp.json();
    console.log(`✅ Qdrant collection: ${QDRANT_COLLECTION}`);
    console.log(`   - Points: ${coll.result.points_count}`);
    console.log(`   - Vector dim: ${coll.result.config.params.vectors.size}`);
  } catch (err) {
    throw new Error(`Qdrant connection failed: ${err.message}`);
  }

  // Batch scroll through all points
  const enrichablePoints = [];
  let scrollPointer = null;
  let batchNum = 0;

  while (true) {
    batchNum++;
    const scrollReq = {
      limit: BATCH_SIZE,
      with_payload: true,
      with_vector: false
    };
    if (scrollPointer) scrollReq.offset = scrollPointer;

    const resp = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scrollReq)
    });

    if (!resp.ok) throw new Error(`Qdrant scroll failed: ${resp.statusText}`);
    const data = await resp.json();
    const points = data.result?.points || [];

    if (verbose) console.log(`  Batch ${batchNum}: ${points.length} points`);

    for (const point of points) {
      const payload = point.payload || {};
      const sourceRef = payload.source_ref;

      // Check if this point is enrichable (has source_ref match in lookup)
      if (sourceRef && lookup.has(sourceRef)) {
        enrichablePoints.push({
          qdrant_point_id: point.id,
          source_ref: sourceRef,
          cards: lookup.get(sourceRef)
        });
      }
    }

    if (!data.result?.next_page_offset) break;
    scrollPointer = data.result.next_page_offset;

    if (enrichablePoints.length >= limit) break;
  }

  stats.phase2_qdrant_points_queried = batchNum * BATCH_SIZE;
  stats.phase2_enrichable_points_found = enrichablePoints.length;

  console.log(`✅ Queried Qdrant: ${stats.phase2_qdrant_points_queried} points`);
  console.log(`✅ Enrichable points (source_ref match): ${stats.phase2_enrichable_points_found}\n`);

  return enrichablePoints.slice(0, limit);
}

async function phase3_enrichPayloads(enrichablePoints) {
  console.log('\n⏱️  Phase 3: Enrich Payloads (15 min)\n');

  if (dryRun) {
    console.log(`🏃 DRY RUN: Would enrich ${enrichablePoints.length} points\n`);
    console.log('Sample enrichment (first 3):');
    for (const point of enrichablePoints.slice(0, 3)) {
      console.log(`  Point ${point.qdrant_point_id}:`);
      for (const card of point.cards) {
        console.log(`    - card_id: ${card.card_id}`);
        console.log(`      surface: "neschrom97"`);
        console.log(`      match_confidence: ${card.match_confidence}`);
        console.log(`      retrieval_temperature: ${card.retrieval_temperature}`);
      }
    }
    stats.phase3_points_enriched = enrichablePoints.length;
    stats.phase3_matched_cards_linked = enrichablePoints.reduce((sum, p) => sum + p.cards.length, 0);
    stats.phase3_surface_added = enrichablePoints.filter(p => p.cards.some(c => c.match_confidence > 0)).length;
    return;
  }

  if (apply) {
    console.log(`Applying enrichment to ${enrichablePoints.length} points...`);

    // Batch PATCH with enrichment payloads (payload-only update)
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < enrichablePoints.length; i += BATCH_SIZE) {
      const batch = enrichablePoints.slice(i, i + BATCH_SIZE);
      const pointUpdates = batch.map(p => ({
        id: p.qdrant_point_id,
        payload: {
          neschrom97_enrichment: {
            surface: 'neschrom97',
            card_id: p.cards[0]?.card_id,
            cards: p.cards.map(c => ({
              card_id: c.card_id,
              packet_id: c.packet_id,
              feature_id: c.feature_id,
              match_confidence: c.match_confidence,
              retrieval_temperature: c.retrieval_temperature
            })),
            enriched_at: new Date().toISOString()
          }
        }
      }));

      try {
        const resp = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: pointUpdates
          })
        });

        if (resp.ok) {
          successCount += batch.length;
          if (verbose) console.log(`  ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} points`);
        } else {
          errorCount += batch.length;
          const err = await resp.text();
          stats.errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err}`);
        }
      } catch (err) {
        errorCount += batch.length;
        stats.errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
      }
    }

    stats.phase3_points_enriched = successCount;
    stats.phase3_matched_cards_linked = enrichablePoints.reduce((sum, p) => sum + p.cards.length, 0);
    stats.phase3_surface_added = successCount;

    console.log(`✅ Enriched: ${successCount} points`);
    if (errorCount > 0) console.log(`❌ Errors: ${errorCount} points`);
    console.log();
  }
}

async function main() {
  console.log('\n🚀 Qdrant Tier 2 Enrichment: NESCHROM97 Metadata\n');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : apply ? 'APPLY' : 'PLAN'}`);
  console.log(`Limit: ${limit === Infinity ? 'unlimited' : limit}\n`);

  try {
    const { mappings, lookup } = await phase1_loadRegistry();
    const enrichablePoints = await phase2_queryQdrant(lookup);
    await phase3_enrichPayloads(enrichablePoints);

    console.log('📊 Summary:');
    console.log(`  Phase 1 cards loaded: ${stats.phase1_cards_loaded}`);
    console.log(`    - Mapped: ${stats.phase1_mapped_count}`);
    console.log(`    - Unmapped: ${stats.phase1_unmapped_count}`);
    console.log(`  Phase 2 Qdrant queried: ${stats.phase2_qdrant_points_queried} points`);
    console.log(`    - Enrichable (source_ref match): ${stats.phase2_enrichable_points_found}`);
    console.log(`  Phase 3 enriched: ${stats.phase3_points_enriched} points`);
    console.log(`    - Cards linked: ${stats.phase3_matched_cards_linked}`);
    console.log(`    - Surface="neschrom97" added: ${stats.phase3_surface_added}\n`);

    if (stats.errors.length > 0) {
      console.log(`⚠️  Errors (${stats.errors.length}):`);
      stats.errors.forEach(err => console.log(`  - ${err}`));
    }

    process.exit(stats.errors.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`\n❌ Fatal: ${err.message}\n`);
    process.exit(1);
  }
}

main();
