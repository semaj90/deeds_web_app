#!/usr/bin/env node
/**
 * upsert-qdrant-packet-payload.mjs
 *
 * Layer C: Syncs atlas_packets metadata into Qdrant codebase_chunks_768 payload
 * so ANN can pre-filter on:
 *   feature_id      — feature category (database_orm, api_endpoints, etc.)
 *   community_id    — SOM community assignment
 *   community_conf  — community confidence (1.00 / 0.70 / 0.50 / 0.25)
 *   concept_ids     — concept taxonomy labels
 *   tags            — derived keyword tags from BM25 text + concept_ids
 *   cluster_id      — GPU k-means cluster
 *   packet_key      — canonical packet key for dedup
 *
 * This enables the Stage 0 payload pre-filter:
 *   54k Qdrant points → ~4k candidates (after feature_id + community_id filter)
 *   → ANN runs on filtered subspace, not full collection
 *
 * Usage:
 *   node scripts/atlas/upsert-qdrant-packet-payload.mjs --dry-run
 *   node scripts/atlas/upsert-qdrant-packet-payload.mjs --apply
 *   node scripts/atlas/upsert-qdrant-packet-payload.mjs --apply --limit=500
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '../..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL   = process.env.QDRANT_URL   || 'http://localhost:6333';
const COLLECTION   = 'codebase_chunks_768';

const APPLY     = process.argv.includes('--apply');
const DRY_RUN   = !APPLY;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS  = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const VERBOSE   = process.argv.includes('--verbose');

// Batch size for Qdrant set_payload calls
const QDRANT_BATCH = 100;

function canonicalize(sourceRef) {
  if (!sourceRef) return null;
  return sourceRef.replace(/^sveltekit-frontend\//, '').replace(/#chunk-\d+$/, '').trim();
}

// Derive keyword tags from concept_ids + feature_id + packet_key
function deriveTags(featureId, conceptIds, packetKey, summary) {
  const tags = new Set();

  // Add feature_id directly as a tag
  if (featureId) {
    tags.add(featureId);
    // Add component words: database_orm → ['database', 'orm']
    featureId.split(/[_\-]/).filter(w => w.length > 2).forEach(w => tags.add(w));
  }

  // Add concept_ids
  if (Array.isArray(conceptIds)) {
    for (const c of conceptIds) {
      if (c && !c.match(/^[0-9a-f]{40}$/)) { // skip hash-looking IDs
        tags.add(c);
        c.split(/[_\-]/).filter(w => w.length > 2).forEach(w => tags.add(w));
      }
    }
  }

  // Extract key terms from packet_key (file path segments)
  if (packetKey) {
    packetKey.replace(/\.[^.]+$/, '') // strip extension
      .split(/[/\\.:\-]/)
      .filter(w => w.length > 3 && !/^\d+$/.test(w))
      .slice(0, 6)
      .forEach(w => tags.add(w.toLowerCase()));
  }

  return [...tags].slice(0, 12);
}

async function getQdrantPointIds(canonicalRef) {
  // Find Qdrant point IDs for a given canonicalSourceRef
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 50,
        with_payload: false,
        with_vector: false,
        filter: { must: [{ key: 'canonicalSourceRef', match: { value: canonicalRef } }] },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result?.points ?? []).map(p => p.id);
  } catch { return []; }
}

async function setQdrantPayload(pointIds, payload) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, points: pointIds }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch { return false; }
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log(`\n═══ Upsert Qdrant Packet Payload ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══`);
  console.log(`Collection: ${COLLECTION} @ ${QDRANT_URL}`);

  // Load all packets with metadata
  const { rows: packets } = await pool.query(`
    SELECT packet_id, source_ref, feature_id, community_id,
           community_source, community_confidence,
           concept_ids, packet_key, summary,
           payload->>'cluster_id' AS cluster_id
    FROM atlas_packets
    WHERE source_ref IS NOT NULL
    ORDER BY feature_id, source_ref
  `);

  const toProcess = packets.slice(0, MAX_ROWS);
  console.log(`Total packets: ${packets.length} | Processing: ${toProcess.length}`);

  // Group by canonicalRef to batch Qdrant updates
  const refGroups = new Map(); // canonicalRef → packet metadata
  for (const pkt of toProcess) {
    const canonical = canonicalize(pkt.source_ref);
    if (!canonical) continue;
    if (!refGroups.has(canonical)) {
      refGroups.set(canonical, pkt);
    }
  }

  console.log(`Unique canonical refs: ${refGroups.size}`);

  if (DRY_RUN) {
    console.log('\nSample payload (first 3 refs):');
    let shown = 0;
    for (const [ref, pkt] of refGroups) {
      if (shown++ >= 3) break;
      const tags = deriveTags(pkt.feature_id, pkt.concept_ids, pkt.packet_key, pkt.summary);
      console.log(`  ${ref}`);
      console.log(`    feature_id: ${pkt.feature_id}, community_id: ${pkt.community_id} (conf: ${pkt.community_confidence})`);
      console.log(`    tags: [${tags.join(', ')}]`);
    }
    console.log('\n(dry-run — no Qdrant writes; run with --apply to commit)');
    await pool.end();
    return;
  }

  // Apply: fetch Qdrant point IDs, set payload in batches
  let processed = 0, updated = 0, notFound = 0, errors = 0;
  const refsArray = [...refGroups.entries()];

  for (let i = 0; i < refsArray.length; i += QDRANT_BATCH) {
    const batch = refsArray.slice(i, i + QDRANT_BATCH);

    await Promise.all(batch.map(async ([canonical, pkt]) => {
      const pointIds = await getQdrantPointIds(canonical);
      if (!pointIds.length) {
        notFound++;
        return;
      }

      const tags = deriveTags(pkt.feature_id, pkt.concept_ids, pkt.packet_key, pkt.summary);

      const payload = {
        feature_id:         pkt.feature_id ?? null,
        community_id:       pkt.community_id ?? null,
        community_conf:     pkt.community_confidence ?? 0.25,
        concept_ids:        Array.isArray(pkt.concept_ids) ? pkt.concept_ids : [],
        tags,
        cluster_id:         pkt.cluster_id ? parseInt(pkt.cluster_id, 10) : null,
        packet_key:         pkt.packet_key ?? null,
        atlas_enriched:     true,
        atlas_enriched_at:  new Date().toISOString(),
      };

      const ok = await setQdrantPayload(pointIds, payload);
      if (ok) {
        updated += pointIds.length;
        if (VERBOSE) console.log(`  ✓ ${canonical} → ${pointIds.length} points`);
      } else {
        errors++;
      }
    }));

    processed += batch.length;
    process.stdout.write(`\r  Processed ${processed}/${refsArray.length} refs (updated: ${updated} points, miss: ${notFound}, err: ${errors})`);
  }
  process.stdout.write('\n');

  await pool.end();

  // Report
  const reportDir = join(ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const report = {
    generated_at: new Date().toISOString(),
    mode: 'apply',
    total_packets: packets.length,
    unique_refs: refGroups.size,
    refs_processed: processed,
    qdrant_points_updated: updated,
    refs_not_in_qdrant: notFound,
    errors,
  };
  writeFileSync(join(reportDir, 'upsert-qdrant-packet-payload.json'), JSON.stringify(report, null, 2));

  console.log('\n══ Summary ══════════════════════════════════════');
  console.log(`  Refs processed:          ${processed}`);
  console.log(`  Qdrant points updated:   ${updated}`);
  console.log(`  Refs not in Qdrant:      ${notFound}`);
  console.log(`  Errors:                  ${errors}`);
  console.log(`  Report: docs/reports/upsert-qdrant-packet-payload.json`);
  console.log('\n  ✅ Qdrant payload enriched. Pre-filtering on feature_id/community_id/tags now available.');
}

main().catch(err => { console.error(err); process.exit(1); });
