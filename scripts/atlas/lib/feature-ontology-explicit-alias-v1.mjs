import { createHash } from 'node:crypto';

export const ALIAS_RESOLVER_REVISION = 'feature-ontology-explicit-alias:v1';
export const FRONTEND_ROOT_PREFIX = 'sveltekit-frontend/';
export const LEGACY_FRONTEND_PREFIX = 'src/';

export function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function cleanText(value) {
  const text = String(value ?? '').trim().replace(/\\/g, '/');
  return text || null;
}

export function proposeFrontendRootPrefixAlias(sourceRef) {
  const aliasSourceRef = cleanText(sourceRef);
  if (!aliasSourceRef) {
    return {
      aliasSourceRef: null,
      canonicalSourceRef: null,
      resolutionKind: 'UNRESOLVED',
      promotable: false,
      reason: 'missing source ref',
    };
  }

  if (!aliasSourceRef.startsWith(LEGACY_FRONTEND_PREFIX)) {
    return {
      aliasSourceRef,
      canonicalSourceRef: null,
      resolutionKind: 'NOT_FRONTEND_RELATIVE',
      promotable: false,
      reason: 'legacy ref does not start with src/',
    };
  }

  return {
    aliasSourceRef,
    canonicalSourceRef: `${FRONTEND_ROOT_PREFIX}${aliasSourceRef}`,
    resolutionKind: 'ROOT_PREFIX_ALIAS',
    promotable: false,
    reason: 'explicit frontend root-prefix candidate; review and durable VERIFIED alias still required',
  };
}

export function classifyExplicitAliasCandidate({
  aliasSourceRef,
  canonicalSourceRef,
  observationBindings,
  rawRepoRefObserved = false,
  graphifyCanonicalCount = 0,
  graphifyAliasCount = 0,
}) {
  const alias = cleanText(aliasSourceRef);
  const canonical = cleanText(canonicalSourceRef);
  const observedCanonical = Boolean(canonical && observationBindings?.has(canonical));

  if (!alias || !canonical) {
    return {
      classification: 'SOURCE_SCOPE_UNRESOLVED',
      promotable: false,
      reason: 'alias or canonical ref missing',
    };
  }

  // A real repo-root source at the legacy locator makes prefix rewriting unsafe.
  if (rawRepoRefObserved) {
    return {
      classification: 'DUAL_NAMESPACE_COLLISION',
      promotable: false,
      reason: 'legacy locator is itself an observed repo-root source',
    };
  }

  if (!observedCanonical) {
    return {
      classification: 'CANONICAL_TARGET_NOT_OBSERVED',
      promotable: false,
      reason: 'prefixed canonical candidate is absent from current workspace observation',
    };
  }

  if (graphifyAliasCount > 0 && graphifyCanonicalCount > 0) {
    return {
      classification: 'DUAL_GRAPHIFY_IDENTITY_COLLISION',
      promotable: false,
      reason: 'both alias and canonical refs exist in Graphify; manual reconciliation required',
    };
  }

  return {
    classification: 'EXPLICIT_ALIAS_REVIEW_READY',
    promotable: false,
    reason: 'current observation proves canonical target exists; durable VERIFIED alias is still required',
  };
}

export function aliasSelectionChecksum(rows) {
  return sha256(
    [...rows]
      .map((row) => `${row.aliasSourceRef}|${row.canonicalSourceRef}|${row.classification}`)
      .sort()
      .join('\n'),
  );
}
