#!/usr/bin/env node
/**
 * scripts/atlas/build-compressed-packets.mjs
 *
 * Builds NES-ROM-style compressed integer packets for the Atlas hot cache.
 *
 * Pokémon ROM-bank model:
 *   Full object  → warm Postgres row
 *   Compressed   → {s:4182, f:17, t:[3,9,22], q:91, k:5}
 *
 * Dictionaries (decode tables):
 *   feature_code:  feature_id → integer
 *   tag_code:      tag string → integer
 *   source_id:     source_ref → integer (= source_ref_id from DB)
 *
 * Output:
 *   .tmp/compressed-packets.ndjson     — one packet per line
 *   .tmp/atlas-dict-full.json          — full decode tables
 *   .tmp/atlas-packets-report.json     — stats
 *
 * Usage:
 *   node scripts/atlas/build-compressed-packets.mjs --dry-run
 *   node scripts/atlas/build-compressed-packets.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

function loadEnv() {
  for (const p of [path.join(ROOT, 'sveltekit-frontend', '.env'), path.join(ROOT, '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL
  ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const TMP = path.join(ROOT, '.tmp');
const PACKETS_PATH = path.join(TMP, 'compressed-packets.ndjson');
const DICT_PATH = path.join(TMP, 'atlas-dict-full.json');
const REPORT_PATH = path.join(TMP, 'atlas-packets-report.json');

async function main() {
  console.log('\n══ Build Compressed NES Packets ════════════════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY (write files)' : 'DRY-RUN'}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Load all source rows with LOD data
  console.log('\n  Step 1: Load parent_atlas_documents + synthesized...');
  const { rows } = await pool.query(`
    SELECT
      pad.id,
      pad.source_ref,
      pad.source_ref_id,
      pad.feature_id,
      pad.tags,
      pad.source_kind,
      pad.index_lane,
      pad.summary_lod0,
      pad.summary_lod1,
      pad.summary_lod2,
      pad.is_route,
      pad.has_auth,
      pad.line_count,
      afms.som_cluster,
      afms.behavior_score,
      afms.routing_score,
      afms.semantic_confidence,
      afms.packet_count
    FROM parent_atlas_documents pad
    LEFT JOIN atlas_feature_map_synthesized afms ON afms.source_ref = pad.source_ref
    WHERE pad.source_ref NOT LIKE 'feature:%'
      AND pad.source_ref_id IS NOT NULL
    ORDER BY pad.source_ref_id
  `);
  console.log(`  ✅ Loaded ${rows.length} rows`);

  await pool.end();

  // ── Build dictionaries ─────────────────────────────────────────────────────

  console.log('\n  Step 2: Building integer code dictionaries...');

  // feature_code dict
  const featureIds = [...new Set(rows.map(r => r.feature_id).filter(Boolean))].sort();
  const featureCode = {};
  featureIds.forEach((f, i) => { featureCode[f] = i + 1; });

  // tag_code dict — collect all unique behavior tags
  const allTagsSet = new Set();
  for (const row of rows) {
    if (Array.isArray(row.tags)) {
      for (const t of row.tags) {
        if (!t.startsWith('excluded_') && t !== 'vendor') allTagsSet.add(t);
      }
    }
  }
  const allTags = [...allTagsSet].sort();
  const tagCode = {};
  allTags.forEach((t, i) => { tagCode[t] = i + 1; });

  // source_code dict (source_ref → source_ref_id, already in DB)
  const sourceCode = {};
  rows.forEach(r => { sourceCode[r.source_ref] = r.source_ref_id; });

  // lane_code dict
  const laneCode = { source: 1, dependency: 2, config: 3, test: 4, generated: 5, doc: 6 };

  console.log(`  feature_code: ${Object.keys(featureCode).length} features`);
  console.log(`  tag_code:     ${Object.keys(tagCode).length} unique tags`);
  console.log(`  source_code:  ${Object.keys(sourceCode).length} source refs`);

  // ── Build packets ─────────────────────────────────────────────────────────

  console.log('\n  Step 3: Building compressed packets...');

  const packets = rows.map(row => {
    const tags = (Array.isArray(row.tags) ? row.tags : [])
      .filter(t => !t.startsWith('excluded_') && t !== 'vendor')
      .map(t => tagCode[t])
      .filter(c => c != null)
      .sort((a, b) => a - b);

    const confidence = row.semantic_confidence
      ? Math.round(parseFloat(row.semantic_confidence) * 100)
      : null;
    const behavior = row.behavior_score
      ? Math.round(parseFloat(row.behavior_score) * 100)
      : null;

    // NES-style compact packet
    return {
      // Identity
      s: row.source_ref_id,               // source integer ID
      f: featureCode[row.feature_id] ?? 0, // feature code
      t: tags,                              // tag codes array
      l: laneCode[row.index_lane] ?? 1,    // lane code

      // Scores (0-100 scaled)
      q: confidence ?? 0,                  // semantic confidence
      b: behavior ?? 0,                    // behavior score
      k: row.packet_count ?? 0,            // task packet count

      // LOD flags (bitmask: bit0=lod0, bit1=lod1, bit2=lod2, bit3=lod3)
      d: (row.summary_lod0 ? 1 : 0) |
         (row.summary_lod1 ? 2 : 0) |
         ((row.summary_lod2 || row.summary_lod2) ? 4 : 0) |
         (row.som_cluster ? 8 : 0),

      // Routing hints
      r: row.is_route ? 1 : 0,
      a: row.has_auth ? 1 : 0,
    };
  });

  // Stats
  const withAllLods = packets.filter(p => (p.d & 7) === 7).length;
  const avgTagCount = packets.reduce((s, p) => s + p.t.length, 0) / packets.length;
  const avgPacketBytes = JSON.stringify(packets[0] ?? {}).length; // rough

  console.log(`  Total packets:  ${packets.length}`);
  console.log(`  With LOD0+1+2:  ${withAllLods} (${Math.round(withAllLods/packets.length*100)}%)`);
  console.log(`  Avg tags/packet: ${avgTagCount.toFixed(1)}`);
  console.log(`  Approx bytes/packet: ~${avgPacketBytes}`);

  if (VERBOSE) {
    console.log('\n  Sample (first 3):');
    packets.slice(0, 3).forEach((p, i) => {
      const row = rows[i];
      console.log(`\n  ${row.source_ref}`);
      console.log(`  compact: ${JSON.stringify(p)}`);
    });
  }

  if (!APPLY) {
    console.log('\n  [DRY-RUN] No files written. Pass --apply to persist.');
    return;
  }

  // Write NDJSON packets
  console.log('\n  Step 4: Writing compressed-packets.ndjson...');
  fs.mkdirSync(TMP, { recursive: true });
  const ndjson = packets.map(p => JSON.stringify(p)).join('\n') + '\n';
  fs.writeFileSync(PACKETS_PATH, ndjson, 'utf8');
  const sizeMB = (Buffer.byteLength(ndjson) / 1024 / 1024).toFixed(2);
  console.log(`  ✅ ${packets.length} packets → ${PACKETS_PATH} (${sizeMB} MB)`);

  // Write full dictionary
  console.log('\n  Step 5: Writing atlas-dict-full.json...');
  const dict = {
    generated: new Date().toISOString(),
    source_count: Object.keys(sourceCode).length,
    feature_count: Object.keys(featureCode).length,
    tag_count: Object.keys(tagCode).length,
    // Decode tables
    decode: {
      features: Object.fromEntries(Object.entries(featureCode).map(([k, v]) => [v, k])),
      tags: Object.fromEntries(Object.entries(tagCode).map(([k, v]) => [v, k])),
      lanes: Object.fromEntries(Object.entries(laneCode).map(([k, v]) => [v, k])),
      sources: Object.fromEntries(Object.entries(sourceCode).map(([k, v]) => [v, k])),
    },
    // Encode tables
    encode: { features: featureCode, tags: tagCode, lanes: laneCode, sources: sourceCode },
  };
  fs.writeFileSync(DICT_PATH, JSON.stringify(dict, null, 2), 'utf8');
  console.log(`  ✅ Dictionary → ${DICT_PATH}`);

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    mode: 'apply',
    packet_count: packets.length,
    with_all_lods: withAllLods,
    avg_tag_count: avgTagCount,
    dict_sizes: {
      features: Object.keys(featureCode).length,
      tags: Object.keys(tagCode).length,
      sources: Object.keys(sourceCode).length,
    },
    files: { packets: PACKETS_PATH, dict: DICT_PATH },
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n══ Results ════════════════════════════════════════════════');
  console.log(`  Packets:     ${packets.length}`);
  console.log(`  NDJSON size: ${sizeMB} MB`);
  console.log(`  Features:    ${Object.keys(featureCode).length}`);
  console.log(`  Tags:        ${Object.keys(tagCode).length}`);
  console.log(`  Sources:     ${Object.keys(sourceCode).length}`);
  console.log('\n  ✅ Packets built. Next: warm-redis-lod-cache.mjs');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
