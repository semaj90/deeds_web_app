/**
 * FEATURE-LINEAGE-NEG-01: independent admission over the existing V1 field-presence check.
 * V1 (`observation-feature-lineage-admission-v1.mjs`, used by materialize-observation-feature-rows.mjs) only proves fields are
 * present and well-formed; a non-empty `registryRevision` is a CLAIM, and a null `sourceVersionReceiptId` is accepted as history.
 * V2 composes V1 with two INJECTED resolvers owned by the authority owners (never caller-supplied booleans):
 *   resolveRegistryApproval(registryRevision)      -> result of validateApprovedObservationFeatureRegistryArtifactV1 (or null / throws)
 *                                                    (observation-feature-registry-approval-v1.mts: reviewer allowlist, trust anchor, optional Ed25519)
 *   resolveSourceVersionReceipt(receiptId)         -> { sourceRef, sourceRevision } loaded from the source-version owner (or null / throws)
 *   resolveSourceBinding({workspaceRevision, sourceRef}) -> { sourceRevision, bindingChecksum } from the exact source-binding owner
 *     (atlas_workspace_source_bindings / workspace-source-binding-v1.ts). SOURCE_BOUND policy
 *     (ml-graph-retrieval-convergence/feature-lineage-persistence-repair.md): when a row has no receipt id, exact source identity
 *     proven through that existing immutable binding is the alternative evidence.
 * Per-row state: LEGACY_UNQUALIFIED | STRUCTURALLY_VALID_NOT_ADMITTED | ADMITTED_FOR_PROJECTION | BLOCKED_STRUCTURALLY_INVALID.
 * ADMITTED_FOR_PROJECTION requires every check to pass AND both resolvers; it is still not canonical authority and not a write grant.
 * Pure: no DB, no network, no writes. V1 is unchanged.
 */
import { validateObservationFeaturePlanLineageV1 } from './observation-feature-lineage-admission-v1.mjs';

export const OBSERVATION_FEATURE_ADMISSION_STATES_V2 = Object.freeze([
  'LEGACY_UNQUALIFIED', 'STRUCTURALLY_VALID_NOT_ADMITTED', 'ADMITTED_FOR_PROJECTION', 'BLOCKED_STRUCTURALLY_INVALID',
]);

const present = (v) => typeof v === 'string' && v.trim().length > 0;

function safeCall(fn, arg) {
  try {
    return { value: fn(arg), threw: false };
  } catch (error) {
    return { value: null, threw: true, message: String(error?.message ?? error) };
  }
}

export function admitObservationFeaturePlanRowV2(row, workspaceRevision, resolvers = {}, cache = { registry: new Map(), receipt: new Map(), binding: new Map() }) {
  const structural = validateObservationFeaturePlanLineageV1(row, workspaceRevision);
  const base = { schema: 'atlas.observation-feature-admission.v2', structuralReasons: structural.reasons, canonicalAuthority: false, writesPerformed: false };
  if (!structural.admitted) {
    const legacy = !present(row?.sourceRevision) && !present(row?.registryRevision);
    return { ...base, state: legacy ? 'LEGACY_UNQUALIFIED' : 'BLOCKED_STRUCTURALLY_INVALID', blocks: [] };
  }

  const blocks = [];
  const { resolveRegistryApproval, resolveSourceVersionReceipt, resolveSourceBinding } = resolvers;

  if (typeof resolveRegistryApproval !== 'function') {
    blocks.push('REGISTRY_APPROVAL_RESOLVER_NOT_PROVIDED');
  } else {
    if (!cache.registry.has(row.registryRevision)) cache.registry.set(row.registryRevision, safeCall(resolveRegistryApproval, row.registryRevision));
    const approval = cache.registry.get(row.registryRevision);
    if (approval.threw) blocks.push('BLOCKED_REGISTRY_APPROVAL_INVALID');
    else if (!approval.value) blocks.push('BLOCKED_REGISTRY_APPROVAL_MISSING');
    else if (approval.value.registry_revision !== row.registryRevision) blocks.push('BLOCKED_REGISTRY_APPROVAL_REVISION_MISMATCH');
  }

  if (!present(row.sourceVersionReceiptId)) {
    if (typeof resolveSourceBinding !== 'function') {
      blocks.push('BLOCKED_SOURCE_VERSION_RECEIPT_MISSING');
    } else {
      const key = JSON.stringify([workspaceRevision, row.sourceRef]);
      if (!cache.binding.has(key)) cache.binding.set(key, safeCall(resolveSourceBinding, { workspaceRevision, sourceRef: row.sourceRef }));
      const binding = cache.binding.get(key);
      if (binding.threw || !binding.value) blocks.push('BLOCKED_SOURCE_BINDING_UNRESOLVED');
      else if (binding.value.sourceRevision !== row.sourceRevision || !present(binding.value.bindingChecksum)) blocks.push('BLOCKED_SOURCE_BINDING_MISMATCH');
    }
  } else if (typeof resolveSourceVersionReceipt !== 'function') {
    blocks.push('SOURCE_VERSION_RECEIPT_RESOLVER_NOT_PROVIDED');
  } else {
    if (!cache.receipt.has(row.sourceVersionReceiptId)) cache.receipt.set(row.sourceVersionReceiptId, safeCall(resolveSourceVersionReceipt, row.sourceVersionReceiptId));
    const receipt = cache.receipt.get(row.sourceVersionReceiptId);
    if (receipt.threw || !receipt.value) blocks.push('BLOCKED_SOURCE_VERSION_RECEIPT_UNRESOLVED');
    else if (receipt.value.sourceRef !== row.sourceRef || receipt.value.sourceRevision !== row.sourceRevision) {
      blocks.push('BLOCKED_SOURCE_VERSION_RECEIPT_MISMATCH');
    }
  }

  return { ...base, state: blocks.length ? 'STRUCTURALLY_VALID_NOT_ADMITTED' : 'ADMITTED_FOR_PROJECTION', blocks };
}

export function admitObservationFeaturePlanRowsV2(rows, workspaceRevision, resolvers = {}) {
  if (!Array.isArray(rows)) throw new TypeError('PLAN_ROWS_REQUIRED');
  const cache = { registry: new Map(), receipt: new Map(), binding: new Map() };
  const results = rows.map((row, index) => ({ index, packetKey: row?.packetKey ?? null, ...admitObservationFeaturePlanRowV2(row, workspaceRevision, resolvers, cache) }));
  const counts = Object.fromEntries(OBSERVATION_FEATURE_ADMISSION_STATES_V2.map((s) => [s, results.filter((r) => r.state === s).length]));
  return { schema: 'atlas.observation-feature-admission-batch.v2', rowCount: rows.length, counts, results, allAdmitted: rows.length > 0 && counts.ADMITTED_FOR_PROJECTION === rows.length, canonicalAuthority: false, writesPerformed: false };
}
