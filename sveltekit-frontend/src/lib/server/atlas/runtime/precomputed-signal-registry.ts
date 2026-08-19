export type PrecomputedSignalKind =
  | 'postgres_ts_rank'
  | 'postgres_trigram'
  | 'bm25'
  | 'bm42'
  | 'legacy_hash_sparse'
  | 'semantic_768'
  | 'pagerank_global'
  | 'pagerank_personalized'
  | 'hyperedge_activation'
  | 'ast_structural_match'
  | 'domain_match'
  | 'ontology_match'
  | 'learned_rerank_score';

export interface SignalRevisionKey {
  workspaceRevision?: string | null;
  sourceRevision?: string | null;
  representationRevision?: string | number | null;
  featureRevision?: string | null;
  graphRevision?: string | null;
  ontologyRevision?: string | null;
  modelRevision?: string | null;
}

export interface PrecomputedSignal {
  signal: PrecomputedSignalKind;
  value: number;
  packetKey: string;
  sourceRef: string;
  revisions: SignalRevisionKey;
  executor: string;
  receiptRef?: string | null;
  calculatedAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SignalRequirement {
  signal: PrecomputedSignalKind;
  packetKey: string;
  sourceRef?: string | null;
  revisions: SignalRevisionKey;
}

export type ReuseDecision =
  | { status: 'REUSE'; signal: PrecomputedSignal }
  | { status: 'MISSING'; reason: string }
  | { status: 'STALE'; reason: string; signal: PrecomputedSignal };

function sameRequiredRevision(expected: SignalRevisionKey, actual: SignalRevisionKey): string | null {
  for (const key of Object.keys(expected) as Array<keyof SignalRevisionKey>) {
    const wanted = expected[key];
    if (wanted === undefined || wanted === null) continue;
    if (String(actual[key] ?? '') !== String(wanted)) return String(key);
  }
  return null;
}

/**
 * Select a precomputed signal only when identity and every request-qualified
 * revision agree. This helper never computes the signal itself.
 */
export function resolvePrecomputedSignal(
  requirement: SignalRequirement,
  available: readonly PrecomputedSignal[],
): ReuseDecision {
  const matchingIdentity = available.filter((row) =>
    row.signal === requirement.signal &&
    row.packetKey === requirement.packetKey &&
    (!requirement.sourceRef || row.sourceRef === requirement.sourceRef)
  );

  if (!matchingIdentity.length) {
    return { status: 'MISSING', reason: `no ${requirement.signal} signal for ${requirement.packetKey}` };
  }

  for (const signal of matchingIdentity) {
    const mismatch = sameRequiredRevision(requirement.revisions, signal.revisions);
    if (!mismatch) return { status: 'REUSE', signal };
  }

  return {
    status: 'STALE',
    reason: `${requirement.signal} exists but required revisions do not match`,
    signal: matchingIdentity[0]!,
  };
}

/**
 * Produces nullable feature values while preserving why a value is absent.
 * UNKNOWN is not converted to zero.
 */
export function collectReusableSignals(
  requirements: readonly SignalRequirement[],
  available: readonly PrecomputedSignal[],
): {
  values: Partial<Record<PrecomputedSignalKind, number>>;
  reused: PrecomputedSignal[];
  missing: Array<{ signal: PrecomputedSignalKind; reason: string }>;
  stale: Array<{ signal: PrecomputedSignalKind; reason: string }>;
} {
  const values: Partial<Record<PrecomputedSignalKind, number>> = {};
  const reused: PrecomputedSignal[] = [];
  const missing: Array<{ signal: PrecomputedSignalKind; reason: string }> = [];
  const stale: Array<{ signal: PrecomputedSignalKind; reason: string }> = [];

  for (const requirement of requirements) {
    const decision = resolvePrecomputedSignal(requirement, available);
    if (decision.status === 'REUSE') {
      values[requirement.signal] = decision.signal.value;
      reused.push(decision.signal);
    } else if (decision.status === 'MISSING') {
      missing.push({ signal: requirement.signal, reason: decision.reason });
    } else {
      stale.push({ signal: requirement.signal, reason: decision.reason });
    }
  }

  return { values, reused, missing, stale };
}

export const ALGORITHM_SEMANTICS = Object.freeze({
  postgres_ts_rank: 'PostgreSQL tsvector/tsquery frequency-based ranking; not BM25.',
  postgres_trigram: 'Atlas substring/trigram-style lexical fallback.',
  bm25: 'True BM25 only when an implementation/receipt explicitly proves BM25 semantics.',
  bm42: 'True BM42 only when transformer token-attention weighting plus IDF semantics are proven.',
  legacy_hash_sparse: 'Atlas FNV/log-TF compatibility sparse vector; never label as true BM42.',
  semantic_768: 'Canonical semantic representation; executor does not create an additional vote.',
});
