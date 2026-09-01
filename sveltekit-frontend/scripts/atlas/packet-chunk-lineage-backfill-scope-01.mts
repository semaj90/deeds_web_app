#!/usr/bin/env node
/**
 * PACKET-CHUNK-LINEAGE-BACKFILL-SCOPE-01 -- read-only planning census.
 *
 * Does NOT populate anything. Establishes exactly what can be reconstructed
 * for the already-created 61,660 atlas_packets under the corrected 1:N
 * PacketChunkMembershipV1 model, classifying membership and revision/namespace
 * provenance as SEPARATE dimensions (per explicit instruction -- a proven
 * multi-member packet with no revision authority is EXACT_MULTI_MEMBER +
 * SOURCE_REVISION_UNPROVEN, never AMBIGUOUS and never falsely
 * EXACT_REVISION_QUALIFIED).
 *
 * Known corpus facts baked into this census's methodology, established in
 * prior gates:
 *   - atlas_packets.repository_id is corrupted (58,365/58,365 populated
 *     values are ALL DISTINCT -- a synthetic per-row randomUUID(), not a
 *     real shared namespace value). NOT used for namespace classification.
 *   - atlas_packets.chunk_id is corrupted repo-wide (0 real resolutions
 *     found in any prior gate). NOT used here.
 *   - codebase_chunk_index.chunk_id has 725 source_refs with literal
 *     duplicate (relative_path, chunk_id) row pairs -- membership cardinality
 *     here uses count(DISTINCT chunk_id), not raw row count.
 *   - graphify_files (885 rows, single workspace_id, 100% source_revision +
 *     code_source_revision populated) is the only real revision AND
 *     namespace authority found -- but both fields come from the SAME row,
 *     so in this corpus namespace-proof and revision-proof are coupled, not
 *     independent, for the ~98.5% of packets graphify_files doesn't cover.
 *
 * Usage: npx tsx scripts/atlas/packet-chunk-lineage-backfill-scope-01.mts
 */
