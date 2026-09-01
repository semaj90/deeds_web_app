#!/usr/bin/env node
/**
 * PACKET-CHUNK-LINEAGE-BACKFILL-CANARY-01 -- bounded historical reconstruction
 * canary. Distinct from CANARY-01 (which proved the future-capture writer):
 * this proves PROMOTION of the frozen BACKFILL-DRY-01 artifact into real
 * atlas_packet_chunk_lineage rows, for 4 deliberately-chosen HISTORICAL
 * PACKETS (complete membership sets, not a random handful of rows).
 *
 * Fixtures (packetKeys pulled from the frozen dry-run result, excluding the
 * dry run's own admission computation -- this script does NOT rediscover
 * source/chunk lineage, it only promotes what BACKFILL-DRY-01 already proved):
 *   A SINGLE (1 proposed membership):   packet:00848415f727
 *   B FEW (2 proposed memberships):     ace:packet:7802b2572378
 *   C MANY (30 proposed memberships):   ace:packet:0051e908c9be
 *   D CANARY_OVERLAP (already has 5 real rows from CANARY-01's future-capture
 *     writer): packet:ce6dfc5484ac -- proves historical reconstruction and
 *     future capture converge on the same canonical membership identity
 *     rather than creating parallel/duplicate rows.
 *
 * For A/B/C/D, proposedMembershipRows are read VERBATIM from the frozen
 * docs/reports/packet-chunk-lineage-backfill-dry-01-results.json -- never
 * recomputed from source tables here. Checksum reuses the exact shared
 * helper BACKFILL-DRY-01 uses (scripts/atlas/lib/packet-chunk-membership-checksum.mjs).
 *
 * Atomicity: BEGIN -> validate the complete proposal -> UPSERT all N members
 * -> read back N members -> recompute checksum -> COMMIT only if the
 * read-back checksum exactly matches the dry run's recorded checksum for
 * that packet, else ROLLBACK. A packet never lands partially populated.
 *
 * Runs the whole canary TWICE (replay gate) to prove idempotency under the
 * corrected UNIQUE(packet_key, canonical_chunk_id) constraint: row count,
 * checksums, and the canonical pair set must be identical after replay.
 *
 * Usage: npx tsx scripts/atlas/packet-chunk-lineage-canary-01... wait, this file:
 *   npx tsx scripts/atlas/packet-chunk-lineage-backfill-canary-01.mts [--apply]
 * Default is a dry preview (loads and validates fixtures, no DB writes).
 * --apply performs the actual atomic writes, twice (initial + replay).
 */
import { loadAtlasEnv } from './load-atlas-env.mjs';
await loadAtlasEnv();
import { readFileSync } from 'node:fs';
import { computeMembershipSetChecksum } from './lib/packet-chunk-membership-checksum.mjs';

const APPLY = process.argv.includes('--apply');
const DRY_RUN_REPORT_PATH = 'C:/Users/james/Videos/deeds-web-app/docs/reports/packet-chunk-lineage-backfill-dry-01-results.json';

