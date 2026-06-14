#!/usr/bin/env node
/**
 * Phase D: Qdrant Enrichment — Canonical Cohort Only
 *
 * Enrich Qdrant codebase_chunks_768 with Phase D fields:
 * - somCluster, treeNodeKey, qdrantHit=true
 * - metadata.phase_d_enriched = true, enriched_at
 *
 * STRICT SCOPE:
 * - ONLY enrich points with source_ref + packet_key
 * - ONLY match atlas_packets rows (canonical ledger)
 * - SKIP legacy-only points (source_ref only, no packet_key)
 * - SKIP orphaned points (in Qdrant, not in Postgres)
 * - SKIP missing source_ref/packet_key
 */

import pg from 'pg';

const { Pool } = pg;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
const verbose = args.includes('--verbose');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '100');

const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');

/**
 * Audit Qdrant cohorts
 */
async function auditQdrantCohorts() {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/count`);
    if (!res.ok) {
      console.error('[qdrant] Failed to get point count');
      return { total: 0, with_source_ref: 0, with_packet_key: 0 };
    }

    const body = await res.json();
    const totalPoints = body.result?.count || 0;

    // Sample points to estimate cohorts
    const sampleRes = await fetch(
      `${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 }),
      }
    );

    if (!sampleRes.ok) {
      return { total: totalPoints, with_source_ref: 0, with_packet_key: 0 };
    }

    const sampleBody = await sampleRes.json();
    const points = sampleBody.result?.points || [];

    let withSourceRef = 0;
    let withPacketKey = 0;

    for (const point of points) {
      if (point.payload?.source_ref) withSourceRef += 1;
      if (point.payload?.packet_key) withPacketKey += 1;
    }

    const ratio = points.length > 0 ? points.length : 1;
    return {
      total: totalPoints,
      with_source_ref: Math.round((withSourceRef / ratio) * totalPoints),
      with_packet_key: Math.round((withPacketKey / ratio) * totalPoints),
      canonical_eligible: Math.round((Math.min(withSourceRef, withPacketKey) / ratio) * totalPoints),
    };
  } catch (err) {
    console.error('[qdrant] Audit failed:', err.message);
    return { total: 0, with_source_ref: 0, with_packet_key: 0, canonical_eligible: 0 };
  }
}

/**
 * Fetch canonical Qdrant cohort (source_ref + packet_key match atlas_packets)
 */
async function fetchCanonicalCohort(pool, limit) {
  try {
    const res = await pool.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.feature_label,
        ap.som_index,
        ap.som_row,
        ap.som_col,
        tn.node_id as tree_node_key
      FROM atlas_packets ap
      LEFT JOIN atlas_tree_nodes tn ON ap.source_ref = tn.source_ref
      WHERE ap.packet_key IS NOT NULL
      AND ap.source_ref IS NOT NULL
      LIMIT $1;
    `, [limit]);

    const packets = res.rows.map(row => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      feature_label: row.feature_label,
      somCluster: row.som_index ? `cluster:${row.som_row}:${row.som_col}` : null,
      treeNodeKey: row.tree_node_key,
    }));

    console.log(`[phase-d] Canonical cohort: ${packets.length} packets`);
    return packets;
  } catch (err) {
    console.error('[phase-d] Cohort fetch failed:', err.message);
    return [];
  }
}

/**
 * Enrich Qdrant payload for canonical packets
 */
async function enrichQdrantPayloads(packets) {
  if (dryRun) {
    console.log(`[phase-d] DRY-RUN: would enrich ${packets.length} Qdrant points`);
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const packet of packets) {
    try {
      // Search Qdrant for points matching source_ref + packet_key
      const searchRes = await fetch(
        `${QDRANT_URL}/collections/codebase_chunks_768/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: { name: 'content', vector: new Array(768).fill(0) },
            filter: {
              must: [
                { key: 'source_ref', match: { value: packet.source_ref } },
                { key: 'packet_key', match: { value: packet.packet_key } },
              ],
            },
            limit: 100,
            with_payload: true,
          }),
          signal: AbortSignal.timeout(5_000),
        }
      );

      if (!searchRes.ok) {
        failed += 1;
        if (verbose) console.error(`[phase-d] Failed to search ${packet.source_ref}: HTTP ${searchRes.status}`);
        continue;
      }

      const searchBody = await searchRes.json();
      const points = searchBody.result || [];

      // Upsert points with Phase D enrichment
      const pointsToUpdate = points.map(p => ({
        id: p.id,
        payload: {
          ...p.payload,
          somCluster: packet.somCluster,
          treeNodeKey: packet.treeNodeKey,
          qdrantHit: true,
          metadata: {
            ...(p.payload?.metadata || {}),
            phase_d_enriched: true,
            enriched_at: new Date().toISOString(),
          },
        },
      }));

      if (pointsToUpdate.length > 0) {
        const upsertRes = await fetch(
          `${QDRANT_URL}/collections/codebase_chunks_768/points?wait=true`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              points: pointsToUpdate,
            }),
            signal: AbortSignal.timeout(5_000),
          }
        );

        if (upsertRes.ok) {
          success += 1;
        } else {
          failed += 1;
          if (verbose) console.error(`[phase-d] Failed to upsert ${packet.source_ref}: HTTP ${upsertRes.status}`);
        }
      }
    } catch (err) {
      if (verbose) console.error(`[phase-d] Failed to enrich ${packet.source_ref}:`, err.message);
      failed += 1;
    }

    if ((success + failed) % 10 === 0) {
      console.log(`[phase-d] Progress: ${success} success, ${failed} failed`);
    }
  }

  console.log(`[phase-d] ✅ Enriched ${success}/${packets.length} Qdrant payloads (${failed} failed)`);
  return { success, failed };
}

/**
 * Main pipeline
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  console.log('[phase-d-qdrant] Phase D: Qdrant Enrichment (Canonical Cohort Only)');
  console.log(`[phase-d-qdrant] Mode: ${dryRun ? 'DRY-RUN' : apply ? 'APPLY' : 'VERIFY'}`);
  console.log(`[phase-d-qdrant] Limit: ${limit} packets\n`);

  try {
    // Audit Qdrant cohorts
    console.log('[step-1] Audit Qdrant cohorts');
    const cohorts = await auditQdrantCohorts();
    console.log(`[phase-d] Total Qdrant points: ${cohorts.total}`);
    console.log(`[phase-d] With source_ref: ${cohorts.with_source_ref}`);
    console.log(`[phase-d] With packet_key: ${cohorts.with_packet_key}`);
    console.log(`[phase-d] Canonical eligible: ${cohorts.canonical_eligible}\n`);

    // Fetch canonical cohort
    console.log('[step-2] Fetch canonical cohort from atlas_packets');
    const packets = await fetchCanonicalCohort(pool, limit);

    // Enrich Qdrant
    if (apply) {
      console.log('\n[step-3] Enrich Qdrant payloads (Phase D fields)');
      const result = await enrichQdrantPayloads(packets);

      console.log('\n[summary] ✅ Phase D Qdrant enrichment complete');
      console.log(`[summary] Enriched: ${result.success}/${packets.length}`);
      console.log('[summary] Next: npm run atlas:phase-d:feature-cards (not yet implemented)');
    } else {
      console.log('\n[step-3] Skip enrichment (use --apply to persist)');
      console.log(`[summary] Preview: Would enrich ${packets.length} Qdrant points`);
    }
  } catch (err) {
    console.error('[error]', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
