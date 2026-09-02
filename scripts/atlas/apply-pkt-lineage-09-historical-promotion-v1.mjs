#!/usr/bin/env node
/**
 * PKT-LINEAGE-09-HISTORICAL-PROMOTION-01 -- the historical write.
 *
 * Consumes the frozen proposal from `pkt-lineage-09-frozen-proposal-v1.json` (produced by
 * `freeze-pkt-lineage-09-proposal-v1.mjs`) verbatim -- this script does NOT independently
 * recompute packet<->chunk lineage. Per-packet atomic transactions: UPSERT (ON CONFLICT DO
 * NOTHING, per the frozen contract -- the 89 pre-existing rows are already confirmed identical,
 * no provenance-update path is exercised), read back the packet's complete membership set,
 * verify exact count + canonicalChunkId set match the frozen proposal, COMMIT only on exact
 * match, ROLLBACK and fail closed on any mismatch.
 *
 * No synthetic IDs. No source_ref fanout (each row's canonicalChunkId comes only from the frozen
 * proposal, never reconstructed as "every chunk sharing this source_ref"). No representative
 * chunk. No deletion (DELETE is never issued anywhere in this script). No Qdrant/Neo4j/Redis
 * writes -- Postgres only.
 *
 * Usage: node apply-pkt-lineage-09-historical-promotion-v1.mjs [--replay]
 * --replay: run the identical apply logic again, to prove idempotency (expects 0 new inserts).
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const isReplay = process.argv.includes('--replay');
const PROPOSAL_PATH = path.resolve(root, 'docs/reports/pkt-lineage-09-frozen-proposal-v1.json');
const REPORT_PATH = path.resolve(
  root,
  isReplay ? 'docs/reports/pkt-lineage-09-historical-promotion-replay-v1.json' : 'docs/reports/pkt-lineage-09-historical-promotion-apply-v1.json'
);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 4, statement_timeout: 60000 });

if (!fs.existsSync(PROPOSAL_PATH)) {
  console.error(`BLOCKED_NO_FROZEN_PROPOSAL: ${PROPOSAL_PATH} does not exist. Run freeze-pkt-lineage-09-proposal-v1.mjs first.`);
  process.exit(1);
}
const proposal = JSON.parse(fs.readFileSync(PROPOSAL_PATH, 'utf8'));

// ---- PREWRITE (read-only) ----
const prewrite = {};
{
  const constraintCheck = await pool.query(`
    SELECT
      EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atlas_pcl_membership_unique') AS has_unique,
      (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='atlas_packet_chunk_lineage' AND column_name='chunk_ordinal') AS chunk_ordinal_nullable
  `);
  prewrite.uniqueConstraintPresent = constraintCheck.rows[0].has_unique;
  prewrite.chunkOrdinalNullable = constraintCheck.rows[0].chunk_ordinal_nullable === 'YES';

  const existing = await pool.query(`SELECT packet_key, canonical_chunk_id, chunk_row_id FROM atlas_packet_chunk_lineage`);
  const existingByKey = new Map(existing.rows.map((r) => [`${r.packet_key}::${r.canonical_chunk_id}`, r]));
  const proposedByKey = new Map(proposal.proposedMembershipRows.map((r) => [`${r.packetKey}::${r.canonicalChunkId}`, r]));

  let existingCanonicalIdenticalToProposal = 0;
  let conflictingRows = 0;
  for (const [key, existingRow] of existingByKey.entries()) {
    const proposedRow = proposedByKey.get(key);
    if (!proposedRow) continue; // existingRowsNotInFreshProposal, counted separately below
    if (proposedRow.chunkRowId === existingRow.chunk_row_id) existingCanonicalIdenticalToProposal += 1;
    else conflictingRows += 1;
  }
  const existingRowsNotInFreshProposal = [...existingByKey.keys()].filter((k) => !proposedByKey.has(k)).length;

  prewrite.existingCanonicalRowCount = existing.rows.length;
  prewrite.existingCanonicalIdenticalToProposal = existingCanonicalIdenticalToProposal;
  prewrite.conflictingRows = conflictingRows;
  prewrite.existingRowsNotInFreshProposal = existingRowsNotInFreshProposal;

  if (!prewrite.uniqueConstraintPresent || !prewrite.chunkOrdinalNullable) {
    console.error('BLOCKED_SCHEMA_CONTRACT_VIOLATION:', JSON.stringify(prewrite, null, 2));
    await pool.end();
    process.exit(1);
  }
  if (conflictingRows > 0) {
    console.error('BLOCKED_CONFLICTING_MEMBERSHIP_DETECTED_AT_PREWRITE:', JSON.stringify(prewrite, null, 2));
    await pool.end();
    process.exit(1);
  }
}

// ---- Group proposal rows by packet for packet-set atomic transactions ----
const byPacket = new Map();
for (const row of proposal.proposedMembershipRows) {
  const list = byPacket.get(row.packetKey) ?? [];
  list.push(row);
  byPacket.set(row.packetKey, list);
}

let packetsProcessed = 0;
let rowsInserted = 0;
let rowsAlreadyIdentical = 0;
let rollbacks = 0;
let conflicts = 0;
let duplicatePairs = 0;
let syntheticIds = 0;
const rollbackDetails = [];

for (const [packetKey, memberships] of byPacket.entries()) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // No synthetic identities: every canonicalChunkId/chunkRowId comes verbatim from the frozen
    // proposal row, never generated or guessed here.
    for (const m of memberships) {
      if (!m.canonicalChunkId || !m.chunkRowId) {
        syntheticIds += 1; // should never trigger; frozen proposal rows are always fully populated
        throw new Error(`Malformed frozen proposal row for packet ${packetKey}`);
      }
      const res = await client.query(
        `INSERT INTO atlas_packet_chunk_lineage
           (id, packet_key, canonical_chunk_id, chunk_row_id, source_ref, source_namespace,
            source_revision, membership_status, revision_status, chunk_ordinal,
            lineage_producer_revision, evidence_refs, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
         ON CONFLICT (packet_key, canonical_chunk_id) DO NOTHING
         RETURNING id`,
        [
          m.packetKey, m.canonicalChunkId, m.chunkRowId, m.sourceRef, m.sourceNamespace,
          m.sourceRevision, m.membershipStatus, m.revisionStatus, m.chunkOrdinal,
          m.lineageProducerRevision, m.evidenceRefs,
        ]
      );
      if (res.rowCount > 0) rowsInserted += 1;
      else rowsAlreadyIdentical += 1;
    }

    // Read back the packet's complete membership set and verify exact match.
    const readback = await client.query(
      `SELECT canonical_chunk_id FROM atlas_packet_chunk_lineage WHERE packet_key = $1 ORDER BY canonical_chunk_id`,
      [packetKey]
    );
    const readbackSet = readback.rows.map((r) => r.canonical_chunk_id);
    const expectedSet = [...new Set(memberships.map((m) => m.canonicalChunkId))].sort();
    const countMatch = readbackSet.length === expectedSet.length;
    const setMatch = countMatch && readbackSet.every((v, i) => v === expectedSet[i]);

    if (readbackSet.length !== new Set(readbackSet).size) {
      duplicatePairs += readbackSet.length - new Set(readbackSet).size;
    }

    if (!setMatch) {
      await client.query('ROLLBACK');
      rollbacks += 1;
      rollbackDetails.push({ packetKey, expectedCount: expectedSet.length, readbackCount: readbackSet.length });
      continue;
    }

    await client.query('COMMIT');
    packetsProcessed += 1;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    rollbacks += 1;
    rollbackDetails.push({ packetKey, error: error instanceof Error ? error.message : String(error) });
  } finally {
    client.release();
  }
}

const after = await pool.query(`SELECT count(*)::int AS c FROM atlas_packet_chunk_lineage`);
await pool.end();

const verdict = rollbacks > 0 || syntheticIds > 0 || conflicts > 0
  ? 'BLOCKED_ROLLBACK_OR_VIOLATION_DETECTED'
  : 'HISTORICAL_LINEAGE_PROMOTION_PROVEN';

const report = {
  schema: 'atlas.pkt-lineage-09-historical-promotion.v1',
  task: isReplay ? 'PKT-LINEAGE-09-HISTORICAL-PROMOTION-01-REPLAY' : 'PKT-LINEAGE-09-HISTORICAL-PROMOTION-01-APPLY',
  generatedAt: new Date().toISOString(),
  writesToNonLineageStores: { qdrant: false, neo4j: false, valkey: false },
  prewrite,
  packetsProcessed,
  rowsBefore: prewrite.existingCanonicalRowCount,
  rowsInserted,
  rowsAlreadyIdentical,
  rowsAfter: after.rows[0].c,
  rollbacks,
  conflicts,
  duplicatePairs,
  syntheticIds,
  rollbackDetails,
  verdict,
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath: REPORT_PATH, ...report, rollbackDetails: rollbackDetails.slice(0, 5) }, null, 2));
if (verdict !== 'HISTORICAL_LINEAGE_PROMOTION_PROVEN') process.exit(1);
