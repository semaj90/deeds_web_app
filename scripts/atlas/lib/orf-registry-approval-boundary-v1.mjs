/**
 * ORF registry root admission boundary — review-only scaffold.
 *
 * Proposals are NOT runtime registries. The current local candidate may have
 * evidence_requirements / missing_value_policy fields that are absent from
 * this branch; do not downgrade either contract to pass an older build.
 *
 * TODO(ORF-APPROVAL): reconcile the current five-kind proposal against the
 * existing observationFeatureRegistrySchema with exact reviewed revision.
 * TODO(ORF-APPROVAL): require independently issued approval receipt from
 * existing OpenSpec/registry owner; no self-approval or environment toggle.
 * TODO(ORF-APPROVAL): verify proposal raw-byte hash, registry checksum,
 * five class meanings, enum vs type-alias decision, reviewer identity,
 * immutable approval ID and evidence/missing-value policy before runtime.
 * TODO(ORF-ROW): wire approved loader to existing compiler and ORF reader,
 * test missing-valued feature preservation and exact revisions.
 * TODO: do not run migrations or persist feature rows in this helper.
 */
import { createHash } from 'node:crypto';

const sha256 = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const good = x => typeof x === 'string' && x.trim().length > 0;
const digest = x => sha256(JSON.stringify(x));

export function inspectOrfRegistryApprovalBoundary(input = {}) {
  const proposal = input?.proposal;
  const approval = input?.approval;
  const reasons = [];
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal))
    reasons.push('PROPOSAL_ABSENT');
  else {
    if (!good(proposal.registry_revision)) reasons.push('PROPOSAL_REVISION_MISSING');
    if (!/^[a-f0-9]{64}$/.test(proposal.registry_checksum ?? '')) reasons.push('PROPOSAL_CHECKSUM_INVALID');
    if (!Array.isArray(proposal.definitions) || proposal.definitions.length !== 5)
      reasons.push('FIVE_DEFINITION_REVIEW_MISSING');
    for (const d of proposal.definitions ?? []) {
      if (!good(d?.feature_id)) reasons.push('FEATURE_ID_MISSING');
      if (!Array.isArray(d?.evidence_requirements) || !d.evidence_requirements.length)
        reasons.push('EVIDENCE_REQUIREMENTS_MISSING_OR_DIFFERENT_SHAPE');
      if (!good(d?.missing_value_policy)) reasons.push('MISSING_VALUE_POLICY_MISSING_OR_DIFFERENT_SHAPE');
    }
  }
  if (!approval || typeof approval !== 'object') reasons.push('APPROVAL_RECEIPT_ABSENT');
  else {
    if (!good(approval.reviewer_id)) reasons.push('REVIEWER_ID_MISSING');
    if (!good(approval.approval_id)) reasons.push('APPROVAL_ID_MISSING');
    if (!good(approval.approved_registry_revision)) reasons.push('APPROVED_REVISION_MISSING');
    if (approval.approved_registry_revision !== proposal?.registry_revision)
      reasons.push('APPROVAL_REVISION_MISMATCH');
    if (approval.approved_registry_checksum !== proposal?.registry_checksum)
      reasons.push('APPROVAL_CHECKSUM_MISMATCH');
    if (approval.enum_mapping_decision !== 'REVIEWED') reasons.push('ENUM_MAPPING_NOT_REVIEWED');
  }
  // Even structurally complete receipts require external owner-issued readback.
  const report = {
    schema: 'atlas.orf-registry-approval-boundary.v1',
    status: reasons.length ? 'BLOCKED_REVIEW_REQUIRED' : 'REVIEW_RECEIPT_PRESENT_UNVERIFIED',
    reasons: [...new Set(reasons)].sort(),
    runtimeEligible: false,
    canonicalAuthority: false,
    writesPerformed: false,
    proposalDigest: proposal && typeof proposal === 'object' ? digest(proposal) : null,
    nextGate: 'EXTERNAL_APPROVAL_OWNER_INDEPENDENT_READBACK',
    todo: 'TODO: adapt the shape to current local v2 proposal and validate with existing registry builder, then verify a genuine approval receipt externally before any runtime loader is enabled',
  };
  return { ...report, checksum: digest(report) };
}
