#!/usr/bin/env node
/**
 * PACKET-CHUNK-LINEAGE-BACKFILL-DRY-01 -- read-only, full historical
 * classification at ROW level (not aggregate counts, which BACKFILL-SCOPE-01
 * already established: 577 MEMBERSHIP_EXACT_REVISION_PROVEN / 61,660).
 *
 * For every admissible packet, emits the actual planned PacketChunkMembershipV1
 * rows (not just a count) plus a deterministic membershipSetChecksum per
 * packet (sha256 of the sorted canonicalChunkId list), so this dry run's
 * admitted set can be verified reproducible before any write, and later
 * diffed against whatever PACKET-CHUNK-LINEAGE-BACKFILL-CANARY-01/PROMOTION-01
 * actually persists.
 *
 * Populates nothing. Read-only.
 *
 * Usage: npx tsx scripts/atlas/packet-chunk-lineage-backfill-dry-01.mts
 */
import { loadAtlasEnv } from './load-atlas-env.mjs';
await loadAtlasEnv();
import { createHash } from 'node:crypto';

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: packets } = await pool.query(`
    SELECT packet_key, source_ref FROM atlas_packets WHERE source_ref IS NOT NULL
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

  // Packets already written for real by CANARY-01, flagged not double-counted as new backfill work.
  const { rows: alreadyWritten } = await pool.query(`
    SELECT DISTINCT packet_key FROM atlas_packet_chunk_lineage
  `);
  const alreadyWrittenSet = new Set(alreadyWritten.map((r) => r.packet_key));

  const admitted: any[] = [];
  const counts = {
    NO_MEMBER: 0,
    NAMESPACE_UNPROVEN: 0,
    MEMBERSHIP_EXACT_REVISION_PROVEN: 0,
    MEMBERSHIP_EXACT_REVISION_UNPROVEN: 0,
    CONFLICTING_MEMBERSHIP: 0,
  };
  let alreadyWrittenCount = 0;

  for (const p of packets) {
    const members = chunksBySourceRef.get(p.source_ref) ?? [];
    const gf = gfBySourceRef.get(p.source_ref);
    const namespaceProven = !!gf;
    const revisionProven = !!gf && !!gf.source_revision && !!gf.code_source_revision;

    if (members.length === 0) {
      counts.NO_MEMBER++;
      continue;
    }
    if (!namespaceProven) {
      counts.NAMESPACE_UNPROVEN++;
      continue;
    }

    const admission = revisionProven ? 'MEMBERSHIP_EXACT_REVISION_PROVEN' : 'MEMBERSHIP_EXACT_REVISION_UNPROVEN';
    counts[admission]++;

    const membershipStatus = members.length === 1 ? 'EXACT_SINGLE_MEMBER' : 'EXACT_MULTI_MEMBER';
    const sortedChunkIds = [...members.map((m) => m.chunk_id)].sort();
    const membershipSetChecksum = createHash('sha256')
      .update(`${p.packet_key}\n${sortedChunkIds.join('\n')}`)
      .digest('hex');

    const plannedRows = members
      .sort((a, b) => (a.chunk_id < b.chunk_id ? -1 : 1))
      .map((m, i) => ({
        packetKey: p.packet_key,
        canonicalChunkId: m.chunk_id,
        chunkRowId: m.a_real_chunk_row_id,
        sourceRef: p.source_ref,
        sourceNamespace: `workspace:${gf!.workspace_id}`,
        sourceRevision: revisionProven ? gf!.code_source_revision : null,
        membershipStatus,
        revisionStatus: revisionProven ? 'PROVEN' : 'UNPROVEN',
        chunkOrdinal: i,
        lineageProducerRevision: 'packet-chunk-lineage-backfill-dry-01:v1',
        evidenceRefs: ['docs/reports/packet-chunk-lineage-backfill-dry-01-results.json'],
      }));

    const alreadyWrittenForThisPacket = alreadyWrittenSet.has(p.packet_key);
    if (alreadyWrittenForThisPacket) alreadyWrittenCount++;

    admitted.push({
      packetKey: p.packet_key,
      sourceRef: p.source_ref,
      admission,
      memberCount: members.length,
      membershipSetChecksum,
      alreadyWrittenByCanary01: alreadyWrittenForThisPacket,
      plannedRows,
    });
  }

  const totalPlannedRows = admitted.reduce((sum, a) => sum + a.plannedRows.length, 0);

  const report = {
    schema: 'atlas.packet-chunk-lineage-backfill-dry-01.v1',
    task: 'PACKET-CHUNK-LINEAGE-BACKFILL-DRY-01',
    readOnly: true,
    writesPerformed: false,
    populatesNothing: true,
    population: packets.length,
    aggregateCounts: counts,
    crossCheckAgainstBackfillScope01: {
      expected: { MEMBERSHIP_EXACT_REVISION_PROVEN: 577, NAMESPACE_UNPROVEN: 4110, NO_MEMBER: 56973 },
      actual: counts,
      matches: counts.MEMBERSHIP_EXACT_REVISION_PROVEN === 577 && counts.NAMESPACE_UNPROVEN === 4110 && counts.NO_MEMBER === 56973,
    },
    admittedPacketCount: admitted.length,
    totalPlannedMembershipRows: totalPlannedRows,
    alreadyWrittenByCanary01Count: alreadyWrittenCount,
    admitted,
  };

  console.log(JSON.stringify({
    ...report,
    admitted: `[${admitted.length} packets, see written report file for full row-level detail]`,
  }, null, 2));
  const fs = await import('node:fs');
  fs.writeFileSync(
    'C:/Users/james/Videos/deeds-web-app/docs/reports/packet-chunk-lineage-backfill-dry-01-results.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  await pool.end();
  process.exit(0);
}

main().catch((err) => { console.error('[FAIL]', err); process.exit(1); });
