import type { TaxonomyScopeV1, TaxonomySourceV1 } from './taxonomy-scope-v1.js';
import { createHash } from 'node:crypto';

export const QUERY_EXPANSION_V1_SCHEMA = 'parent-atlas.query-expansion-bundle.v1' as const;

export interface QueryExpansionTermV1 {
  term: string;
  normalized: string;
  source: TaxonomySourceV1;
  evidenceRef: string;
  sourceRevision: string;
  confidence: number;
}

export interface QueryExpansionBundleV1 {
  schema: typeof QUERY_EXPANSION_V1_SCHEMA;
  workspaceRevision: string;
  taxonomyRevision: string;
  ontologyRevision?: string;
  literalTerms: readonly string[];
  expansions: readonly QueryExpansionTermV1[];
  checksumPreimage: string;
  checksum: string;
}

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Deterministic, sorted-key JSON stringify for checksum preimages. Plain
 * `JSON.stringify` preserves insertion order rather than guaranteeing a
 * canonical key order - fine in practice on a single V8 engine, but not a
 * safe cross-engine/cross-language determinism guarantee for a checksum
 * preimage. Matches the existing `stable()` convention already used
 * elsewhere in this repo (src/lib/server/atlas/classification/reduction-router-v1.ts).
 */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function buildQueryExpansionBundleV1(input: {
  scope: TaxonomyScopeV1;
  literalTerms: readonly string[];
  candidates: readonly QueryExpansionTermV1[];
}): QueryExpansionBundleV1 {
  const allowed = new Set(input.scope.allowedSources);
  // Keep the protected user lane lossless at the term boundary. The original
  // query remains the authoritative literal string; this list is only its
  // deterministic token projection. Derived expansions may be normalized, but
  // they must never rewrite or replace a user's literal term.
  const literalByNormalized = new Map<string, string>();
  for (const term of input.literalTerms) {
    const literal = term.trim();
    const normalized = normalizeTerm(literal);
    if (normalized && !literalByNormalized.has(normalized)) {
      literalByNormalized.set(normalized, literal);
    }
  }
  const literalTerms = [...literalByNormalized.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, literal]) => literal);

  const expansions = input.candidates
    .filter((x) => allowed.has(x.source))
    .map((x) => ({ ...x, normalized: normalizeTerm(x.term) }))
    .filter((x) => x.normalized.length > 0)
    .filter((x) => Number.isFinite(x.confidence) && x.confidence >= 0 && x.confidence <= 1)
    .sort((a, b) =>
      b.confidence - a.confidence ||
      a.normalized.localeCompare(b.normalized) ||
      a.evidenceRef.localeCompare(b.evidenceRef)
    )
    .filter((x, index, all) =>
      index === all.findIndex((y) => y.normalized === x.normalized && y.source === x.source)
    )
    .slice(0, input.scope.maxExpansionTerms);

  const checksumPreimage = stable({
    workspaceRevision: input.scope.workspaceRevision,
    taxonomyRevision: input.scope.taxonomyRevision,
    ontologyRevision: input.scope.ontologyRevision ?? null,
    literalTerms,
    expansions: expansions.map((x) => ({
      normalized: x.normalized,
      source: x.source,
      evidenceRef: x.evidenceRef,
      sourceRevision: x.sourceRevision,
      confidence: x.confidence
    }))
  });

  return {
    schema: QUERY_EXPANSION_V1_SCHEMA,
    workspaceRevision: input.scope.workspaceRevision,
    taxonomyRevision: input.scope.taxonomyRevision,
    ontologyRevision: input.scope.ontologyRevision,
    literalTerms,
    expansions,
    checksumPreimage,
    checksum: createHash('sha256').update(checksumPreimage, 'utf8').digest('hex'),
  };
}
