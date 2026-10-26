import {
  resolveValidDagHits,
  rankDenseDagHits,
  type KarpathyDagHit,
} from '$lib/server/indexer/karpathy-dag-subhelpers.js';

export type RetrievalMode =
  | 'LEXICAL_FAST'
  | 'SEMANTIC_DENSE_768'
  | 'KARPATHY_DAG_FUSED'
  | 'HYPERGRAPH_NARY';

export interface ClassifierGateInput {
  query: string;
  candidateDagHits: readonly KarpathyDagHit[];
  liveSourceRevisions: ReadonlyMap<string, string> | Readonly<Record<string, string>>; // filePath -> sha256 revision
  hyperedgeMatchCount: number;
  topK?: number;
}

export interface ClassifierGateResult {
  mode: RetrievalMode;
  admittedDagHits: KarpathyDagHit[];
  rejectionReason: string | null;
  canonicalAuthority: false;
}

function toRevisionRecord(
  revisions: ReadonlyMap<string, string> | Readonly<Record<string, string>>
): Readonly<Record<string, string>> {
  if (revisions instanceof Map) {
    return Object.fromEntries(revisions.entries());
  }
  if (typeof (revisions as ReadonlyMap<string, string>).entries === 'function') {
    return Object.fromEntries((revisions as ReadonlyMap<string, string>).entries());
  }
  return revisions as Readonly<Record<string, string>>;
}

/**
 * Prevents the Auto-Mode Classifier from routing queries to an unpopulated graph lane
 * or consuming stale/unrevisioned DAG hits.
 */
export function selectVerifiedRetrievalMode(input: ClassifierGateInput): ClassifierGateResult {
  const revisionRecord = toRevisionRecord(input.liveSourceRevisions);

  // 1. Enforce sha256 revision qualification via karpathy-dag-subhelpers
  const validDagHits = resolveValidDagHits(input.candidateDagHits, revisionRecord);
  if (input.candidateDagHits.length > 0 && validDagHits.length === 0) {
    return {
      mode: 'SEMANTIC_DENSE_768',
      admittedDagHits: [],
      rejectionReason: 'STALE_OR_MISSING_SOURCE_REVISION',
      canonicalAuthority: false,
    };
  }

  // 2. Rank admitted topological hits using FusedScore = 0.5*Sim + 0.3*(|Dependents|/10) + 0.2*(|Dependencies|/10)
  const rankedHits = rankDenseDagHits(validDagHits, input.topK ?? 5);

  // 3. Only admit HYPERGRAPH_NARY when verified sorted hyperedges exist for the revision
  if (input.hyperedgeMatchCount > 0 && rankedHits.length > 0) {
    return {
      mode: 'HYPERGRAPH_NARY',
      admittedDagHits: rankedHits,
      rejectionReason: null,
      canonicalAuthority: false,
    };
  }

  if (rankedHits.length > 0) {
    return {
      mode: 'KARPATHY_DAG_FUSED',
      admittedDagHits: rankedHits,
      rejectionReason: null,
      canonicalAuthority: false,
    };
  }

  return {
    mode: 'SEMANTIC_DENSE_768',
    admittedDagHits: [],
    rejectionReason: 'NO_TOPOLOGICAL_HITS_ADMITTED',
    canonicalAuthority: false,
  };
}
