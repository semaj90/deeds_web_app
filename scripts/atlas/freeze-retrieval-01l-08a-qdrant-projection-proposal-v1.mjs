#!/usr/bin/env node
/**
 * RETRIEVAL-01L bounded semantic projection PROPOSAL for the PKT-LINEAGE-08A
 * cohort only. Read-only / proposal-only -- this script NEVER calls Qdrant,
 * never upserts, never patches. It exists solely to freeze an immutable
 * artifact describing what a future, separately-authorized apply step would
 * write, per this repo's own frozen-proposal-before-apply convention
 * (matches PKT-LINEAGE-09's freeze -> apply -> replay pattern).
 *
 * Consumes ONLY docs/reports/retrieval-01l-08a-cohort-audit-v1.json (the
 * just-produced RETRIEVAL-01L-01/02/03 result) -- never re-derives PG/Qdrant
 * state independently, so this proposal can only ever describe candidates
 * that audit already proved are PostgreSQL-admitted (embedding present,
 * verified 768-dim, exact content-hash match) and Qdrant-absent.
 *
 * Per this repo's Wire Format Layering Rule (CLAUDE.md): a bulk numeric
 * array (the 768-dim vector itself) is NEVER serialized into this JSON
 * proposal. Each proposed point references its vector by source identity
 * (chunkRowId -> codebase_chunk_index.id) only; the actual float array would
 * be read directly from Postgres at apply time, never round-tripped through
 * this artifact.
 *
 * Output classification:
 *   PROJECTION_PROPOSAL_FROZEN  -- non-empty proposal, all inputs exact
 *   NO_GAP_TO_PROPOSE           -- every cohort candidate already has an
 *                                  exact Qdrant point; nothing to propose
 *   BLOCKED_INPUT_NOT_READY     -- source audit wasn't PG-admitted for some
 *                                  candidate; refuses to propose a point for
 *                                  a candidate that isn't itself proven
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const auditPath = path.join(root, 'docs', 'reports', 'retrieval-01l-08a-cohort-audit-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'retrieval-01l-08a-qdrant-projection-proposal-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (audit.scope !== 'PKT_LINEAGE_08A_COHORT_ONLY') {
  console.error(`BLOCKED_WRONG_SCOPE: expected PKT_LINEAGE_08A_COHORT_ONLY, got ${audit.scope}`);
  process.exit(1);
}
if (audit.writesPerformed !== false) {
  console.error('BLOCKED_SOURCE_AUDIT_NOT_READ_ONLY');
  process.exit(1);
}

const candidates = audit.retrievalCohort.candidates;

// Refuse to propose a point for anything the source audit did not itself prove PG-admitted --
// this proposal can only ever be as strong as its one input artifact.
const notPgAdmitted = candidates.filter((c) => !c.postgres.admitted);
if (notPgAdmitted.length > 0) {
  const report = {
    schema: 'atlas.retrieval-01l-08a-qdrant-projection-proposal.v1',
    generatedAt: new Date().toISOString(),
    mode: 'PROPOSAL_ONLY',
    writesPerformed: false,
    status: 'BLOCKED_INPUT_NOT_READY',
    notPgAdmittedCount: notPgAdmitted.length,
    sample: notPgAdmitted.slice(0, 10).map((c) => ({ chunkRowId: c.chunkRowId, postgres: c.postgres })),
  };
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const needsProjection = candidates.filter((c) => !c.qdrant.pointPresent);

const COLLECTION = 'codebase_chunks_768_v2';
const VECTOR_NAME = 'content';

const proposedPoints = needsProjection.map((c) => ({
  // Point ID equals chunk_row_id -- the same physical-projection-identity contract
  // bridge-recon-dry-04-v1.mjs / QDRANT-D-IDENTITY-01 already establishes as canonical for this
  // collection. Never a synthetic ID, never Qdrant-assigned.
  proposedPointId: c.chunkRowId,
  vectorSource: {
    table: 'codebase_chunk_index',
    column: 'content_embedding',
    rowId: c.chunkRowId,
    dimension: 768,
    // The vector itself is deliberately NOT embedded here -- see file header. An apply step reads
    // it fresh from Postgres at write time.
  },
  proposedPayload: {
    packet_key: c.packetKey,
    canonical_chunk_id: c.canonicalChunkId,
    source_ref: c.sourceRef,
    source_revision: c.sourceRevision,
    workspace_revision: c.workspaceRevision,
    representation_id: c.representationId,
  },
  candidateOrdinal: c.candidateOrdinal,
  canonicalCandidateId: c.canonicalCandidateId,
}));

const proposalChecksum = sha256(JSON.stringify(proposedPoints.map((p) => ({ id: p.proposedPointId, payload: p.proposedPayload })), null, 0));
const targetPointSetChecksum = sha256(JSON.stringify(proposedPoints.map((p) => p.proposedPointId).sort()));

const status = proposedPoints.length === 0 ? 'NO_GAP_TO_PROPOSE' : 'PROJECTION_PROPOSAL_FROZEN';

const report = {
  schema: 'atlas.retrieval-01l-08a-qdrant-projection-proposal.v1',
  gate: 'RETRIEVAL-01L',
  scope: 'PKT_LINEAGE_08A_COHORT_ONLY',
  generatedAt: new Date().toISOString(),
  mode: 'PROPOSAL_ONLY',
  writesPerformed: false,
  canonicalAuthority: false,
  authorizationRequired: true,
  sourceAuditPath: 'docs/reports/retrieval-01l-08a-cohort-audit-v1.json',
  sourceAuditChecksum: audit.reportChecksum,
  collection: COLLECTION,
  vectorName: VECTOR_NAME,
  cohortSize: candidates.length,
  proposedPointCount: proposedPoints.length,
  proposalChecksum,
  targetPointSetChecksum,
  status,
  notes: [
    'This is a PROPOSAL ONLY. No Qdrant upsert, no Postgres write, no Neo4j write, no Valkey write.',
    'Vectors are referenced by source (codebase_chunk_index row id), never inlined as raw float arrays, per this repo\'s Wire Format Layering Rule.',
    'Applying this proposal is a separate, explicitly authorized step (matching the PKT-LINEAGE-09 freeze -> authorize -> apply -> replay pattern) -- not performed by this script.',
    'This proposal is scoped to exactly the 434 PKT-LINEAGE-08A cohort chunks. It does not cover the other 675 pre-existing QDRANT_POINT_MISSING rows found by bridge-recon-dry-04, which remain a separate, unscoped population.',
  ],
  proposedPoints,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  cohortSize: report.cohortSize,
  proposedPointCount: report.proposedPointCount,
  proposalChecksum: report.proposalChecksum,
  targetPointSetChecksum: report.targetPointSetChecksum,
  out: outPath,
}, null, 2));
process.exitCode = status === 'PROJECTION_PROPOSAL_FROZEN' || status === 'NO_GAP_TO_PROPOSE' ? 0 : 1;
