/**
 * Single code owner for admitting a frozen summary proposal to the canonical
 * chunk-summary slot. Persistence is injected and must provide one transaction;
 * this module never opens a database or performs I/O by itself.
 */
import { createHash } from 'node:crypto';
import { evaluateSummaryAdmissionV1 } from './summary-quality-v1.mjs';
import { SUMMARY_PROPOSAL_SCHEMA_V1, stableJsonV1 } from './summary-proposal-candidate-v1.mjs';

const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const same = (a, b) => typeof a === 'string' && a.length > 0 && a === b;

export function verifySummaryProposalChecksumV1(proposal) {
  if (!proposal || typeof proposal !== 'object' || typeof proposal.proposalChecksum !== 'string') return false;
  const { proposalChecksum, ...body } = proposal;
  return same(proposalChecksum, digest(stableJsonV1(body)));
}

function evaluateAgainstCurrentEvidence(proposal, current) {
  if (current.revisionStatus !== 'PROVEN' || current.bindingStatus !== 'PROVEN') {
    return { status: 'BLOCKED_LINEAGE_MISSING', reasons: ['AUTHORITATIVE_BINDING_OR_CHUNK_LINEAGE_NOT_PROVEN'] };
  }
  const identityPairs = [
    ['sourceIdentityKey', current.sourceIdentityKey],
    ['chunkRowId', current.chunkRowId],
    ['chunkId', current.chunkId],
    ['chunkCanonicalId', current.canonicalChunkId],
    ['sourceRef', current.sourceRef],
    ['sourceRevision', current.sourceRevision],
    ['workspaceRevision', current.workspaceRevision],
  ];
  const identityMismatches = identityPairs.filter(([key, value]) => !same(proposal[key], value)).map(([key]) => key);
  if (identityMismatches.length) return { status: 'BLOCKED_IDENTITY_CHANGED', reasons: identityMismatches.map((key) => `CHANGED_${key}`) };
  if (!current.bindingChecksum || !Array.isArray(proposal.evidenceRefs)
    || !proposal.evidenceRefs.includes(`binding_checksum:${current.bindingChecksum}`)) {
    return { status: 'BLOCKED_LINEAGE_MISSING', reasons: ['EXACT_BINDING_CHECKSUM_EVIDENCE_MISSING'] };
  }
  if (!same(proposal.inputTextSha256, current.inputTextSha256)) {
    return { status: 'BLOCKED_STALE_DIGEST', reasons: ['INPUT_TEXT_DIGEST_MISMATCH'] };
  }
  if (proposal.inputByteLength !== current.inputByteLength) {
    return { status: 'BLOCKED_STALE_DIGEST', reasons: ['INPUT_BYTE_LENGTH_MISMATCH'] };
  }
  if (!same(proposal.summarySha256, createHash('sha256').update(proposal.summary ?? '', 'utf8').digest('hex'))) {
    return { status: 'BLOCKED_STALE_DIGEST', reasons: ['SUMMARY_DIGEST_MISMATCH'] };
  }
  if (!verifySummaryProposalChecksumV1(proposal)) {
    return { status: 'BLOCKED_STALE_DIGEST', reasons: ['PROPOSAL_CHECKSUM_MISMATCH'] };
  }

  const lineage = {
    canonical_chunk_id: proposal.chunkCanonicalId,
    source_ref: proposal.sourceRef,
    source_revision: proposal.sourceRevision,
    workspace_revision: proposal.workspaceRevision,
    input_digest: proposal.inputTextSha256,
    proposal_checksum: proposal.proposalChecksum,
    model_id: proposal.modelId,
    model_revision: proposal.modelRevision ?? null,
    prompt_template_revision: proposal.promptTemplateRevision,
  };
  const admission = evaluateSummaryAdmissionV1({
    summary: proposal.summary,
    lineage,
    current: {
      source_revision: current.sourceRevision,
      workspace_revision: current.workspaceRevision,
      input_digest: current.inputTextSha256,
    },
  });
  if (admission.status !== 'ADMITTED') return { status: admission.status, reasons: admission.reasons, admission };
  return { status: 'ADMITTED', reasons: [], admission };
}

/**
 * `repository.transaction` is the only persistence seam. Its transaction must
 * expose getAdmissionEvidence, readCurrentTarget, and setSummaryIfEmpty; the
 * latter must be a conditional UPDATE on both nullable canonical columns.
 */
export async function admitCanonicalChunkSummaryV1({ proposal, repository, admittedAt = new Date().toISOString() }) {
  if (!repository || typeof repository.transaction !== 'function') throw new Error('TRANSACTIONAL_REPOSITORY_REQUIRED');
  if (proposal?.schema !== SUMMARY_PROPOSAL_SCHEMA_V1) return { status: 'BLOCKED_SCHEMA', reasons: ['UNSUPPORTED_PROPOSAL_SCHEMA'] };
  if (!verifySummaryProposalChecksumV1(proposal)) return { status: 'BLOCKED_STALE_DIGEST', reasons: ['PROPOSAL_CHECKSUM_MISMATCH'] };

  return repository.transaction(async (tx) => {
    // Use a single ordered connection sequence; PostgreSQL clients do not
    // support overlapping queries on one transaction connection reliably.
    const current = await tx.getAdmissionEvidence(proposal);
    const target = await tx.readCurrentTarget(proposal.chunkRowId);
    if (!current || !target) return { status: 'BLOCKED_LINEAGE_MISSING', reasons: ['CURRENT_TARGET_OR_EVIDENCE_MISSING'] };
    if (target.summaryText != null || target.summaryProvenance != null) {
      return { status: 'ALREADY_PRESENT', reasons: ['CANONICAL_SUMMARY_SLOT_NOT_EMPTY'] };
    }
    const decision = evaluateAgainstCurrentEvidence(proposal, current);
    if (decision.status !== 'ADMITTED') return decision;

    const provenance = {
      schema: 'atlas.summary-provenance.v1',
      canonicalChunkId: proposal.chunkCanonicalId,
      packetKey: current.packetKey ?? null,
      sourceIdentityKey: proposal.sourceIdentityKey,
      sourceRef: proposal.sourceRef,
      sourceRevision: proposal.sourceRevision,
      workspaceRevision: proposal.workspaceRevision,
      producerId: proposal.modelId,
      producerRevision: proposal.runtimeBuildRevision ?? null,
      modelId: proposal.modelId,
      modelRevision: proposal.modelRevision ?? null,
      promptTemplateRevision: proposal.promptTemplateRevision,
      summaryInputDigest: proposal.inputTextSha256,
      summaryDigest: decision.admission.summaryDigest,
      proposalChecksum: proposal.proposalChecksum,
      admission: {
        schema: decision.admission.schema,
        status: decision.admission.status,
        reasons: decision.admission.reasons,
        scaffoldLeak: decision.admission.scaffoldLeak,
        reasoningLeak: decision.admission.reasoningLeak,
        controlTokenLeak: decision.admission.controlTokenLeak,
      },
      admittedAt,
    };
    const write = await tx.setSummaryIfEmpty({
      chunkRowId: proposal.chunkRowId,
      summaryText: proposal.summary,
      summaryProvenance: provenance,
    });
    if (write?.rowCount !== 1) return { status: 'WRITE_RACE_OR_STALE_TARGET', reasons: ['CONDITIONAL_UPDATE_DID_NOT_MATCH_ONE_ROW'] };
    return { status: 'ADMITTED', reasons: [], provenance };
  });
}

export { evaluateAgainstCurrentEvidence as evaluateCanonicalSummaryProposalV1 };