const FIXTURES = [
  { shape: 'SINGLE', packetKey: 'packet:00848415f727', expectBeforeCount: 0 },
  { shape: 'FEW', packetKey: 'ace:packet:7802b2572378', expectBeforeCount: 0 },
  { shape: 'MANY', packetKey: 'ace:packet:0051e908c9be', expectBeforeCount: 0 },
  { shape: 'CANARY_OVERLAP', packetKey: 'packet:ce6dfc5484ac', expectBeforeCount: 5 },
];

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Load the FROZEN dry-run artifact -- source of truth for what to promote.
  // No source/chunk lineage is rediscovered in this script.
  const dryRun = JSON.parse(readFileSync(DRY_RUN_REPORT_PATH, 'utf8'));
  const cols = dryRun.classificationColumns as string[];
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
  const classificationByPacketKey = new Map(
    dryRun.classifications.map((c: any[]) => [c[idx.packetKey], c]),
  );
  const proposedByPacketKey = new Map<string, any[]>();
  for (const row of dryRun.proposedMembershipRows) {
    const list = proposedByPacketKey.get(row.packetKey) ?? [];
    list.push(row);
    proposedByPacketKey.set(row.packetKey, list);
  }

  async function runOnePass(passLabel: string) {
    const passResults: any[] = [];
    for (const fixture of FIXTURES) {
      const proposed = proposedByPacketKey.get(fixture.packetKey) ?? [];
      const classification = classificationByPacketKey.get(fixture.packetKey) as any[] | undefined;
      const dryRunChecksum = classification?.[idx.membershipSetChecksum] as string | undefined;

      if (proposed.length === 0 || !dryRunChecksum) {
        passResults.push({ shape: fixture.shape, packetKey: fixture.packetKey, error: 'FIXTURE_NOT_FOUND_IN_FROZEN_DRY_RUN', decision: 'ABORT' });
        continue;
      }

      const { rows: beforeRows } = await pool.query(
        `SELECT canonical_chunk_id, source_namespace, source_revision FROM atlas_packet_chunk_lineage WHERE packet_key = $1 ORDER BY canonical_chunk_id`,
        [fixture.packetKey],
      );
      const beforeCount = beforeRows.length;
      const beforeCanonicalPairs = new Set(beforeRows.map((r: any) => r.canonical_chunk_id));

      // On the initial pass, "before" reflects real pre-canary state (0 for
      // new fixtures, 5 for the pre-existing CANARY-01 overlap). On replay,
      // pass 1 already committed -- "before" is legitimately proposed.length
      // for every fixture (an idempotent UPSERT leaves the row count
      // unchanged from what pass 1 just wrote), not the pre-canary baseline.
      const expectBeforeCount = passLabel === 'replay' ? proposed.length : fixture.expectBeforeCount;

      const result: any = {
        shape: fixture.shape,
        packetKey: fixture.packetKey,
        proposedCount: proposed.length,
        beforeMembershipCount: beforeCount,
        expectBeforeCount,
        beforeCountMatchesExpectation: beforeCount === expectBeforeCount,
        dryRunMembershipSetChecksum: dryRunChecksum,
      };

      if (!APPLY) {
        result.decision = 'DRY_PREVIEW_NOT_APPLIED';
        passResults.push(result);
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const m of proposed) {
          await client.query(
            `INSERT INTO atlas_packet_chunk_lineage
               (packet_key, canonical_chunk_id, chunk_row_id, source_ref, source_namespace, source_revision, membership_status, revision_status, chunk_ordinal, lineage_producer_revision, evidence_refs)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (packet_key, canonical_chunk_id) DO UPDATE SET
               lineage_producer_revision = EXCLUDED.lineage_producer_revision,
               evidence_refs = EXCLUDED.evidence_refs,
               revision_status = EXCLUDED.revision_status,
               source_revision = EXCLUDED.source_revision,
               source_namespace = EXCLUDED.source_namespace,
               chunk_row_id = EXCLUDED.chunk_row_id`,
            [m.packetKey, m.canonicalChunkId, m.chunkRowId, m.sourceRef, m.sourceNamespace, m.sourceRevision, m.membershipStatus, m.revisionStatus, m.chunkOrdinal, m.lineageProducerRevision, m.evidenceRefs],
          );
        }

        const { rows: afterRows } = await client.query(
          `SELECT canonical_chunk_id, chunk_row_id, source_ref, source_namespace, source_revision, membership_status, revision_status
           FROM atlas_packet_chunk_lineage WHERE packet_key = $1 ORDER BY canonical_chunk_id`,
          [fixture.packetKey],
        );

        const readBackIds = afterRows.map((r: any) => r.canonical_chunk_id);
        const readBackChecksum = computeMembershipSetChecksum(fixture.packetKey, readBackIds);
        const proposedIdSet = new Set(proposed.map((m: any) => m.canonicalChunkId));
        const readBackIdSet = new Set(readBackIds);
        const foreignMemberships = readBackIds.filter((id: string) => !proposedIdSet.has(id)).length;
        const missingMemberships = proposed.filter((m: any) => !readBackIdSet.has(m.canonicalChunkId)).length;
        const duplicateMemberships = readBackIds.length - readBackIdSet.size;
        const syntheticIds = afterRows.filter((r: any) => !proposed.some((m: any) => m.canonicalChunkId === r.canonical_chunk_id && m.chunkRowId === r.chunk_row_id)).length;

        result.afterMembershipCount = afterRows.length;
        result.afterCountEqualsProposedNotDoubled = afterRows.length === proposed.length;
        result.readBackMembershipSetChecksum = readBackChecksum;
        result.checksumMatchesDryRun = readBackChecksum === dryRunChecksum;
        result.foreignMemberships = foreignMemberships;
        result.missingMemberships = missingMemberships;
        result.duplicateMemberships = duplicateMemberships;
        result.syntheticIds = syntheticIds;

        if (fixture.shape === 'CANARY_OVERLAP') {
          const identityUnchanged = beforeCanonicalPairs.size === readBackIdSet.size
            && [...beforeCanonicalPairs].every((id) => readBackIdSet.has(id));
          const sourceIdentityUnchanged = beforeRows.every((br: any) => {
            const ar = afterRows.find((a: any) => a.canonical_chunk_id === br.canonical_chunk_id);
            return ar && ar.source_namespace === br.source_namespace && ar.source_revision === br.source_revision;
          });
          result.overlapCanonicalIdentityUnchanged = identityUnchanged;
          result.overlapSourceIdentityUnchanged = sourceIdentityUnchanged;
        }

        const allExact = result.beforeCountMatchesExpectation
          && result.afterCountEqualsProposedNotDoubled
          && result.checksumMatchesDryRun
          && foreignMemberships === 0 && missingMemberships === 0 && duplicateMemberships === 0 && syntheticIds === 0
          && (fixture.shape !== 'CANARY_OVERLAP' || (result.overlapCanonicalIdentityUnchanged && result.overlapSourceIdentityUnchanged));

        if (allExact) {
          await client.query('COMMIT');
          result.decision = 'COMMIT';
        } else {
          await client.query('ROLLBACK');
          result.decision = 'ROLLBACK_MISMATCH';
        }
      } catch (err) {
        await client.query('ROLLBACK');
        result.decision = 'ROLLBACK_ERROR';
        result.error = err instanceof Error ? err.message : String(err);
      } finally {
        client.release();
      }

      passResults.push(result);
    }
    return passResults;
  }

  const pass1 = await runOnePass('initial');
  const pass2 = APPLY ? await runOnePass('replay') : null;

  function shapeVerdict(r: any): string {
    if (!APPLY) return 'DRY_PREVIEW';
    return r.decision === 'COMMIT' ? 'PASS' : 'FAIL';
  }

  const perShapeVerdicts = Object.fromEntries(pass1.map((r) => [r.shape, shapeVerdict(r)]));

  let replayVerdict = 'NOT_RUN';
  if (APPLY && pass2) {
    replayVerdict = pass2.every((r2, i) => {
      const r1 = pass1[i];
      return r2.decision === 'COMMIT'
        && r2.afterMembershipCount === r1.afterMembershipCount
        && r2.readBackMembershipSetChecksum === r1.readBackMembershipSetChecksum
        && r2.foreignMemberships === 0 && r2.missingMemberships === 0 && r2.duplicateMemberships === 0 && r2.syntheticIds === 0;
    }) ? 'PASS' : 'FAIL';
  }

  const overallVerdict = !APPLY
    ? 'DRY_PREVIEW'
    : (Object.values(perShapeVerdicts).every((v) => v === 'PASS') && replayVerdict === 'PASS' ? 'PASS' : 'FAIL');

  const report = {
    schema: 'atlas.packet-chunk-lineage-backfill-canary-01.v1',
    task: 'PACKET-CHUNK-LINEAGE-BACKFILL-CANARY-01',
    mode: APPLY ? 'APPLY' : 'DRY_PREVIEW',
    writesPerformed: APPLY,
    sourceOfTruth: DRY_RUN_REPORT_PATH,
    checksumHelper: 'scripts/atlas/lib/packet-chunk-membership-checksum.mjs (shared with BACKFILL-DRY-01, not reimplemented)',
    perShapeVerdicts,
    replayVerdict,
    overallVerdict,
    pass1,
    pass2,
  };

  console.log(JSON.stringify(report, null, 2));
  const fs = await import('node:fs');
  fs.writeFileSync(
    'C:/Users/james/Videos/deeds-web-app/docs/reports/packet-chunk-lineage-backfill-canary-01-results.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  await pool.end();
  process.exit(overallVerdict === 'PASS' || overallVerdict === 'DRY_PREVIEW' ? 0 : 2);
}

main().catch((err) => { console.error('[FAIL]', err); process.exit(1); });
