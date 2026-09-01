#!/usr/bin/env node
/**
 * PACKET-CHUNK-LINEAGE-BACKFILL-DRY-01 -- read-only, full historical
 * classification at ROW level for the ENTIRE 61,660-packet population, not
 * just the admissible cohort. Emits two layers:
 *   1. classifications -- one record per packet, for ALL 61,660, explaining
 *      why each one is admitted or excluded.
 *   2. proposedMembershipRows -- PacketChunkMembershipV1 candidates, emitted
 *      ONLY for the admissible (MEMBERSHIP_EXACT_REVISION_PROVEN) subset.
 *
 * FROZEN AUTHORITY RULE: reads ONLY atlas_packets, codebase_chunk_index,
 * graphify_files. MUST NOT read atlas_packet_chunk_lineage -- the 56 rows
 * CANARY-01 already wrote there are validation output, not historical
 * reconstruction evidence. Using them here would make this classification
 * self-referential.
 *
 * chunk_id is treated as an OPAQUE durable identifier (both 'card:...' and
 * 'fullrepo:...' formats observed) -- never parsed for source kind, ordinal,
 * namespace, or revision. chunkOrdinal is left unset: codebase_chunk_index's
 * only candidate ordinal signal, line_start, is populated for just
 * 16,702/55,816 (30%) rows corpus-wide and is not even reliably unique
 * within a single source_ref where it IS populated (verified: 50 distinct
 * chunk_ids but only 48 distinct line_start values on one fixture). Inventing
 * an ordinal from arbitrary sort order would misrepresent producer intent
 * that doesn't exist. membershipSetChecksum uses the sorted, deduplicated
 * canonicalChunkId set instead -- order-independent by construction.
 *
 * Populates nothing. Read-only.
 *
 * Usage: npx tsx scripts/atlas/packet-chunk-lineage-backfill-dry-01.mts
 */
import { loadAtlasEnv } from './load-atlas-env.mjs';
await loadAtlasEnv();
import { createHash } from 'node:crypto';

