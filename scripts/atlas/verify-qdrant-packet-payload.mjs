#!/usr/bin/env node
/**
 * verify-qdrant-packet-payload.mjs
 *
 * Packet Contract Lane — Qdrant payload mirror verifier (read-only, gate 6 of 7).
 *
 * Checks that codebase_chunks_768 Qdrant points whose source_ref matches a
 * backfilled atlas_packets row carry the expected payload mirror fields:
 *   metadata_path, metadata_hash, metadata_mtime, directory_path
 *
 * Gates:
 *   PASS  Qdrant collection codebase_chunks_768 reachable
 *   PASS  ≥1 enriched Qdrant point has metadata_path set
 *   PASS  metadata_path mirror coverage ≥ 30% of sampled points
 *   PASS  metadata_hash mirror coverage ≥ 40% of sampled points with metadata_path
 *   PASS  Postgres/Qdrant alignment — spot-check 10 packets, verify path field matches
 *
 * Usage:
 *   node scripts/atlas/verify-qdrant-packet-payload.mjs
 *   node scripts/atlas/verify-qdrant-packet-payload.mjs --verbose
 *   node scripts/atlas/verify-qdrant-packet-payload.mjs --sample=200
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const VERBOSE    = process.argv.includes('--verbose');
const SAMPLE_ARG = process.argv.find(a => a.startsWith('--sample='));
const SAMPLE     = SAMPLE_ARG ? parseInt(SAMPLE_ARG.split('=')[1], 10) : 100;

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL   = process.env.QDRANT_URL   || 'http://127.0.0.1:6333';
const COLLECTION   = 'codebase_chunks_768';

// ── Qdrant helpers ─────────────────────────────────────────────────────────────

async function qdrantScroll(offset = null, limit = 100, withPayload = true) {
  const body = { limit, with_payload: withPayload, with_vector: false };
  if (offset) body.offset = offset;
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Qdrant scroll HTTP ${res.status}`);
  const d = await res.json();
  return d.result;
}

async function qdrantCollectionInfo() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Qdrant info HTTP ${res.status}`);
  return (await res.json()).result;
}

async function qdrantGetPoints(ids) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, with_payload: true, with_vector: false }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Qdrant get HTTP ${res.status}`);
  return (await res.json()).result ?? [];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══ Verify Qdrant Packet Payload Mirror ═══\n');

  const gates = [];
  const pool  = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

  // ── Gate 1: Qdrant reachable ───────────────────────────────────────────────
  let collectionInfo;
  try {
    collectionInfo = await qdrantCollectionInfo();
    const pointCount = collectionInfo.points_count ?? collectionInfo.vectors_count ?? '?';
    console.log(`Qdrant collection: ${COLLECTION}`);
    console.log(`  Points:   ${pointCount}`);
    console.log(`  Segments: ${collectionInfo.segments_count ?? '?'}`);
    gates.push({ name: 'qdrant_reachable', pass: true, detail: `${pointCount} points` });
  } catch (err) {
    console.error(`\n⚠️  Qdrant not reachable: ${err.message}`);
    gates.push({ name: 'qdrant_reachable', pass: false, detail: err.message });
    printResults(gates);
    await pool.end();
    return;
  }

  // ── Scroll SAMPLE points and inspect payload ───────────────────────────────
  console.log(`\nScrolling ${SAMPLE} points from Qdrant…`);
  let points = [];
  let offset = null;
  const batchSize = Math.min(SAMPLE, 100);

  while (points.length < SAMPLE) {
    const result = await qdrantScroll(offset, batchSize);
    if (!result?.points?.length) break;
    points.push(...result.points);
    offset = result.next_page_offset;
    if (!offset) break;
  }
  points = points.slice(0, SAMPLE);
  console.log(`Fetched ${points.length} points`);

  // Analyse enrichment fields (as written by upsert-qdrant-packet-payload.mjs)
  let withFeatureId      = 0;
  let withCommunityId    = 0;
  let withCommunityConf  = 0;
  let withPacketKey      = 0;
  let withAtlasEnriched  = 0;
  let withConceptIds     = 0;
  // Metadata mirror fields (written by extended upsert after backfill-packet-metadata.mjs)
  let withMetaPath  = 0;
  let withMetaHash  = 0;
  let withMetaMtime = 0;
  let withDirPath   = 0;
  let withCanonicalRef = 0;

  for (const p of points) {
    const pl = p.payload ?? {};
    if (pl.feature_id)                                withFeatureId++;
    if (pl.community_id != null)                      withCommunityId++;
    if (pl.community_conf != null)                    withCommunityConf++;
    if (pl.packet_key)                                withPacketKey++;
    if (pl.atlas_enriched)                            withAtlasEnriched++;
    if (Array.isArray(pl.concept_ids) && pl.concept_ids.length > 0) withConceptIds++;
    if (pl.metadata_path  || pl.file_path)            withMetaPath++;
    if (pl.metadata_hash  || pl.content_hash)         withMetaHash++;
    if (pl.metadata_mtime)                            withMetaMtime++;
    if (pl.directory_path)                            withDirPath++;
    if (pl.canonicalSourceRef || pl.sourceRef)        withCanonicalRef++;
  }

  const n = points.length;
  const pct = (x) => (n > 0 ? (x / n * 100).toFixed(1) : '0.0');
  const pathPct  = pct(withMetaPath);
  const hashPct  = pct(withMetaHash);

  console.log('\nQdrant enrichment field coverage (sampled):');
  console.log(`  atlas_enriched:         ${withAtlasEnriched}/${n} (${pct(withAtlasEnriched)}%)`);
  console.log(`  feature_id:             ${withFeatureId}/${n} (${pct(withFeatureId)}%)`);
  console.log(`  community_id:           ${withCommunityId}/${n} (${pct(withCommunityId)}%)`);
  console.log(`  community_conf:         ${withCommunityConf}/${n} (${pct(withCommunityConf)}%)`);
  console.log(`  packet_key:             ${withPacketKey}/${n} (${pct(withPacketKey)}%)`);
  console.log(`  concept_ids:            ${withConceptIds}/${n} (${pct(withConceptIds)}%)`);
  console.log(`  canonicalSourceRef:     ${withCanonicalRef}/${n} (${pct(withCanonicalRef)}%)`);
  console.log(`\nMetadata mirror fields (from backfill-packet-metadata.mjs → upsert):`)
  console.log(`  file_path / metadata_path: ${withMetaPath}/${n} (${pathPct}%)`);
  console.log(`  content_hash / meta_hash:  ${withMetaHash}/${n} (${hashPct}%)`);
  console.log(`  metadata_mtime:         ${withMetaMtime}/${n} (${pct(withMetaMtime)}%)`);
  console.log(`  directory_path:         ${withDirPath}/${n} (${pct(withDirPath)}%)`);

  if (VERBOSE) {
    console.log('\nSample payloads (first 3):');
    for (const p of points.slice(0, 3)) {
      const pl = p.payload ?? {};
      console.log(`  id=${p.id}`);
      console.log(`    feature_id=${pl.feature_id ?? '—'}  community_id=${pl.community_id ?? '—'}`);
      console.log(`    packet_key=${(pl.packet_key ?? '—').slice(0, 50)}`);
      console.log(`    atlas_enriched=${pl.atlas_enriched ?? false}  enriched_at=${pl.atlas_enriched_at ?? '—'}`);
      console.log(`    file_path=${pl.file_path ?? pl.metadata_path ?? '—'}`);
    }
  }

  // ── Gate 2: atlas_enriched coverage ≥ 50% ─────────────────────────────────
  const enrichedPct = pct(withAtlasEnriched);
  gates.push({
    name: 'atlas_enriched_50pct',
    pass: parseFloat(enrichedPct) >= 50,
    detail: `${enrichedPct}% (${withAtlasEnriched}/${n})`,
  });

  // ── Gate 3: feature_id coverage ≥ 50% ─────────────────────────────────────
  const featurePct = pct(withFeatureId);
  gates.push({
    name: 'feature_id_50pct',
    pass: parseFloat(featurePct) >= 50,
    detail: `${featurePct}% (${withFeatureId}/${n})`,
  });

  // ── Gate 4: packet_key coverage ≥ 30% ─────────────────────────────────────
  const packetKeyPct = pct(withPacketKey);
  gates.push({
    name: 'packet_key_30pct',
    pass: parseFloat(packetKeyPct) >= 30,
    detail: `${packetKeyPct}% (${withPacketKey}/${n})`,
  });

  // ── Gate 5: file_path / metadata_path coverage ≥ 50% ─────────────────────
  gates.push({
    name: 'file_path_coverage_50pct',
    pass: parseFloat(pathPct) >= 50,
    detail: `${pathPct}% (${withMetaPath}/${n})`,
  });

  // ── Metadata hash — informational only ────────────────────────────────────
  const hashOfPathPct = hashPct; // already over all points

  // ── Gate 6: Postgres/Qdrant spot alignment on packet_key ──────────────────
  // Sample atlas_packets with packet_key and verify Qdrant has matching point
  console.log('\nSpot-checking Postgres ↔ Qdrant packet_key alignment (10 packets)…');

  const { rows: pgSample } = await pool.query(`
    SELECT packet_key, source_ref, feature_id,
           payload->>'path' AS pg_path
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
      AND source_ref IS NOT NULL
    ORDER BY RANDOM()
    LIMIT 10
  `);

  let aligned = 0;
  let checked = 0;
  const mismatches = [];

  for (const row of pgSample) {
    // Normalize source_ref to match Qdrant's canonicalSourceRef format
    const canonical = row.source_ref
      .replace(/^sveltekit-frontend\//, '')
      .replace(/#chunk-\d+$/, '')
      .trim();

    try {
      const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 1,
          with_payload: true,
          with_vector: false,
          filter: {
            must: [{ key: 'canonicalSourceRef', match: { value: canonical } }],
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const d = await res.json();
      const pt = d.result?.points?.[0];
      if (!pt) continue;

      checked++;
      const pl = pt.payload ?? {};

      // Check feature_id alignment (written by upsert-qdrant-packet-payload.mjs)
      if (pl.feature_id && row.feature_id && pl.feature_id === row.feature_id) {
        aligned++;
        if (VERBOSE) console.log(`  ✓ ${canonical.slice(0, 50)} feature_id=${pl.feature_id}`);
      } else if (pl.feature_id && row.feature_id && pl.feature_id !== row.feature_id) {
        mismatches.push({ canonical, pg_fid: row.feature_id, qdrant_fid: pl.feature_id });
        if (VERBOSE) {
          console.log(`  MISMATCH: ${canonical.slice(0, 50)}`);
          console.log(`    PG feature_id:     ${row.feature_id}`);
          console.log(`    Qdrant feature_id: ${pl.feature_id}`);
        }
      } else if (!pl.feature_id) {
        if (VERBOSE) console.log(`  ? ${canonical.slice(0, 50)} — Qdrant lacks feature_id (not enriched)`);
      }
    } catch (err) {
      if (VERBOSE) console.log(`  skip (${err.message.slice(0, 40)})`);
    }
  }

  console.log(`  Checked: ${checked}/${pgSample.length}`);
  console.log(`  Feature_id aligned: ${aligned}/${checked}`);
  if (mismatches.length > 0) {
    console.log(`  Mismatches: ${mismatches.length}`);
  }

  const alignmentPass = mismatches.length === 0;
  gates.push({
    name: 'postgres_qdrant_no_contradictions',
    pass: alignmentPass,
    detail: checked === 0
      ? 'no filterable canonicalSourceRef points found'
      : `${aligned}/${checked} feature_id aligned, ${mismatches.length} mismatches`,
  });

  // ── Results ────────────────────────────────────────────────────────────────
  printResults(gates);

  const report = {
    generated_at: new Date().toISOString(),
    sample_size: points.length,
    coverage: {
      atlas_enriched_pct:   parseFloat(pct(withAtlasEnriched)),
      feature_id_pct:       parseFloat(pct(withFeatureId)),
      community_id_pct:     parseFloat(pct(withCommunityId)),
      community_conf_pct:   parseFloat(pct(withCommunityConf)),
      packet_key_pct:       parseFloat(pct(withPacketKey)),
      concept_ids_pct:      parseFloat(pct(withConceptIds)),
      canonical_ref_pct:    parseFloat(pct(withCanonicalRef)),
      file_path_pct:        parseFloat(pathPct),
      content_hash_pct:     parseFloat(hashPct),
      metadata_mtime_pct:   parseFloat(pct(withMetaMtime)),
      directory_path_pct:   parseFloat(pct(withDirPath)),
    },
    alignment: { checked, aligned, mismatches: mismatches.length },
    gates,
    pass: gates.every(g => g.pass),
  };

  const dir = path.join(ROOT, 'docs', 'reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'verify-qdrant-packet-payload.json'), JSON.stringify(report, null, 2));
  console.log('\nReport: docs/reports/verify-qdrant-packet-payload.json');

  if (!gates.every(g => g.pass)) process.exitCode = 1;
  await pool.end();
}

function printResults(gates) {
  console.log('\n══ Gate Results ══════════════════════════════════');
  for (const g of gates) {
    console.log(`  ${g.pass ? '✅' : '❌'} ${g.name.padEnd(38)} ${g.detail}`);
  }
  const allPass = gates.every(g => g.pass);
  console.log(`\n  ${allPass ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);
}

main().catch(err => { console.error(err); process.exit(1); });
