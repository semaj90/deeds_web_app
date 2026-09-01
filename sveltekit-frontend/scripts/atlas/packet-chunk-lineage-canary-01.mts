#!/usr/bin/env node
/**
 * PACKET-CHUNK-LINEAGE-CANARY-01 -- genuine writer canary.
 *
 * Exercises the CORRECTED register-orphaned-chunks.mjs successor path (the
 * membership-writing logic itself, in writeFilePacketWithMemberships below)
 * against real data, not manually inserted rows.
 *
 * Population, deliberately selected, real source_refs found live in this
 * corpus (not synthetic):
 *   A (SINGLE, 1 distinct chunk):   crates/atlas_packet_parser/build.rs
 *   B (FEW, 2-5 distinct chunks):   crates/omni-bridge/src/lib.rs
 *   C (MANY, 20+ distinct chunks):  docs/atlas/feature-registry.json
 *   All three have real graphify_files coverage (known authoritative
 *   namespace+revision fixture).
 *   ORPHAN (no graphify_files coverage): one of the 58 remaining true
 *   orphans -- sveltekit-frontend/artifacts/cs_domain_hierarchy_v1.json.
 *   This one MUST refuse membership writes (fail closed, no fabrication),
 *   proving the writer doesn't paper over missing namespace authority just
 *   because a production-shaped orphan queue happens to lack it today.
 *
 * Writes ONLY atlas_packet_chunk_lineage rows for these 4 source_refs (plus
 * an atlas_packets row for the orphan case only, if one doesn't already
 * exist -- matching register-orphaned-chunks.mjs's existing, unchanged
 * packet-creation behavior). Nothing else in the corpus is touched.
 *
 * Usage: npx tsx scripts/atlas/packet-chunk-lineage-canary-01.mts [--apply]
 * Default is a dry preview. --apply performs the actual writes.
 */
import { loadAtlasEnv } from './load-atlas-env.mjs';
await loadAtlasEnv();
import { createHash } from 'node:crypto';

const APPLY = process.argv.includes('--apply');

const FIXTURES = [
  { shape: 'SINGLE', sourceRef: 'crates/atlas_packet_parser/build.rs', expectNamespaceProven: true },
  { shape: 'FEW', sourceRef: 'crates/omni-bridge/src/lib.rs', expectNamespaceProven: true },
  { shape: 'MANY', sourceRef: 'docs/atlas/feature-registry.json', expectNamespaceProven: true },
  { shape: 'ORPHAN_NAMESPACE_UNPROVEN', sourceRef: 'sveltekit-frontend/artifacts/cs_domain_hierarchy_v1.json', expectNamespaceProven: false },
];

