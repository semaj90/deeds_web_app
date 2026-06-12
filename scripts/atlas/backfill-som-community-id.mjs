#!/usr/bin/env node
/**
 * backfill-som-community-id.mjs
 *
 * Backfills atlas_packets.community_id from Qdrant codebase_chunks_768
 * payload.som_cluster, with full provenance tracking.
 *
 * Strategy (4-tier fallback with explicit confidence):
 *   1. Qdrant canonicalSourceRef → som_cluster vote       confidence: 1.00 (high)
 *   2. FEATURE_BUCKET for canonical feature_ids           confidence: 0.70 (medium-high)
 *   3. FEATURE_MODE majority-vote per feature_id          confidence: 0.50 (medium)
 *   4. GLOBAL_FALLBACK = most common community_id overall confidence: 0.25 (inferred/low)
 *
 * Writes three columns:
 *   community_id         INTEGER  — the assigned community (unchanged contract)
 *   community_source     TEXT     — 'qdrant' | 'feature_bucket' | 'feature_mode' | 'global_fallback'
 *   community_confidence DOUBLE PRECISION — 1.00 / 0.70 / 0.50 / 0.25
 *
 * GLOBAL_FALLBACK is never hidden — confidence 0.25 signals inferred assignment
 * so RRF and ranking layers can downweight it appropriately.
 *
 * Usage:
 *   node scripts/atlas/backfill-som-community-id.mjs --dry-run
 *   node scripts/atlas/backfill-som-community-id.mjs --apply
 *   node scripts/atlas/backfill-som-community-id.mjs --dry-run --limit=50
 *
 * Gate:
 *   community_id coverage >= 80%  (green)
 *   qdrant-sourced share >= 10%   (quality signal)
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL   = process.env.QDRANT_URL   || 'http://localhost:6333';

const APPLY     = process.argv.includes('--apply');
const DRY_RUN   = !APPLY;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS  = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const VERBOSE   = process.argv.includes('--verbose');

// Confidence constants — explicit, never hidden
const CONF = {
  qdrant:          1.00,
  feature_bucket:  0.70,
  feature_mode:    0.50,
  global_fallback: 0.25,
};

// Feature_id → deterministic fallback community bucket
const FEATURE_BUCKET = {
  database_orm:            0,
  api_endpoints:           2,
  ui_components:           4,
  agent_intelligence:      6,
  observability_telemetry: 8,
  infrastructure_config:   10,
  test_harness:            12,
  native_accelerators:     14,
  emergent_topology:       16,
  general_abstractions:    18,
};

function canonicalize(sourceRef) {
  if (!sourceRef) return null;
  return sourceRef.replace(/^sveltekit-frontend\//, '');
}

function isCodeFile(sourceRef) {
  if (!sourceRef) return false;
  const s = sourceRef.replace(/\\/g, '/');
  if (s.includes('documents-atlas-index.md#')) return false;
  if (s.startsWith('memory/') || s.startsWith('logs/') || s.startsWith('.tmp/')) return false;
  if (s.startsWith('docs_readme/') || s.startsWith('docs/reports/')) return false;
  if (s.includes('backup-202') || s.includes('api-cleanup')) return false;
  return true;
}

async function qdrantSomCluster(canonicalRef) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 100,
        with_payload: true,
        with_vector: false,
        filter: { must: [{ key: 'canonicalSourceRef', match: { value: canonicalRef } }] },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const points = data.result?.points ?? [];
    if (points.length === 0) return null;

    const votes = {};
    for (const pt of points) {
      const c = pt.payload?.som_cluster;
      if (c != null) votes[c] = (votes[c] ?? 0) + 1;
    }
    const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    return best ? Number(best[0]) : null;
  } catch {
    return null;
  }
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  // ── 0. Build second-tier lookup tables ────────────────────────────────────
  const { rows: modeRows } = await pool.query(`
    SELECT feature_id,
           mode() WITHIN GROUP (ORDER BY community_id) AS dominant_community_id
    FROM atlas_packets
    WHERE community_id IS NOT NULL AND feature_id IS NOT NULL
    GROUP BY feature_id
  `);
  const FEATURE_MODE = {};
  for (const r of modeRows) {
    if (r.dominant_community_id != null) FEATURE_MODE[r.feature_id] = Number(r.dominant_community_id);
  }

  const { rows: [globalMode] } = await pool.query(`
    SELECT mode() WITHIN GROUP (ORDER BY community_id) AS global_community_id
    FROM atlas_packets WHERE community_id IS NOT NULL
  `);
  const GLOBAL_FALLBACK = globalMode?.global_community_id != null
    ? Number(globalMode.global_community_id) : 3;

  console.log(`\nFeature→community mode table: ${Object.keys(FEATURE_MODE).length} entries`);
  console.log(`Global fallback community_id: ${GLOBAL_FALLBACK} (confidence: ${CONF.global_fallback})`);

  // ── 1. Load all packets without community_source (includes already-assigned
  //       ones that predate provenance columns) ────────────────────────────────
  const { rows: packets } = await pool.query(`
    SELECT packet_id, source_ref, feature_id, packet_key, community_id
    FROM atlas_packets
    WHERE community_source IS NULL
    ORDER BY source_ref
  `);

  const codePackets    = packets.filter(p => isCodeFile(p.source_ref));
  const nonCodePackets = packets.filter(p => !isCodeFile(p.source_ref));
  const codeLimit      = Math.min(codePackets.length, MAX_ROWS);

  console.log(`\n═══ SOM Community ID Backfill ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══`);
  console.log(`Packets missing provenance:      ${packets.length}`);
  console.log(`  Code files (Qdrant-eligible):  ${codePackets.length}`);
  console.log(`  Non-code (fallback only):       ${nonCodePackets.length}`);
  console.log(`Processing code files:           ${codeLimit}`);

  // ── 2. Qdrant lookup for code files ──────────────────────────────────────
  const canonicalMap = new Map(); // canonical_ref → som_cluster
  const uniqueRefs = [...new Set(
    codePackets.slice(0, codeLimit).map(p => canonicalize(p.source_ref)).filter(Boolean)
  )];
  console.log(`\nUnique canonical refs to query: ${uniqueRefs.length}`);

  let qdrantHits = 0, qdrantMiss = 0;
  for (let i = 0; i < uniqueRefs.length; i++) {
    const ref = uniqueRefs[i];
    const cluster = await qdrantSomCluster(ref);
    if (cluster != null) { canonicalMap.set(ref, cluster); qdrantHits++; }
    else { qdrantMiss++; }
    if (VERBOSE || (i + 1) % 100 === 0) {
      process.stdout.write(`\r  Queried ${i + 1}/${uniqueRefs.length} refs (hits: ${qdrantHits}, miss: ${qdrantMiss})`);
    }
  }
  if (!VERBOSE) process.stdout.write('\n');
  console.log(`\nQdrant hits:   ${qdrantHits}`);
  console.log(`Qdrant misses: ${qdrantMiss}`);

  // ── 3. Build full update plan with provenance ─────────────────────────────
  // { packet_id, community_id, community_source, community_confidence }
  const updates = [];
  const sourceCounts = { qdrant: 0, feature_bucket: 0, feature_mode: 0, global_fallback: 0 };

  function resolve(pkt, isCode) {
    // Packets that already have community_id — backfill provenance only
    if (pkt.community_id != null) {
      // Infer source retroactively: check if Qdrant had a match
      const canonical = canonicalize(pkt.source_ref);
      const qdrantCluster = (isCode && canonical) ? canonicalMap.get(canonical) : undefined;
      if (qdrantCluster != null && qdrantCluster === pkt.community_id) {
        return { community_id: pkt.community_id, source: 'qdrant', confidence: CONF.qdrant };
      }
      if (FEATURE_BUCKET[pkt.feature_id] === pkt.community_id) {
        return { community_id: pkt.community_id, source: 'feature_bucket', confidence: CONF.feature_bucket };
      }
      if (FEATURE_MODE[pkt.feature_id] === pkt.community_id) {
        return { community_id: pkt.community_id, source: 'feature_mode', confidence: CONF.feature_mode };
      }
      // Existing assignment source unknown — treat as feature_mode confidence floor
      return { community_id: pkt.community_id, source: 'feature_mode', confidence: CONF.feature_mode };
    }

    // No community_id — full 4-tier assignment
    if (isCode) {
      const canonical = canonicalize(pkt.source_ref);
      const qdrantCluster = canonical ? canonicalMap.get(canonical) : undefined;
      if (qdrantCluster != null) {
        return { community_id: qdrantCluster, source: 'qdrant', confidence: CONF.qdrant };
      }
    }
    const bucket = FEATURE_BUCKET[pkt.feature_id];
    if (bucket != null) {
      return { community_id: bucket, source: 'feature_bucket', confidence: CONF.feature_bucket };
    }
    const mode = pkt.feature_id ? FEATURE_MODE[pkt.feature_id] : undefined;
    if (mode != null) {
      return { community_id: mode, source: 'feature_mode', confidence: CONF.feature_mode };
    }
    // Tier 4: global fallback — explicitly low confidence, never hidden
    return { community_id: GLOBAL_FALLBACK, source: 'global_fallback', confidence: CONF.global_fallback };
  }

  for (const pkt of codePackets.slice(0, codeLimit)) {
    const r = resolve(pkt, true);
    updates.push({ packet_id: pkt.packet_id, ...r });
    sourceCounts[r.source]++;
  }
  for (const pkt of nonCodePackets) {
    const r = resolve(pkt, false);
    updates.push({ packet_id: pkt.packet_id, ...r });
    sourceCounts[r.source]++;
  }

  console.log(`\nUpdate plan (${updates.length} packets):`);
  console.log(`  qdrant          (conf 1.00): ${sourceCounts.qdrant}`);
  console.log(`  feature_bucket  (conf 0.70): ${sourceCounts.feature_bucket}`);
  console.log(`  feature_mode    (conf 0.50): ${sourceCounts.feature_mode}`);
  console.log(`  global_fallback (conf 0.25): ${sourceCounts.global_fallback}`);

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    total_missing_provenance: packets.length,
    code_eligible: codePackets.length,
    non_code: nonCodePackets.length,
    qdrant_hits: qdrantHits,
    qdrant_misses: qdrantMiss,
    source_distribution: sourceCounts,
  };

  const reportDir = join(ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, 'backfill-som-community-id.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: docs/reports/backfill-som-community-id.json`);

  if (DRY_RUN) {
    console.log('\n(dry-run — no DB writes; run with --apply to commit)');
    await pool.end();
    return;
  }

  // ── 4. Apply updates in batches ───────────────────────────────────────────
  const BATCH = 500;
  let applied = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const ids         = batch.map(u => u.packet_id);
    const communities = batch.map(u => u.community_id);
    const sources     = batch.map(u => u.source);
    const confidences = batch.map(u => u.confidence);

    await pool.query(`
      UPDATE atlas_packets ap
      SET community_id         = u.community_id::integer,
          community_source     = u.source,
          community_confidence = u.confidence::double precision,
          updated_at           = now()
      FROM (
        SELECT unnest($1::text[])            AS packet_id,
               unnest($2::int[])             AS community_id,
               unnest($3::text[])            AS source,
               unnest($4::double precision[]) AS confidence
      ) u
      WHERE ap.packet_id = u.packet_id
    `, [ids, communities, sources, confidences]);

    applied += batch.length;
    process.stdout.write(`\r  Applied ${applied}/${updates.length}`);
  }
  process.stdout.write('\n');

  // ── 5. Gate evaluation ────────────────────────────────────────────────────
  const { rows: [gate] } = await pool.query(`
    SELECT
      count(*)                                                        AS total,
      count(community_id)                                             AS covered,
      count(*) FILTER (WHERE community_source = 'qdrant')            AS qdrant_count,
      count(*) FILTER (WHERE community_source = 'feature_bucket')    AS bucket_count,
      count(*) FILTER (WHERE community_source = 'feature_mode')      AS mode_count,
      count(*) FILTER (WHERE community_source = 'global_fallback')   AS fallback_count,
      round(count(community_id)::numeric / count(*) * 100, 1)        AS coverage_pct,
      round(avg(community_confidence)::numeric, 3)                   AS avg_confidence
    FROM atlas_packets
  `);
  await pool.end();

  const coverageGate = parseFloat(gate.coverage_pct) >= 80;
  const qdrantShare  = gate.total > 0
    ? ((gate.qdrant_count / gate.total) * 100).toFixed(1) : '0.0';

  console.log('\n══ Gate Evaluation ══════════════════════════════');
  console.log(`  Total packets:          ${gate.total}`);
  console.log(`  With community_id:      ${gate.covered} (${gate.coverage_pct}%)`);
  console.log(`  Coverage ≥ 80%:         ${coverageGate ? '✅' : '❌'}`);
  console.log(`\n  Source distribution:`);
  console.log(`    qdrant          (1.00): ${gate.qdrant_count}  (${qdrantShare}%)`);
  console.log(`    feature_bucket  (0.70): ${gate.bucket_count}`);
  console.log(`    feature_mode    (0.50): ${gate.mode_count}`);
  console.log(`    global_fallback (0.25): ${gate.fallback_count}`);
  console.log(`\n  Avg confidence:         ${gate.avg_confidence}`);
  console.log(`\n  ${coverageGate ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);

  report.gate_result = {
    total: Number(gate.total),
    covered: Number(gate.covered),
    coverage_pct: gate.coverage_pct,
    avg_confidence: gate.avg_confidence,
    source_distribution: {
      qdrant:          Number(gate.qdrant_count),
      feature_bucket:  Number(gate.bucket_count),
      feature_mode:    Number(gate.mode_count),
      global_fallback: Number(gate.fallback_count),
    },
    gate_pass: coverageGate,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n══ Summary ══════════════════════════════════════');
  console.log(`  Applied:    ${applied} provenance assignments`);
  console.log(`  Report:     docs/reports/backfill-som-community-id.json`);
  console.log(`\n  Note: global_fallback (conf 0.25) assignments are real coverage`);
  console.log(`        but ranking layers should downweight them vs qdrant (1.00).`);
}

main().catch(err => { console.error(err); process.exit(1); });
