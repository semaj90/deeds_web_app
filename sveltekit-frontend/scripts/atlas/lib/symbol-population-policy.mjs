// Pure, testable admission policy + population-action classifier for
// SYMBOL-REGISTRY-POPULATION-PREVIEW-01. No writes, no I/O -- reused by the preview script and
// unit-tested directly.

// Per-StructuralSymbolKindV1 admission policy. UNKNOWN is REJECT_PROMOTION by design (never
// promoted to "improve coverage numbers"). VARIABLE is CONDITIONAL because its scope (module vs
// class-field vs local vs parameter vs destructuring) is not yet disambiguated in this repo's
// existing contracts -- reused, not invented, once that policy exists; until then it fails closed.
export const KIND_POLICY = Object.freeze({
  FILE: 'CONDITIONAL',
  FUNCTION: 'CANONICAL_SYMBOL_ELIGIBLE',
  METHOD: 'CANONICAL_SYMBOL_ELIGIBLE',
  CLASS: 'CANONICAL_SYMBOL_ELIGIBLE',
  INTERFACE: 'CANONICAL_SYMBOL_ELIGIBLE',
  TYPE: 'CANONICAL_SYMBOL_ELIGIBLE',
  ENUM: 'CANONICAL_SYMBOL_ELIGIBLE',
  VARIABLE: 'CONDITIONAL',
  UNKNOWN: 'REJECT_PROMOTION',
});

/**
 * Classifies one observation's population action. Never mutates anything -- pure function.
 *
 * @param {{symbolKind:string}} observation
 * @param {{status:string, symbolVersionId?:string, stableSymbolId?:string}} resolution - output of classifyObservation()
 * @param {boolean} upstreamFileIdentityResolved - whether StableFileIdentityV1 population has been applied (false = BLOCKED_UPSTREAM_FILE_IDENTITY, per S01-08K, frozen READY but not applied as of this gate)
 */
export function classifyPopulationAction(observation, resolution, upstreamFileIdentityResolved) {
  const policy = KIND_POLICY[observation.symbolKind] ?? 'REJECT_PROMOTION';

  if (policy === 'REJECT_PROMOTION') {
    return { action: 'REJECT_UNKNOWN_KIND', proposedRegistryInsert: false, proposedVersionInsert: false };
  }
  if (policy === 'CONDITIONAL') {
    // VARIABLE/FILE policy not yet proven in this repo's existing contracts -- fail closed,
    // never bulk-admitted merely to grow coverage numbers.
    return { action: 'REJECT_KIND_POLICY', proposedRegistryInsert: false, proposedVersionInsert: false };
  }

  // From here, policy === CANONICAL_SYMBOL_ELIGIBLE.
  if (resolution.status === 'EXACT') {
    // Golden positive control requirement: an already-EXACT observation must propose ZERO writes
    // -- never a duplicate-creation proposal.
    return {
      action: 'EXACT_CURRENT_VERSION_EXISTS',
      proposedRegistryInsert: false,
      proposedVersionInsert: false,
      stableSymbolId: resolution.stableSymbolId,
      symbolVersionId: resolution.symbolVersionId,
    };
  }
  if (resolution.status === 'AMBIGUOUS') {
    return { action: 'AMBIGUOUS_LOGICAL_SYMBOL', proposedRegistryInsert: false, proposedVersionInsert: false };
  }
  if (resolution.status === 'REVISION_MISMATCH') {
    // A registry row exists for this file, just under a different (possibly legacy) revision.
    // Continuity to that row is NOT inferred from path/name alone -- fails closed as unproven,
    // per the review: "Never reuse a stable_symbol_id solely because path/name stayed the same."
    return { action: 'LEGACY_LOGICAL_SYMBOL_CONTINUITY_UNPROVEN', proposedRegistryInsert: false, proposedVersionInsert: false };
  }
  if (resolution.status === 'SPAN_MISMATCH') {
    return { action: 'REJECT_SPAN', proposedRegistryInsert: false, proposedVersionInsert: false };
  }
  if (resolution.status === 'NAME_OR_SIGNATURE_MISMATCH') {
    return { action: 'REJECT_OTHER', proposedRegistryInsert: false, proposedVersionInsert: false };
  }

  // resolution.status === 'REGISTRY_MISSING': genuinely no existing row for this file at all --
  // the only case where "new" is actually unambiguous (no candidate to be ambiguous against).
  if (!upstreamFileIdentityResolved) {
    return { action: 'REJECT_FILE_IDENTITY', proposedRegistryInsert: false, proposedVersionInsert: false, blocker: 'BLOCKED_UPSTREAM_FILE_IDENTITY' };
  }
  return { action: 'NEW_LOGICAL_SYMBOL_AND_VERSION', proposedRegistryInsert: true, proposedVersionInsert: true };
}
