#!/usr/bin/env node
/**
 * scripts/atlas/materialize-glyph-records.mjs
 *
 * Phase 2 — Materialize Glyph Records from nes_chrom_packets.
 *
 * Pipeline:
 *   1. Load native graph-engine + hmm-repair N-API modules.
 *   2. Fetch SIMILAR_TOPOLOGY edges from Neo4j → detectCommunitiesRust.
 *   3. JOIN nes_chrom_packets × atlas_feature_map ON packet_id = packet_key.
 *   4. HMM classify each packet's text (confidence >= 0.15 threshold).
 *   5. Build manifold4 = [som_x/20, som_y/20, centroid/1024, community/max].
 *   6. Idempotent upsert into glyph_records ON CONFLICT (glyph_id).
 *      glyph_id = deterministic f(packet_key, kind).
 *
 * Hard invariants (ATLAS-1.0 — never mutated):
 *   source_ref → atlas_feature_map → feature_id
 *   packet_id == nes_chrom_packets.packet_key
 *   self-heal packets live in nes_chrom_packets
 *   .opencode is mirror only
 *
 * Usage:
 *   node scripts/atlas/materialize-glyph-records.mjs           # dry-run
 *   node scripts/atlas/materialize-glyph-records.mjs --apply   # write to DB
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import pg from 'pg';
import neo4j from 'neo4j-driver';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── Constants ────────────────────────────────────────────────────────────────
const HMM_CONFIDENCE_THRESHOLD = 0.15;
const SOM_GRID = 20;
const CENTROID_MAX = 1024;

// ── Environment ──────────────────────────────────────────────────────────────
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = {
  ...loadEnv(path.join(ROOT, '.env')),
  ...loadEnv(path.join(ROOT, 'sveltekit-frontend', '.env')),
  ...process.env,
};

const DATABASE_URL = env.DATABASE_URL || env.ADMIN_DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = env.NEO4J_USER || env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASS = env.NEO4J_PASSWORD || env.NEO4J_PASS || 'neo4j123';

const graphPath = path.resolve(ROOT, 'simd-bridge/rust/graph-engine/graph-engine.win32-x64-msvc.node');
const hmmPath = path.resolve(ROOT, 'simd-bridge/rust/hmm-repair/hmm-repair.win32-x64-msvc.node');

const APPLY = process.argv.includes('--apply');

// ── Deterministic glyph_id ──────────────────────────────────────────────────
// unique key = packet_key + kind  (one glyph per packet for now)
function makeGlyphId(packetKey, kind) {
  const hash = crypto.createHash('sha256').update(`${packetKey}::${kind}`).digest('hex').slice(0, 12);
  return `glyph:${hash}`;
}

// ── manifold4 builder ────────────────────────────────────────────────────────
// 4D topology = SOM position + centroid identity + graph community
// All values clamped to [0, 1].
function manifold4FromAtlas(row, communityId, maxCommunityId) {
  const x = Number(row?.som_bmu_col ?? 0);
  const y = Number(row?.som_bmu_row ?? 0);
  const centroidN = Number(String(row?.centroid_id ?? '').replace(/\D/g, '') || 0);
  return [
    Math.max(0, Math.min(1, x / SOM_GRID)),
    Math.max(0, Math.min(1, y / SOM_GRID)),
    Math.max(0, Math.min(1, centroidN / CENTROID_MAX)),
    maxCommunityId > 0 ? Math.max(0, Math.min(1, (communityId ?? 0) / maxCommunityId)) : 0
  ];
}

async function main() {
  console.log('🧪 Loading native parser addons...');
  const graph = require(graphPath);
  const hmm = require(hmmPath);
  console.log('  ✅ graph-engine + hmm-repair loaded.');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // ── Step 1: Neo4j topology → community detection ──────────────────────────
  console.log('\n🕸️  Neo4j SIMILAR_TOPOLOGY → detectCommunitiesRust...');
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  const session = driver.session({ database: 'neo4j' });

  const communitiesMap = new Map(); // path → communityId
  let maxCommunityId = 0;

  try {
    const res = await session.run(`
      MATCH (a:CodebaseFile)-[:SIMILAR_TOPOLOGY]->(b:CodebaseFile)
      RETURN a.path AS from, b.path AS to
      LIMIT 10000
    `);
    const nodes = new Set();
    const edges = [];
    for (const rec of res.records) {
      const f = rec.get('from');
      const t = rec.get('to');
      if (f && t) { nodes.add(f); nodes.add(t); edges.push({ from: f, to: t }); }
    }
    console.log(`  ${nodes.size} nodes, ${edges.length} edges`);
    if (nodes.size > 0) {
      const comms = graph.detectCommunitiesRust(
        Array.from(nodes),
        edges.map(e => e.from),
        edges.map(e => e.to),
        20
      );
      console.log(`  ${comms.length} communities detected.`);
      for (const c of comms) {
        const cid = c.communityId ?? c.community_id;
        const nids = c.nodeIds ?? c.node_ids;
        if (cid > maxCommunityId) maxCommunityId = cid;
        for (const nid of nids) communitiesMap.set(nid, cid);
      }
    }
  } catch (err) {
    console.warn('  ⚠️ Neo4j skipped:', err.message);
  } finally {
    await session.close();
    await driver.close();
  }
  console.log(`  communityMap: ${communitiesMap.size} entries, max=${maxCommunityId}`);

  // ── Step 2: JOIN nes_chrom_packets × atlas_feature_map ─────────────────────
  console.log('\n⏳ JOIN nes_chrom_packets × atlas_feature_map...');
  const joinRes = await pool.query(`
    SELECT
      n.packet_key,
      n.source_ref,
      n.feature_id,
      n.summary,
      n.payload,
      a.centroid_id   AS afm_centroid_id,
      a.som_cluster   AS afm_som_cluster,
      a.som_bmu_row   AS afm_som_bmu_row,
      a.som_bmu_col   AS afm_som_bmu_col,
      a.lane_ids      AS afm_lane_ids
    FROM nes_chrom_packets n
    LEFT JOIN atlas_feature_map a
      ON a.packet_id = n.packet_key
  `);
  const rows = joinRes.rows;
  console.log(`  ${rows.length} joined rows`);

  // ── Step 3: Materialize ────────────────────────────────────────────────────
  let written = 0;
  let hmmAbove = 0;
  let hmmBelow = 0;
  let m4Nonzero = 0;

  console.log(`\n⚙️  Materializing (APPLY=${APPLY}, HMM_THRESHOLD=${HMM_CONFIDENCE_THRESHOLD})...`);

  for (const row of rows) {
    const cleanPath = (row.source_ref ?? '').replace(/^sveltekit-frontend\//, '');
    const communityId = communitiesMap.get(cleanPath) ?? null;

    // ── HMM classification ──────────────────────────────────────────────────
    const text = row.summary
      || row.payload?.summary
      || row.payload?.text
      || row.payload?.content
      || '';

    let hmmSection = 'UNKNOWN';
    let hmmConfidence = 0;
    if (text.trim()) {
      try {
        const raw = hmm.predictChunkRust(text);
        hmmConfidence = raw.confidence ?? 0;
        const state = raw.primaryState || raw.primary_state || 'UNKNOWN';
        hmmSection = hmmConfidence >= HMM_CONFIDENCE_THRESHOLD ? state : 'UNKNOWN';
        if (hmmConfidence >= HMM_CONFIDENCE_THRESHOLD) hmmAbove++;
        else hmmBelow++;
      } catch { /* fallback */ }
    }

    // ── manifold4 ───────────────────────────────────────────────────────────
    const afmRow = {
      som_bmu_col: row.afm_som_bmu_col,
      som_bmu_row: row.afm_som_bmu_row,
      centroid_id: row.afm_centroid_id,
    };
    const manifold4 = manifold4FromAtlas(afmRow, communityId, maxCommunityId);
    if (manifold4.some(v => v > 0)) m4Nonzero++;

    // ── Glyph identity ──────────────────────────────────────────────────────
    const kind = row.payload?.kind || 'code_chunk';
    const glyphId = makeGlyphId(row.packet_key, kind);
    const sourceId = row.source_ref;
    const summary = row.summary || row.payload?.summary || '';
    const tags = row.payload?.tags || [];
    const entities = row.payload?.entities || [];
    const tileHash = row.payload?.qdrant_point_id
      ? String(row.payload.qdrant_point_id).slice(0, 8)
      : null;

    // ── Safe integer coercion for DB integer columns ────────────────────────
    let somClusterInt = null;
    if (row.afm_som_cluster != null) {
      const p = parseInt(row.afm_som_cluster, 10);
      if (!isNaN(p)) somClusterInt = p;
    }
    let centroidInt = null;
    {
      const n = Number(String(row.afm_centroid_id ?? '').replace(/\D/g, '') || NaN);
      if (!isNaN(n)) centroidInt = n;
    }

    // ── record_json (camelCase, no embedding) ───────────────────────────────
    const recordJson = {
      semantic: {
        section: hmmSection,
        hmmConfidence,
        summary,
        tags,
        entities,
      },
      topology: {
        somCluster: row.afm_som_cluster ?? null,
        centroidId: row.afm_centroid_id ?? null,
        communityId,
        manifold4,
      },
    };

    if (!APPLY) continue;

    await pool.query(`
      INSERT INTO glyph_records (
        glyph_id, source_id, kind, section, summary, tags, entities,
        record_json, centroid_id, som_cluster, packet_key, community_id,
        hmm_section, tile_hash, manifold4, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb,
        $9::integer, $10::integer, $11, $12::integer, $13, $14,
        $15::real[], NOW(), NOW()
      )
      ON CONFLICT (glyph_id) DO UPDATE SET
        source_id    = EXCLUDED.source_id,
        kind         = EXCLUDED.kind,
        section      = EXCLUDED.section,
        summary      = EXCLUDED.summary,
        tags         = EXCLUDED.tags,
        entities     = EXCLUDED.entities,
        record_json  = EXCLUDED.record_json,
        centroid_id  = EXCLUDED.centroid_id,
        som_cluster  = EXCLUDED.som_cluster,
        packet_key   = EXCLUDED.packet_key,
        community_id = EXCLUDED.community_id,
        hmm_section  = EXCLUDED.hmm_section,
        tile_hash    = EXCLUDED.tile_hash,
        manifold4    = EXCLUDED.manifold4,
        updated_at   = NOW()
    `, [
      glyphId,                        // $1
      sourceId,                       // $2
      kind,                           // $3
      hmmSection,                     // $4  section column
      summary,                        // $5
      JSON.stringify(tags),           // $6
      JSON.stringify(entities),       // $7
      JSON.stringify(recordJson),     // $8
      centroidInt,                    // $9  integer or null
      somClusterInt,                  // $10 integer or null
      row.packet_key,                 // $11
      communityId != null ? parseInt(communityId, 10) : null,  // $12
      hmmSection,                     // $13
      tileHash,                       // $14
      manifold4,                      // $15
    ]);
    written++;
    if (written % 2000 === 0) process.stdout.write(`\r  upserted ${written}/${rows.length}`);
  }

  console.log(`\n\n🎉 Materialization complete.`);
  console.log(`   Rows processed   : ${rows.length}`);
  console.log(`   Upserted (APPLY) : ${written}`);
  console.log(`   HMM above 0.15   : ${hmmAbove}`);
  console.log(`   HMM below 0.15   : ${hmmBelow} (labeled UNKNOWN)`);
  console.log(`   manifold4 > 0    : ${m4Nonzero}`);
  console.log(`   Communities      : ${communitiesMap.size} nodes, max=${maxCommunityId}`);
  if (!APPLY) console.log('\n  [DRY-RUN] Re-run with --apply to write.');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
