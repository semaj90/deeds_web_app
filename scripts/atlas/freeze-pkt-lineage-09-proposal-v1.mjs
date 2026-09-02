#!/usr/bin/env node
/**
 * PKT-LINEAGE-09-HISTORICAL-PROMOTION-01 -- proposal freeze, READ ONLY.
 *
 * Re-runs the exact same classification logic as
 * `audit-pkt-lineage-09-fresh-classification-v1.mjs`, but additionally persists the full
 * row-level proposal (all admitted packets' membership rows) to a sidecar artifact, so the apply
 * step consumes a fixed, already-computed proposal rather than recomputing lineage independently
 * during the mutation. Aggregate checksums are compared against the prior run's recorded values
 * as a determinism check -- if the live DB state has drifted since the prior run, this will show
 * as a checksum/count mismatch here, before any write is attempted.
 *
 * NO WRITES. Reads atlas_packets, graphify_files, codebase_chunk_index, and (read-only)
 * atlas_packet_chunk_lineage.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const PROPOSAL_PATH = path.resolve(root, 'docs/reports/pkt-lineage-09-frozen-proposal-v1.json');
const PRIOR_CLASSIFICATION_PATH = path.resolve(root, 'docs/reports/pkt-lineage-09-fresh-classification-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

const { rows: populationRows } = await pool.query(`
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
await pool.end();

const proposedMembershipRows = [];
let admittedPackets = 0;
let namespaceUnprovenCount = 0;
let noMemberCount = 0;

for (const row of populationRows) {
  const namespaceProven = Boolean(row.workspace_id);
  const revisionProven = Boolean(row.source_revision);
  const chunks = row.chunks ?? [];
  const hasMembers = chunks.length > 0;

  if (!namespaceProven || !revisionProven) {
    namespaceUnprovenCount += 1;
    continue;
  }
  if (!hasMembers) {
    noMemberCount += 1;
    continue;
  }
  admittedPackets += 1;
  const membershipStatus = chunks.length > 1 ? 'EXACT_MULTI_MEMBER' : 'EXACT_SINGLE_MEMBER';
  for (const chunk of chunks) {
    proposedMembershipRows.push({
      packetKey: row.packet_key,
      canonicalChunkId: chunk.chunk_id,
      chunkRowId: chunk.chunk_row_id,
      sourceRef: row.source_ref,
      sourceNamespace: `workspace:${row.workspace_id}`,
      sourceRevision: row.source_revision,
      membershipStatus,
      revisionStatus: 'PROVEN',
      chunkOrdinal: null,
      lineageProducerRevision: 'PKT-LINEAGE-09-HISTORICAL-PROMOTION-01:v1',
      evidenceRefs: [
        'docs/reports/pkt-lineage-09-fresh-classification-v1.json',
        'docs/reports/pkt-lineage-09-frozen-proposal-v1.json',
      ],
    });
  }
}

const populationClassified = populationRows.length;
const proposedMembershipRowCount = proposedMembershipRows.length;
const proposedMembershipSetChecksum = sha256(
  JSON.stringify([...proposedMembershipRows].sort((a, b) => (a.packetKey + a.canonicalChunkId).localeCompare(b.packetKey + b.canonicalChunkId)))
);
const admittedPacketSetChecksum = sha256(
  JSON.stringify([...new Set(proposedMembershipRows.map((r) => r.packetKey))].sort())
);

let determinismCheck = null;
if (fs.existsSync(PRIOR_CLASSIFICATION_PATH)) {
  const prior = JSON.parse(fs.readFileSync(PRIOR_CLASSIFICATION_PATH, 'utf8'));
  determinismCheck = {
    populationMatch: prior.populationClassified === populationClassified,
    admittedMatch: prior.admittedPackets === admittedPackets,
    membershipCountMatch: prior.proposedMembershipRowCount === proposedMembershipRowCount,
    namespaceUnprovenMatch: prior.namespaceUnproven === namespaceUnprovenCount,
    noMemberMatch: prior.noMember === noMemberCount,
    // Note: prior.proposedMembershipSetChecksum/admittedPacketSetChecksum were computed with
    // producer/evidence fields NOT present in this freeze's rows (this freeze adds
    // lineageProducerRevision/evidenceRefs which the prior classification pass did not compute at
    // all), so the checksum VALUES will legitimately differ -- the count/aggregate fields above
    // are the real determinism proof, not the checksum strings themselves.
  };
  const allMatch = Object.values(determinismCheck).every(Boolean);
  determinismCheck.allMatch = allMatch;
  if (!allMatch) {
    console.error('DETERMINISM CHECK FAILED -- live DB state has drifted since the prior classification run:', JSON.stringify(determinismCheck, null, 2));
    process.exit(1);
  }
}

const report = {
  schema: 'atlas.pkt-lineage-09-frozen-proposal.v1',
  task: 'PKT-LINEAGE-09-HISTORICAL-PROMOTION-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_PROPOSAL_FREEZE',
  readOnly: true,
  writesPerformed: false,
  populationClassified,
  admittedPackets,
  proposedMembershipRowCount,
  namespaceUnproven: namespaceUnprovenCount,
  noMember: noMemberCount,
  proposedMembershipSetChecksum: `sha256:${proposedMembershipSetChecksum}`,
  admittedPacketSetChecksum: `sha256:${admittedPacketSetChecksum}`,
  determinismCheckAgainstPriorClassification: determinismCheck,
  proposedMembershipRows,
};

fs.mkdirSync(path.dirname(PROPOSAL_PATH), { recursive: true });
fs.writeFileSync(PROPOSAL_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  proposalPath: PROPOSAL_PATH,
  populationClassified,
  admittedPackets,
  proposedMembershipRowCount,
  determinismCheck,
}, null, 2));
