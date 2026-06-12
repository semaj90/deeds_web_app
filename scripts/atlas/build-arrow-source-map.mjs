#!/usr/bin/env node
/**
 * build-arrow-source-map.mjs
 *
 * Offline graph compiler — Stage 1.
 *
 * Reads atlas_packets + concept_records from Postgres and builds:
 *   1. A flat Arrow-style table: [source_ref, packet_key, feature_id, concept_id, community_id]
 *      written to docs/graph/offline/source-map.jsonl  (one JSON object per line)
 *   2. Sparse edge lists:
 *      docs/graph/offline/edges-packet-feature.jsonl   packet_key → feature_id
 *      docs/graph/offline/edges-feature-concept.jsonl  feature_id → concept_id
 *      docs/graph/offline/edges-file-feature.jsonl     source_ref → feature_id
 *      docs/graph/offline/edges-feature-feature.jsonl  feature_id → feature_id (same community)
 *   3. Updates atlas_feature_map with aggregated source_refs, packet_keys, qdrant_point_ids
 *      (the offline equivalent of a MapReduce reduce step)
 *
 * Usage:
 *   node scripts/atlas/build-arrow-source-map.mjs
 *   node scripts/atlas/build-arrow-source-map.mjs --dry-run
 *   node scripts/atlas/build-arrow-source-map.mjs --apply
 *
 * Gate:
 *   atlas_feature_map rows with packet_keys populated >= 80% of distinct feature_ids
 */

import pg from 'pg';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');
const OUT   = join(ROOT, 'docs', 'graph', 'offline');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const APPLY   = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

function ndjsonWriter(path) {
  if (DRY_RUN) return { write: () => {}, count: 0, close: () => Promise.resolve() };
  const stream = createWriteStream(path, { encoding: 'utf8' });
  const w = {
    count: 0,
    write(obj) { w.count++; stream.write(JSON.stringify(obj) + '\n'); },
    close() { return new Promise(r => stream.end(r)); },
  };
  return w;
}