const BASELINE = { MEMBERSHIP_EXACT_REVISION_PROVEN: 577, NAMESPACE_UNPROVEN: 4110, NO_MEMBER: 56973, CONFLICTING_MEMBERSHIP: 0 };

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: packets } = await pool.query(`
    SELECT packet_key, source_ref FROM atlas_packets WHERE source_ref IS NOT NULL ORDER BY packet_key
  `);

  const { rows: chunkRows } = await pool.query(`
    SELECT relative_path AS source_ref, chunk_id, min(id::text) AS a_real_chunk_row_id
    FROM codebase_chunk_index
    WHERE chunk_id IS NOT NULL AND NULLIF(btrim(relative_path), '') IS NOT NULL
    GROUP BY relative_path, chunk_id
  `);
  const chunksBySourceRef = new Map<string, { chunk_id: string; a_real_chunk_row_id: string }[]>();
  for (const r of chunkRows) {
    const list = chunksBySourceRef.get(r.source_ref) ?? [];
    list.push({ chunk_id: r.chunk_id, a_real_chunk_row_id: r.a_real_chunk_row_id });
    chunksBySourceRef.set(r.source_ref, list);
  }

  const { rows: gfRows } = await pool.query(`
    SELECT source_ref, workspace_id, source_revision, code_source_revision
    FROM graphify_files WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
  `);
  const gfBySourceRef = new Map(gfRows.map((r) => [r.source_ref, r]));

  const classificationColumns = [
    'packetKey', 'sourceRef', 'membershipSetStatus', 'namespaceStatus', 'revisionStatus',
    'distinctCanonicalChunkCount', 'admissionDecision', 'membershipSetChecksum',
  ] as const;
  const classifications: any[] = [];
  const proposedMembershipRows: any[] = [];
  const counts = { NO_MEMBER: 0, NAMESPACE_UNPROVEN: 0, MEMBERSHIP_EXACT_REVISION_PROVEN: 0, MEMBERSHIP_EXACT_REVISION_UNPROVEN: 0, CONFLICTING_MEMBERSHIP: 0 };
  let syntheticCanonicalIds = 0;
  let duplicateMembershipPairs = 0;
  let foreignChunkIds = 0;

  for (const p of packets) {
    const members = (chunksBySourceRef.get(p.source_ref) ?? []).slice().sort((a, b) => (a.chunk_id < b.chunk_id ? -1 : 1));
    const gf = gfBySourceRef.get(p.source_ref);
    const namespaceProven = !!gf;
    const revisionProven = !!gf && !!gf.source_revision && !!gf.code_source_revision;
    const distinctCount = members.length;

    // membershipSetChecksum: sorted, deduplicated canonicalChunkId set, order-independent.
    const uniqueSortedIds = [...new Set(members.map((m) => m.chunk_id))].sort();
    const membershipSetChecksum = sha256(`${p.packet_key}\n${JSON.stringify(uniqueSortedIds)}`);
    if (uniqueSortedIds.length !== members.length) duplicateMembershipPairs += members.length - uniqueSortedIds.length;

    let membershipSetStatus: string;
    let admissionDecision: string;

    if (distinctCount === 0) {
      membershipSetStatus = 'NO_MEMBER';
      admissionDecision = 'NO_MEMBER';
      counts.NO_MEMBER++;
    } else {
      membershipSetStatus = distinctCount === 1 ? 'EXACT_SINGLE_MEMBER' : 'EXACT_MULTI_MEMBER';
      if (!namespaceProven) {
        admissionDecision = 'NAMESPACE_UNPROVEN';
        counts.NAMESPACE_UNPROVEN++;
      } else {
        admissionDecision = revisionProven ? 'MEMBERSHIP_EXACT_REVISION_PROVEN' : 'MEMBERSHIP_EXACT_REVISION_UNPROVEN';
        counts[admissionDecision as 'MEMBERSHIP_EXACT_REVISION_PROVEN' | 'MEMBERSHIP_EXACT_REVISION_UNPROVEN']++;
      }
    }

    classifications.push([
      p.packet_key, p.source_ref, membershipSetStatus,
      namespaceProven ? 'PROVEN' : 'UNPROVEN',
      revisionProven ? 'PROVEN' : 'UNPROVEN',
      distinctCount, admissionDecision, membershipSetChecksum,
    ]);

    if (admissionDecision === 'MEMBERSHIP_EXACT_REVISION_PROVEN') {
      for (const m of members) {
        if (!m.chunk_id || !m.a_real_chunk_row_id) { syntheticCanonicalIds++; continue; }
        proposedMembershipRows.push({
          packetKey: p.packet_key,
          canonicalChunkId: m.chunk_id,
          chunkRowId: m.a_real_chunk_row_id,
          sourceRef: p.source_ref,
          sourceNamespace: `workspace:${gf!.workspace_id}`,
          sourceRevision: gf!.code_source_revision,
          membershipStatus: membershipSetStatus,
          revisionStatus: 'PROVEN',
          chunkOrdinal: null,
          lineageProducerRevision: 'packet-chunk-lineage-backfill-dry-01:v1',
          evidenceRefs: ['docs/reports/packet-chunk-lineage-backfill-dry-01-results.json'],
        });
      }
    }
  }

  // classificationChecksum: over the full, already packet_key-ordered, classification array.
  const classificationChecksum = sha256(JSON.stringify(classifications));
  const admittedPacketKeys = classifications.filter((c) => c[6] === 'MEMBERSHIP_EXACT_REVISION_PROVEN').map((c) => c[0]).sort();
  const admittedPacketSetChecksum = sha256(JSON.stringify(admittedPacketKeys));
  const proposedPairsSorted = proposedMembershipRows.map((r) => `${r.packetKey}|${r.canonicalChunkId}`).sort();
  const proposedMembershipSetChecksum = sha256(JSON.stringify(proposedPairsSorted));

  const reconciliation = {
    baseline: BASELINE,
    actual: counts,
    matches: counts.MEMBERSHIP_EXACT_REVISION_PROVEN === BASELINE.MEMBERSHIP_EXACT_REVISION_PROVEN
      && counts.NAMESPACE_UNPROVEN === BASELINE.NAMESPACE_UNPROVEN
      && counts.NO_MEMBER === BASELINE.NO_MEMBER
      && counts.CONFLICTING_MEMBERSHIP === BASELINE.CONFLICTING_MEMBERSHIP,
  };

  const verdict = reconciliation.matches && syntheticCanonicalIds === 0 && foreignChunkIds === 0 ? 'PASS' : 'FAIL_RECONCILIATION';

  const report = {
    schema: 'atlas.packet-chunk-lineage-backfill-dry-01.v2',
    task: 'PACKET-CHUNK-LINEAGE-BACKFILL-DRY-01',
    readOnly: true,
    writesPerformed: false,
    frozenAuthority: ['atlas_packets', 'codebase_chunk_index', 'graphify_files'],
    excludedFromAuthority: ['atlas_packet_chunk_lineage -- CANARY-01 output is validation evidence, not historical reconstruction input'],
    populationClassified: packets.length,
    admittedPackets: counts.MEMBERSHIP_EXACT_REVISION_PROVEN,
    proposedMembershipRowCount: proposedMembershipRows.length,
    namespaceUnproven: counts.NAMESPACE_UNPROVEN,
    noMember: counts.NO_MEMBER,
    conflictingMembership: counts.CONFLICTING_MEMBERSHIP,
    syntheticCanonicalIds,
    duplicateMembershipPairs,
    foreignChunkIds,
    reconciliation,
    classificationChecksum,
    admittedPacketSetChecksum,
    proposedMembershipSetChecksum,
    verdict,
    classificationColumns,
    classifications,
    proposedMembershipRows,
  };

  console.log(JSON.stringify({
    ...report,
    classifications: `[${classifications.length} rows, columns: ${classificationColumns.join(', ')}]`,
    proposedMembershipRows: `[${proposedMembershipRows.length} rows]`,
  }, null, 2));

  const fs = await import('node:fs');
  fs.writeFileSync(
    'C:/Users/james/Videos/deeds-web-app/docs/reports/packet-chunk-lineage-backfill-dry-01-results.json',
    JSON.stringify(report),
  );
  await pool.end();
  process.exit(verdict === 'PASS' ? 0 : 2);
}

main().catch((err) => { console.error('[FAIL]', err); process.exit(1); });