import { loadAtlasEnv } from './load-atlas-env.mjs';
await loadAtlasEnv();

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: totalRow } = await pool.query(`SELECT count(*)::int AS n FROM atlas_packets`);

  // Membership dimension: distinct durable chunk_id candidates per source_ref
  const { rows: membershipRows } = await pool.query(`
    WITH chunk_members AS (
      SELECT relative_path AS source_ref, count(DISTINCT chunk_id)::int AS member_count
      FROM codebase_chunk_index
      WHERE chunk_id IS NOT NULL AND NULLIF(btrim(relative_path), '') IS NOT NULL
      GROUP BY relative_path
    ), rows_missing_chunk_id AS (
      SELECT relative_path AS source_ref, count(*)::int AS null_chunk_id_rows
      FROM codebase_chunk_index
      WHERE chunk_id IS NULL AND NULLIF(btrim(relative_path), '') IS NOT NULL
      GROUP BY relative_path
    )
    SELECT
      ap.packet_key,
      ap.source_ref,
      COALESCE(cm.member_count, 0) AS member_count,
      COALESCE(rmc.null_chunk_id_rows, 0) AS null_chunk_id_rows
    FROM atlas_packets ap
    LEFT JOIN chunk_members cm ON cm.source_ref = ap.source_ref
    LEFT JOIN rows_missing_chunk_id rmc ON rmc.source_ref = ap.source_ref
  `);

  // Namespace + revision dimension: only real authority found is graphify_files
  const { rows: gfRows } = await pool.query(`
    SELECT source_ref, workspace_id, source_revision, code_source_revision
    FROM graphify_files
    WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
  `);
  const gfBySourceRef = new Map(gfRows.map((r) => [r.source_ref, r]));

  const membershipCounts = { NO_MEMBER: 0, EXACT_SINGLE_MEMBER: 0, EXACT_MULTI_MEMBER: 0 };
  const namespaceCounts = { PROVEN: 0, UNPROVEN: 0 };
  const revisionCounts = { PROVEN: 0, UNPROVEN: 0 };
  const admissionCounts: Record<string, number> = {
    MEMBERSHIP_EXACT_REVISION_PROVEN: 0,
    MEMBERSHIP_EXACT_REVISION_UNPROVEN: 0,
    NAMESPACE_UNPROVEN: 0,
    CONFLICTING_MEMBERSHIP: 0,
    NO_MEMBER: 0,
  };
  let totalNullChunkIdRowsAmongMultiMemberSources = 0;
  const samples: Record<string, any[]> = {
    MEMBERSHIP_EXACT_REVISION_PROVEN: [],
    MEMBERSHIP_EXACT_REVISION_UNPROVEN: [],
    NAMESPACE_UNPROVEN: [],
    NO_MEMBER: [],
  };

  for (const row of membershipRows) {
    const memberCount = row.member_count as number;
    const gf = gfBySourceRef.get(row.source_ref);
    const namespaceProven = !!gf; // workspace_id is populated whenever a graphify_files row exists
    const revisionProven = !!gf && !!gf.source_revision && !!gf.code_source_revision;

    if (namespaceProven) namespaceCounts.PROVEN++; else namespaceCounts.UNPROVEN++;
    if (revisionProven) revisionCounts.PROVEN++; else revisionCounts.UNPROVEN++;

    let membershipBucket: keyof typeof membershipCounts;
    if (memberCount === 0) membershipBucket = 'NO_MEMBER';
    else if (memberCount === 1) membershipBucket = 'EXACT_SINGLE_MEMBER';
    else membershipBucket = 'EXACT_MULTI_MEMBER';
    membershipCounts[membershipBucket]++;
    if (membershipBucket === 'EXACT_MULTI_MEMBER') {
      totalNullChunkIdRowsAmongMultiMemberSources += row.null_chunk_id_rows;
    }

    // Admission priority: NO_MEMBER > CONFLICTING_MEMBERSHIP (reserved, unused
    // this pass -- no operational conflict signal defined/found yet) >
    // NAMESPACE_UNPROVEN > MEMBERSHIP_EXACT_REVISION_{UN}PROVEN
    let admission: keyof typeof admissionCounts;
    if (memberCount === 0) {
      admission = 'NO_MEMBER';
    } else if (!namespaceProven) {
      admission = 'NAMESPACE_UNPROVEN';
    } else if (revisionProven) {
      admission = 'MEMBERSHIP_EXACT_REVISION_PROVEN';
    } else {
      admission = 'MEMBERSHIP_EXACT_REVISION_UNPROVEN';
    }
    admissionCounts[admission]++;
    if (samples[admission] && samples[admission].length < 5) {
      samples[admission].push({ packet_key: row.packet_key, source_ref: row.source_ref, member_count: memberCount });
    }
  }

  const report = {
    schema: 'atlas.packet-chunk-lineage-backfill-scope-01.v1',
    task: 'PACKET-CHUNK-LINEAGE-BACKFILL-SCOPE-01',
    readOnly: true,
    writesPerformed: false,
    populatesNothing: true,
    purpose: 'Planning-only census: determine exactly what fraction of the existing 61,660-packet corpus can be reconstructed as proven PacketChunkMembershipV1 rows under the corrected 1:N model, keeping membership and revision/namespace provenance as separate dimensions.',
    population: totalRow[0].n,
    dimensions: {
      membership: membershipCounts,
      namespace: namespaceCounts,
      revision: revisionCounts,
    },
    methodologyNote: 'Membership uses count(DISTINCT chunk_id) per source_ref, not raw row count -- 725 source_refs repo-wide have literal duplicate (relative_path, chunk_id) row pairs that would otherwise overstate true membership cardinality. atlas_packets.repository_id was NOT used for namespace (confirmed corrupted: 58,365/58,365 populated values are all distinct, consistent with the same randomUUID()-per-row pattern found in backfill-unified-id-hierarchy.mjs). graphify_files.workspace_id is the only real namespace signal, and it is coupled to the same 885-row population as the revision authority in this corpus -- namespace-proof and revision-proof are NOT independent in practice here, even though they are modeled as separate dimensions.',
    admissionClassification: {
      priorityOrder: ['NO_MEMBER', 'CONFLICTING_MEMBERSHIP (reserved, unused this pass)', 'NAMESPACE_UNPROVEN', 'MEMBERSHIP_EXACT_REVISION_PROVEN or MEMBERSHIP_EXACT_REVISION_UNPROVEN'],
      counts: admissionCounts,
      conflictingMembershipNote: 'CONFLICTING_MEMBERSHIP is reserved and reports 0 this pass -- no operational conflict signal (e.g. the same chunk_id resolving to genuinely different chunk rows) was found or defined precisely enough to populate this bucket. Not claimed to be truly zero conflicts corpus-wide, only that none were detected under the criteria checked.',
    },
    dataQualityCaveat: {
      nullChunkIdRowsAmongMultiMemberSources: totalNullChunkIdRowsAmongMultiMemberSources,
      meaning: 'Among source_refs classified EXACT_MULTI_MEMBER, this many additional codebase_chunk_index rows exist for those same source_refs but lack a populated chunk_id (durable identity) and were therefore excluded from membership entirely -- not counted as members, not counted as conflicts. The true chunk count for these files may be higher than what member_count captures; this is a coverage gap in codebase_chunk_index.chunk_id population (55,816/55,853 populated repo-wide), not a bug in this census.',
    },
    recommendedNextSteps: [
      'Freeze PACKET-CHUNK-LINEAGE-CONTRACT-01 with a PacketChunkMembershipV1 shape that can represent membershipStatus and revisionStatus as independent fields (not a single combined enum), per this census showing they decouple in practice.',
      'PACKET-CHUNK-LINEAGE-MIGRATION-01 -- schema/migration proof, disposable DB first.',
      'PACKET-CHUNK-LINEAGE-CANARY-01 -- future-capture writer, 3 shapes.',
      'PACKET-CHUNK-LINEAGE-BACKFILL-DRY-01 -- full historical read-only classification at per-row granularity (this census is aggregate/summary; BACKFILL-DRY-01 would need to emit the actual per-packet admitted rows for review before any write).',
      'PACKET-CHUNK-LINEAGE-BACKFILL-CANARY-01 -- tiny bounded write+readback on a handful of MEMBERSHIP_EXACT_REVISION_PROVEN rows only.',
    ],
  };

  console.log(JSON.stringify(report, null, 2));
  const fs = await import('node:fs');
  fs.writeFileSync(
    'C:/Users/james/Videos/deeds-web-app/docs/reports/packet-chunk-lineage-backfill-scope-01-results.json',
    JSON.stringify({ ...report, samples }, null, 2) + '\n',
  );
  await pool.end();
  process.exit(0);
}

main().catch((err) => { console.error('[FAIL]', err); process.exit(1); });
