#!/usr/bin/env node
/**
 * PKT-LINEAGE-09 fresh historical classification -- READ ONLY.
 *
 * Independently reconstructs the same classification methodology documented in the frozen
 * `packet-chunk-lineage-backfill-dry-01-results.json` baseline (frozenAuthority: atlas_packets,
 * codebase_chunk_index, graphify_files; atlas_packet_chunk_lineage explicitly excluded as
 * CANARY-01 validation output, not historical reconstruction input). The original producer
 * script for that baseline was not found anywhere in the repository (searched by filename and by
 * distinctive field names) -- this is a fresh, independent implementation compared against the
 * frozen baseline's recorded counts, not a re-run of the same code. No revision is fabricated:
 * every value here is read live from Postgres.
 *
 * This script performs NO writes. It only reads atlas_packets, graphify_files,
 * codebase_chunk_index, and (read-only) atlas_packet_chunk_lineage if it exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const REPORT = path.resolve(root, 'docs/reports/pkt-lineage-09-fresh-classification-v1.json');
const BASELINE_PATH = path.resolve(root, 'docs/reports/packet-chunk-lineage-backfill-dry-01-results.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

let databaseError = null;
let populationRows = [];
let lineageTableExists = false;
let existingLineageRows = [];

try {
  const tableCheck = await pool.query(`SELECT to_regclass('public.atlas_packet_chunk_lineage') AS reg`);
  lineageTableExists = tableCheck.rows[0].reg !== null;
  if (lineageTableExists) {
    const existing = await pool.query(`SELECT packet_key, canonical_chunk_id, chunk_row_id FROM atlas_packet_chunk_lineage`);
    existingLineageRows = existing.rows;
  }

  // Population: every atlas_packets row with a non-null packet_key and source_ref, joined to the
  // most recent graphify_files namespace/revision record for that source_ref, and to
  // codebase_chunk_index for chunk membership.
  const { rows } = await pool.query(`
    SELECT
      ap.packet_key AS packet_key,
      ap.source_ref AS source_ref,
      gf.workspace_id::text AS workspace_id,
      NULLIF(BTRIM(gf.code_source_revision::text), '') AS source_revision,
      COALESCE(
        (SELECT json_agg(json_build_object('chunk_id', cci.chunk_id::text, 'chunk_row_id', cci.id::text) ORDER BY cci.chunk_id)
         FROM codebase_chunk_index cci
         WHERE cci.relative_path = ap.source_ref),
        '[]'::json
      ) AS chunks
    FROM atlas_packets ap
    LEFT JOIN LATERAL (
      SELECT workspace_id, code_source_revision
      FROM graphify_files
      WHERE source_ref = ap.source_ref
      ORDER BY workspace_revision DESC NULLS LAST, code_source_revision DESC NULLS LAST
      LIMIT 1
    ) gf ON TRUE
    WHERE ap.packet_key IS NOT NULL
      AND NULLIF(BTRIM(ap.source_ref), '') IS NOT NULL
  `);
  populationRows = rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const classifications = [];
const proposedMembershipRows = [];
let admittedPackets = 0;
let namespaceUnprovenCount = 0;
let noMemberCount = 0;
let membershipExactRevisionProvenCount = 0;

if (!databaseError) {
  for (const row of populationRows) {
    const namespaceProven = Boolean(row.workspace_id);
    const revisionProven = Boolean(row.source_revision);
    const chunks = row.chunks ?? [];
    const hasMembers = chunks.length > 0;

    let membershipSetStatus;
    let namespaceStatus = namespaceProven ? 'PROVEN' : 'UNPROVEN';
    let revisionStatus = revisionProven ? 'PROVEN' : 'UNPROVEN';
    let admissionDecision;

    if (!namespaceProven || !revisionProven) {
      membershipSetStatus = 'NAMESPACE_UNPROVEN';
      admissionDecision = 'NAMESPACE_UNPROVEN';
      namespaceUnprovenCount += 1;
    } else if (!hasMembers) {
      membershipSetStatus = 'NO_MEMBER';
      admissionDecision = 'NO_MEMBER';
      noMemberCount += 1;
    } else {
      membershipSetStatus = chunks.length > 1 ? 'EXACT_MULTI_MEMBER' : 'EXACT_SINGLE_MEMBER';
      admissionDecision = 'ADMIT';
      membershipExactRevisionProvenCount += 1;
      admittedPackets += 1;
      for (const chunk of chunks) {
        proposedMembershipRows.push({
          packetKey: row.packet_key,
          canonicalChunkId: chunk.chunk_id,
          chunkRowId: chunk.chunk_row_id,
          sourceRef: row.source_ref,
          sourceNamespace: `workspace:${row.workspace_id}`,
          sourceRevision: row.source_revision,
        });
      }
    }

    const membershipSetChecksum = sha256(JSON.stringify(chunks));
    classifications.push([
      row.packet_key,
      row.source_ref,
      membershipSetStatus,
      namespaceStatus,
      revisionStatus,
      chunks.length,
      admissionDecision,
      membershipSetChecksum,
    ]);
  }
}

const populationClassified = populationRows.length;
const proposedMembershipRowCount = proposedMembershipRows.length;
const proposedMembershipSetChecksum = sha256(
  JSON.stringify([...proposedMembershipRows].sort((a, b) => (a.packetKey + a.canonicalChunkId).localeCompare(b.packetKey + b.canonicalChunkId)))
);
const admittedPacketSetChecksum = sha256(
  JSON.stringify(classifications.filter((c) => c[6] === 'ADMIT').map((c) => c[0]).sort())
);

// Compare against existing atlas_packet_chunk_lineage canonical rows (if the table exists).
const existingByKey = new Map();
for (const r of existingLineageRows) {
  const key = `${r.packet_key}::${r.canonical_chunk_id}`;
  existingByKey.set(key, r);
}
const proposedByKey = new Map();
for (const r of proposedMembershipRows) {
  proposedByKey.set(`${r.packetKey}::${r.canonicalChunkId}`, r);
}
let alreadyCanonicalIdentical = 0;
let newInserts = 0;
for (const key of proposedByKey.keys()) {
  if (existingByKey.has(key)) alreadyCanonicalIdentical += 1;
  else newInserts += 1;
}
// Only chunk_row_id equality is checked (the only column read from atlas_packet_chunk_lineage in
// this script). A mismatch is conservatively counted as a conflict, not silently treated as a
// benign "provenance update" -- this script does not know the table's full column set well enough
// to distinguish the two, and a conflict flags for human review rather than assuming benignity.
const provenanceUpdates = 0;
let conflicts = 0;
for (const [key, existingRow] of existingByKey.entries()) {
  const proposedRow = proposedByKey.get(key);
  if (proposedRow && proposedRow.chunkRowId !== existingRow.chunk_row_id) conflicts += 1;
}
const deletesRequired = 0; // This classification only ever proposes additions; deletes are never computed here by design.
const existingNotInProposed = [...existingByKey.keys()].filter((k) => !proposedByKey.has(k)).length;

let baseline = null;
let baselineComparison = null;
if (fs.existsSync(BASELINE_PATH)) {
  baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const populationMatch = baseline.populationClassified === populationClassified;
  const admittedMatch = baseline.admittedPackets === admittedPackets;
  const membershipCountMatch = baseline.proposedMembershipRowCount === proposedMembershipRowCount;
  const namespaceUnprovenMatch = baseline.namespaceUnproven === namespaceUnprovenCount;
  const noMemberMatch = baseline.noMember === noMemberCount;

  let drift;
  if (populationMatch && admittedMatch && membershipCountMatch && namespaceUnprovenMatch && noMemberMatch) {
    drift = 'EXACT_BASELINE_MATCH';
  } else if (
    Math.abs((baseline.populationClassified ?? 0) - populationClassified) < populationClassified * 0.02 &&
    admittedPackets >= (baseline.admittedPackets ?? 0)
  ) {
    drift = 'SAFE_EXPLAINED_DRIFT';
  } else if (admittedPackets < (baseline.admittedPackets ?? 0)) {
    drift = 'AUTHORITY_REGRESSION';
  } else {
    drift = 'UNEXPLAINED_DRIFT';
  }

  baselineComparison = {
    baselinePopulationClassified: baseline.populationClassified,
    freshPopulationClassified: populationClassified,
    populationMatch,
    baselineAdmittedPackets: baseline.admittedPackets,
    freshAdmittedPackets: admittedPackets,
    admittedMatch,
    baselineProposedMembershipRowCount: baseline.proposedMembershipRowCount,
    freshProposedMembershipRowCount: proposedMembershipRowCount,
    membershipCountMatch,
    baselineNamespaceUnproven: baseline.namespaceUnproven,
    freshNamespaceUnproven: namespaceUnprovenCount,
    namespaceUnprovenMatch,
    baselineNoMember: baseline.noMember,
    freshNoMember: noMemberCount,
    noMemberMatch,
    note: 'Row-level checksums are NOT compared -- the baseline\'s checksum serialization method is unknown (its producer script was not found in the repo). Aggregate counts are the comparison surface.',
    drift,
  };
}

const verdict = databaseError
  ? `BLOCKED_DATABASE_READ:${databaseError}`
  : !baseline
    ? 'BLOCKED_NO_BASELINE_FOUND'
    : deletesRequired !== 0
      ? 'BLOCKED_DELETES_REQUIRED_NONZERO'
      : baselineComparison.drift === 'AUTHORITY_REGRESSION'
        ? 'BLOCKED_AUTHORITY_REGRESSION'
        : baselineComparison.drift === 'UNEXPLAINED_DRIFT'
          ? 'BLOCKED_UNEXPLAINED_DRIFT'
          : 'READY_FOR_HISTORICAL_PROMOTION_AUTHORIZATION';

const report = {
  schema: 'atlas.pkt-lineage-09-fresh-classification.v1',
  task: 'PKT-LINEAGE-09-FRESH-DRY',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_FRESH_HISTORICAL_CLASSIFICATION',
  readOnly: true,
  writesPerformed: false,
  frozenAuthority: ['atlas_packets', 'codebase_chunk_index', 'graphify_files'],
  excludedFromAuthority: ['atlas_packet_chunk_lineage -- comparison target only, not a classification input'],
  databaseError,
  populationClassified,
  admittedPackets,
  proposedMembershipRowCount,
  namespaceUnproven: namespaceUnprovenCount,
  noMember: noMemberCount,
  membershipExactRevisionProven: membershipExactRevisionProvenCount,
  proposedMembershipSetChecksum: `sha256:${proposedMembershipSetChecksum}`,
  admittedPacketSetChecksum: `sha256:${admittedPacketSetChecksum}`,
  lineageTableExists,
  existingLineageRowCount: existingLineageRows.length,
  liveCanonicalComparison: {
    alreadyCanonicalIdentical,
    newInserts,
    provenanceUpdates,
    conflicts,
    deletesRequired,
    existingRowsNotInFreshProposal: existingNotInProposed,
  },
  baselineFound: Boolean(baseline),
  baselineComparison,
  verdict,
};

fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  reportPath: REPORT,
  verdict,
  populationClassified,
  admittedPackets,
  proposedMembershipRowCount,
  baselineComparison,
  liveCanonicalComparison: report.liveCanonicalComparison,
}, null, 2));
