import { createHash } from 'node:crypto';

const revisionPattern = /^sha256:[a-f0-9]{64}$/;
const checksum = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
    : item)).digest('hex')}`;

export function buildCallableProjectionRefreshPlanV1({ symbol, projections, qualification, workspaceRevision }) {
  const base = {
    schema: 'atlas.callable-projection-refresh-plan.v1',
    mode: 'DRY_RUN_ONLY',
    symbolVersionId: symbol?.symbol_version_id ?? null,
    workspaceRevision,
    writesPerformed: false,
    eligibleForApply: false,
    canonicalAuthority: false,
    proposedChanges: [],
  };
  const blocked = (reason) => ({ ...base, status: 'BLOCKED', reason });
  if (!symbol || symbol.registry_status !== 'active') return blocked('CANONICAL_SYMBOL_MISSING_OR_INACTIVE');
  if (!revisionPattern.test(workspaceRevision ?? '') || symbol.workspace_revision !== workspaceRevision
    || !revisionPattern.test(symbol.source_revision ?? '')) return blocked('CANONICAL_REVISION_UNQUALIFIED');
  if (projections.length !== 1) return blocked(projections.length ? 'PROJECTION_AMBIGUOUS' : 'PROJECTION_MISSING');
  const projection = projections[0];
  if (projection.symbol_version_id !== symbol.symbol_version_id
    || projection.stable_symbol_id !== symbol.stable_symbol_id) return blocked('PROJECTION_SYMBOL_IDENTITY_MISMATCH');
  const receipt = qualification?.receipt;
  if (qualification?.status !== 'QUALIFIED' || receipt?.qualificationOutcome !== 'QUALIFIED'
    || receipt.symbolVersionId !== symbol.symbol_version_id
    || receipt.packetKey !== symbol.packet_key || !receipt.packetKey
    || receipt.sourceRevision !== symbol.source_revision
    || receipt.workspaceRevision !== workspaceRevision
    || receipt.sourceContentHash !== symbol.source_revision.slice(7)
    || receipt.treeNodeId !== symbol.upstream_node_id || !receipt.treeNodeId
    || !/^[a-f0-9]{64}$/.test(receipt.receiptChecksum ?? '')
    || !/^[a-f0-9]{64}$/.test(receipt.snapshotChecksum ?? '')) return blocked('SOURCE_AST_QUALIFICATION_REQUIRED');
  const astIdentityReviewRequired = projection.tree_node_id !== receipt.treeNodeId;
  const fields = ['source_ref', 'source_revision', 'workspace_revision', 'qualified_name'];
  if (fields.some((field) => typeof symbol[field] !== 'string' || !symbol[field].trim())) return blocked('CANONICAL_CALLABLE_FIELDS_MISSING');
  const canonicalSignatureMissing = typeof symbol.signature_normalized !== 'string' || !symbol.signature_normalized.trim();
  if (!canonicalSignatureMissing) fields.push('signature_normalized');
  const proposedChanges = fields.filter((field) => projection[field] !== symbol[field])
    .map((field) => ({ field, before: projection[field] ?? null, after: symbol[field] }));
  if (astIdentityReviewRequired) proposedChanges.push({ field: 'tree_node_id', before: projection.tree_node_id ?? null, after: receipt.treeNodeId });
  const plan = {
    ...base,
    status: astIdentityReviewRequired ? 'RECONCILIATION_REQUIRES_AST_REVIEW'
      : proposedChanges.length ? 'RECONCILIATION_PROPOSED' : 'NO_CHANGES',
    reason: astIdentityReviewRequired ? 'PROJECTION_AST_IDENTITY_RECONCILIATION_REQUIRED' : null,
    astIdentityReviewRequired,
    canonicalSignatureMissing,
    proposedChanges,
    qualificationReceiptChecksum: receipt.receiptChecksum,
    snapshotChecksum: receipt.snapshotChecksum,
    evidenceRefs: receipt.evidenceRefs,
    expectedProjection: projection,
    expectedProjectionChecksum: checksum(projection),
    canonicalInputChecksum: checksum(symbol),
    applyImplemented: false,
    requirements: [
      'POST_P20_REVISION_WRITE_GATE', 'SEPARATE_BOUNDED_WRITE_AUTHORIZATION',
      'REQUALIFY_SOURCE_AND_AST', 'COMPARE_AND_SWAP_ALL_OBSERVED_PROJECTION_FIELDS',
      'APPROVED_PROJECTION_PRODUCER_AND_OUTCOME_RECEIPT', 'INDEPENDENT_READBACK',
      ...(astIdentityReviewRequired ? ['REVIEW_TYPED_AST_IDENTITY_BRIDGE_AND_STORAGE_CONSTRAINTS'] : []),
      ...(canonicalSignatureMissing ? ['REVIEW_CANONICAL_SIGNATURE_ENRICHMENT_SEPARATELY'] : []),
    ],
  };
  return { ...plan, planChecksum: checksum(plan) };
}
