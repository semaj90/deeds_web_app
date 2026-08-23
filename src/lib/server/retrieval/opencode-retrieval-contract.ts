/**
 * @module opencode-retrieval-contract
 * Authoritative source-ref resolution + no-placeholder policy gate.
 */

export type RetrievalLaneName =
  | 'atlas_packets'
  | 'qdrant'
  | 'postgres_jsonb'
  | 'neo4j_graph'
  | 'redis_semantic_cache'
  | 'filesystem_rg';

export interface SourceRefResult {
  found: boolean;
  sourceRef: string | null;
  packetKey: string | null;
  qdrantPointId: string | null;
  laneName: RetrievalLaneName;
  evidenceSummary: string | null;
  fusionScore: number;
}

export interface ResolvedSourceRef {
  found: boolean;
  sourceRef: string | null;
  canonicalSourceRef: string | null;
  confidence: number;
  conflict: boolean;
  winningLane: RetrievalLaneName | null;
  evidence: SourceRefResult[];
  reason: string;
}

export interface PlaceholderDecision {
  allow_create: boolean;
  reason: string;
  resolved: ResolvedSourceRef;
}

const LANES: RetrievalLaneName[] = [
  'atlas_packets',
  'redis_semantic_cache',
  'qdrant',
  'postgres_jsonb',
  'neo4j_graph',
  'filesystem_rg',
];

export async function resolveSourceRef(query: string): Promise<ResolvedSourceRef> {
  const evidence: SourceRefResult[] = [];

  for (const lane of LANES) {
    const result = await runRetrievalLane(lane, query);
    evidence.push(result);
  }

  const hits = evidence
    .filter((e) => e.found && e.sourceRef)
    .sort((a, b) => b.fusionScore - a.fusionScore);

  if (hits.length === 0) {
    return {
      found: false,
      sourceRef: null,
      canonicalSourceRef: null,
      confidence: 0,
      conflict: false,
      winningLane: null,
      evidence,
      reason: 'No authoritative source evidence found in any retrieval lane.',
    };
  }

  const uniqueRefs = new Set(hits.map((h) => h.sourceRef));
  const conflict = uniqueRefs.size > 1;
  const winner = hits[0];

  return {
    found: true,
    sourceRef: winner.sourceRef,
    canonicalSourceRef: normalizeSourceRef(winner.sourceRef),
    confidence: winner.fusionScore,
    conflict,
    winningLane: winner.laneName,
    evidence,
    reason: conflict
      ? 'Multiple conflicting source references found.'
      : `Authoritative source found via ${winner.laneName}.`,
  };
}

export async function enforceNoPlaceholderPolicy(query: string): Promise<PlaceholderDecision> {
  const resolved = await resolveSourceRef(query);

  if (resolved.found) {
    return {
      allow_create: false,
      reason: resolved.conflict
        ? 'Blocked: conflicting existing source references found. Human review required.'
        : `Blocked: existing authoritative source found: ${resolved.canonicalSourceRef}`,
      resolved,
    };
  }

  return {
    allow_create: true,
    reason: 'Allowed: no existing authoritative source evidence found.',
    resolved,
  };
}

async function runRetrievalLane(
  laneName: RetrievalLaneName,
  query: string
): Promise<SourceRefResult> {
  // Replace each switch branch with your real Atlas/Qdrant/Redis/Neo4j/filesystem adapter.
  switch (laneName) {
    case 'atlas_packets':
    case 'redis_semantic_cache':
    case 'qdrant':
    case 'postgres_jsonb':
    case 'neo4j_graph':
    case 'filesystem_rg':
      return {
        found: false,
        sourceRef: null,
        packetKey: null,
        qdrantPointId: null,
        laneName,
        evidenceSummary: null,
        fusionScore: 0,
      };
  }
}

function normalizeSourceRef(sourceRef: string | null): string | null {
  if (!sourceRef) return null;

  return sourceRef
    .replaceAll('\\', '/')
    .replace(/^file:\/+/, 'file:')
    .trim();
}