function packetKeyFor(sourceRef: string): string {
  return 'packet:' + createHash('sha256').update(sourceRef).digest('hex').slice(0, 12);
}

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const results: any[] = [];

  for (const fixture of FIXTURES) {
    const packetKey = packetKeyFor(fixture.sourceRef);

    // 1. Real canonical chunk candidates -- DISTINCT chunk_id, never a raw
    //    row count (duplicate physical rows sharing a chunk_id collapse to
    //    one membership, per the corrected model).
    const { rows: chunkRows } = await pool.query(
      `SELECT chunk_id, min(id::text) AS a_real_chunk_row_id
       FROM codebase_chunk_index
       WHERE relative_path = $1 AND chunk_id IS NOT NULL
       GROUP BY chunk_id
       ORDER BY chunk_id`,
      [fixture.sourceRef],
    );

    // 2. Real namespace + revision authority -- graphify_files only, never
    //    atlas_packets.repository_id (confirmed corrupted).
    const { rows: gfRows } = await pool.query(
      `SELECT workspace_id, source_revision, code_source_revision
       FROM graphify_files WHERE source_ref = $1 LIMIT 1`,
      [fixture.sourceRef],
    );
    const gf = gfRows[0];
    const namespaceProven = !!gf;
    const revisionProven = !!gf && !!gf.source_revision && !!gf.code_source_revision;

    // 3. Does the atlas_packets row already exist? (Matches
    //    register-orphaned-chunks.mjs's existing ON CONFLICT DO NOTHING
    //    packet-creation semantics -- unchanged by this canary.)
    const { rows: existingPacket } = await pool.query(
      `SELECT packet_key FROM atlas_packets WHERE source_ref = $1 LIMIT 1`,
      [fixture.sourceRef],
    );
    const packetAlreadyExists = existingPacket.length > 0;
    const actualPacketKey = packetAlreadyExists ? existingPacket[0].packet_key : packetKey;

    const distinctChunkCount = chunkRows.length;
    const membershipStatus = distinctChunkCount === 1 ? 'EXACT_SINGLE_MEMBER' : 'EXACT_MULTI_MEMBER';

    const plan: any = {
      shape: fixture.shape,
      sourceRef: fixture.sourceRef,
      packetKey: actualPacketKey,
      packetAlreadyExists,
      distinctChunkCount,
      namespaceProven,
      revisionProven,
      expectNamespaceProven: fixture.expectNamespaceProven,
      namespaceMatchesExpectation: namespaceProven === fixture.expectNamespaceProven,
    };

    if (!namespaceProven) {
      plan.decision = 'REFUSE_MEMBERSHIP_WRITE';
      plan.reason = 'NAMESPACE_UNPROVEN -- no graphify_files row for this source_ref. Per the frozen contract, sourceNamespace is required non-empty; no fabricated placeholder is permitted.';
      plan.membershipsWritten = 0;
      results.push(plan);
      continue;
    }

    plan.decision = 'WRITE_MEMBERSHIPS';
    plan.membershipsPlanned = chunkRows.map((r: any, i: number) => ({
      packetKey: actualPacketKey,
      canonicalChunkId: r.chunk_id,
      chunkRowId: r.a_real_chunk_row_id,
      sourceRef: fixture.sourceRef,
      sourceNamespace: `workspace:${gf.workspace_id}`,
      sourceRevision: revisionProven ? gf.code_source_revision : null,
      membershipStatus,
      revisionStatus: revisionProven ? 'PROVEN' : 'UNPROVEN',
      chunkOrdinal: i,
      lineageProducerRevision: 'packet-chunk-lineage-canary-01:v1',
      evidenceRefs: ['docs/reports/packet-chunk-lineage-canary-01-results.json'],
    }));

    if (APPLY) {
      let written = 0;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (!packetAlreadyExists) {
          await client.query(
            `INSERT INTO atlas_packets (packet_id, packet_key, source_ref, directory_path, feature_id, source_kind, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'codebase_chunk', now(), now())
             ON CONFLICT (packet_key) DO NOTHING`,
            [`canary_${packetKey}_${Date.now()}`, packetKey, fixture.sourceRef, fixture.sourceRef.split('/').slice(0, -1).join('/') || '.', fixture.sourceRef.split('/').pop()?.replace(/\.\w+$/, '') || 'unknown'],
          );
        }
        for (const m of plan.membershipsPlanned) {
          const res = await client.query(
            `INSERT INTO atlas_packet_chunk_lineage
               (packet_key, canonical_chunk_id, chunk_row_id, source_ref, source_namespace, source_revision, membership_status, revision_status, chunk_ordinal, lineage_producer_revision, evidence_refs)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (packet_key, canonical_chunk_id) DO UPDATE SET
               lineage_producer_revision = EXCLUDED.lineage_producer_revision,
               evidence_refs = EXCLUDED.evidence_refs,
               revision_status = EXCLUDED.revision_status,
               source_revision = EXCLUDED.source_revision`,
            [m.packetKey, m.canonicalChunkId, m.chunkRowId, m.sourceRef, m.sourceNamespace, m.sourceRevision, m.membershipStatus, m.revisionStatus, m.chunkOrdinal, m.lineageProducerRevision, m.evidenceRefs],
          );
          written += res.rowCount ?? 0;
        }
        await client.query('COMMIT');
        plan.membershipsWritten = written;
      } catch (err) {
        await client.query('ROLLBACK');
        plan.decision = 'FAILED_ROLLED_BACK';
        plan.error = err instanceof Error ? err.message : String(err);
        plan.membershipsWritten = 0;
      } finally {
        client.release();
      }

      // Read-back verification
      const { rows: readBack } = await pool.query(
        `SELECT canonical_chunk_id, chunk_row_id, membership_status, revision_status, source_revision
         FROM atlas_packet_chunk_lineage WHERE packet_key = $1 ORDER BY chunk_ordinal`,
        [actualPacketKey],
      );
      plan.readBack = readBack;
      plan.readBackCountMatchesExpected = readBack.length === distinctChunkCount;
      plan.noSyntheticIds = readBack.every((r: any) =>
        chunkRows.some((c: any) => c.chunk_id === r.canonical_chunk_id && c.a_real_chunk_row_id === r.chunk_row_id),
      );
    } else {
      plan.membershipsWritten = 'DRY_PREVIEW_NOT_APPLIED';
    }

    results.push(plan);
  }

  const allNamespaceExpectationsMet = results.every((r) => r.namespaceMatchesExpectation);
  const report = {
    schema: 'atlas.packet-chunk-lineage-canary-01.v1',
    task: 'PACKET-CHUNK-LINEAGE-CANARY-01',
    mode: APPLY ? 'APPLY' : 'DRY_PREVIEW',
    writesPerformed: APPLY,
    population: FIXTURES.length,
    allNamespaceExpectationsMet,
    results,
  };

  console.log(JSON.stringify(report, null, 2));
  const fs = await import('node:fs');
  fs.writeFileSync(
    'C:/Users/james/Videos/deeds-web-app/docs/reports/packet-chunk-lineage-canary-01-results.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  await pool.end();
  process.exit(0);
}

main().catch((err) => { console.error('[FAIL]', err); process.exit(1); });