async function main() {
  if (!DRY_RUN) mkdirSync(OUT, { recursive: true });
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log(`\n═══ Build Arrow Source Map ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══`);
  console.log(`Output: ${OUT}\n`);

  // ── 1. Load all packets ───────────────────────────────────────────────────
  const { rows: packets } = await pool.query(`
    SELECT packet_key, source_ref, feature_id, community_id,
           concept_ids, embedding IS NOT NULL AS has_embedding
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
    ORDER BY feature_id, community_id, source_ref
  `);
  console.log(`Packets loaded: ${packets.length}`);

  // ── 2. Build lookup maps ──────────────────────────────────────────────────
  // feature_id → { source_refs, packet_keys, community_ids, concept_ids, qdrant_ids }
  const featureMap = new Map();

  const sourceMap  = ndjsonWriter(join(OUT, 'source-map.jsonl'));
  const ePktFeat   = ndjsonWriter(join(OUT, 'edges-packet-feature.jsonl'));
  const eFeatConc  = ndjsonWriter(join(OUT, 'edges-feature-concept.jsonl'));
  const eFileFeat  = ndjsonWriter(join(OUT, 'edges-file-feature.jsonl'));
  const eFeatFeat  = ndjsonWriter(join(OUT, 'edges-feature-feature.jsonl'));

  for (const pkt of packets) {
    const conceptIds = Array.isArray(pkt.concept_ids) ? pkt.concept_ids.filter(Boolean) : [];

    // Flat source-map row (Arrow-style)
    for (const cid of conceptIds.length ? conceptIds : [null]) {
      sourceMap.write({
        source_ref:   pkt.source_ref,
        packet_key:   pkt.packet_key,
        feature_id:   pkt.feature_id,
        concept_id:   cid,
        community_id: pkt.community_id,
      });
    }

    // Sparse edges
    if (pkt.feature_id) {
      ePktFeat.write({ from: pkt.packet_key, to: pkt.feature_id, type: 'IMPLEMENTS' });
    }
    if (pkt.source_ref && pkt.feature_id) {
      eFileFeat.write({ from: pkt.source_ref, to: pkt.feature_id, type: 'FILE_IN_FEATURE' });
    }
    for (const cid of conceptIds) {
      if (pkt.feature_id) {
        eFeatConc.write({ from: pkt.feature_id, to: cid, type: 'FEATURE_HAS_CONCEPT' });
      }
    }

    // Accumulate into feature map
    if (pkt.feature_id) {
      if (!featureMap.has(pkt.feature_id)) {
        featureMap.set(pkt.feature_id, {
          source_refs:  new Set(),
          packet_keys:  new Set(),
          concept_ids:  new Set(),
          community_ids: new Set(),
        });
      }
      const fm = featureMap.get(pkt.feature_id);
      if (pkt.source_ref) fm.source_refs.add(pkt.source_ref);
      fm.packet_keys.add(pkt.packet_key);
      fm.community_ids.add(pkt.community_id);
      for (const cid of conceptIds) fm.concept_ids.add(cid);
    }
  }

  // ── 3. Same-community feature→feature edges ───────────────────────────────
  // Group feature_ids by dominant community_id
  const communityFeatures = new Map(); // community_id → feature_id[]
  for (const [fid, data] of featureMap) {
    // pick most common community_id for this feature
    const dominant = [...data.community_ids].filter(Boolean)[0];
    if (dominant != null) {
      if (!communityFeatures.has(dominant)) communityFeatures.set(dominant, []);
      communityFeatures.get(dominant).push(fid);
    }
  }
  for (const [, features] of communityFeatures) {
    for (let i = 0; i < features.length - 1; i++) {
      eFeatFeat.write({ from: features[i], to: features[i + 1], type: 'SAME_COMMUNITY', weight: 0.5 });
    }
  }

  await Promise.all([
    sourceMap.close(), ePktFeat.close(), eFeatConc.close(),
    eFileFeat.close(), eFeatFeat.close(),
  ]);

  console.log(`Source-map rows:           ${DRY_RUN ? packets.length : sourceMap.count}`);
  console.log(`Packet→Feature edges:      ${DRY_RUN ? packets.filter(p=>p.feature_id).length : ePktFeat.count}`);
  console.log(`Feature→Concept edges:     ${DRY_RUN ? '(dry)' : eFeatConc.count}`);
  console.log(`File→Feature edges:        ${DRY_RUN ? '(dry)' : eFileFeat.count}`);
  console.log(`Feature→Feature edges:     ${DRY_RUN ? '(dry)' : eFeatFeat.count}`);
  console.log(`Distinct feature_ids:      ${featureMap.size}`);

  // ── 4. Write atlas_feature_map aggregations ───────────────────────────────
  if (DRY_RUN) {
    console.log('\n(dry-run — no DB writes; run with --apply to commit)');
    await pool.end();
    return;
  }

  console.log('\nUpdating atlas_feature_map...');
  let upserted = 0;

  for (const [featureId, data] of featureMap) {
    const sourceRefs  = [...data.source_refs].slice(0, 500);  // cap JSONB size
    const packetKeys  = [...data.packet_keys].slice(0, 500);
    const conceptIds  = [...data.concept_ids].slice(0, 100);

    await pool.query(`
      INSERT INTO atlas_feature_map (feature_id, canonical_name, source_refs, packet_keys, updated_at)
      VALUES ($1, $1, $2::jsonb, $3::jsonb, now())
      ON CONFLICT (feature_id) DO UPDATE
        SET canonical_name = EXCLUDED.canonical_name,
            source_refs    = EXCLUDED.source_refs,
            packet_keys    = EXCLUDED.packet_keys,
            updated_at     = now()
    `, [featureId, JSON.stringify(sourceRefs), JSON.stringify(packetKeys)]);
    upserted++;
  }

  process.stdout.write('\n');

  // ── 5. Gate evaluation ────────────────────────────────────────────────────
  const { rows: [gate] } = await pool.query(`
    SELECT
      count(*) AS total_features,
      count(*) FILTER (WHERE jsonb_array_length(packet_keys) > 0) AS with_packet_keys,
      round(
        count(*) FILTER (WHERE jsonb_array_length(packet_keys) > 0)::numeric / count(*) * 100, 1
      ) AS coverage_pct
    FROM atlas_feature_map
    WHERE feature_id IS NOT NULL
  `);
  await pool.end();

  const gatePass = parseFloat(gate.coverage_pct) >= 80;
  console.log('\n══ Gate Evaluation ══════════════════════════════');
  console.log(`  Feature rows:           ${gate.total_features}`);
  console.log(`  With packet_keys:       ${gate.with_packet_keys}`);
  console.log(`  Coverage ≥ 80%:         ${gatePass ? '✅' : '❌'} (${gate.coverage_pct}%)`);
  console.log(`\n  ${gatePass ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);

  console.log('\n══ Summary ══════════════════════════════════════');
  console.log(`  atlas_feature_map upserted: ${upserted}`);
  console.log(`  NDJSON files: ${OUT}/`);
  console.log(`\n  Next: run gpu-sparse-rank.py to score edges`);
  console.log(`  Then: node scripts/atlas/generate-parent-atlas-toc.mjs --apply`);
}

main().catch(err => { console.error(err); process.exit(1); });
