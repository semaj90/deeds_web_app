import type { CandidateProjectionInput } from '$lib/server/retrieval/retrieval-candidate-feature-matrix-v1.js';
import type {
  SearchRuntimeQasCandidate,
  SearchRuntimeQasFeatureContext,
  SearchRuntimeQasFeatureResolver,
} from './query-adaptive-feature-compiler.js';

export interface SearchRuntimeQasFeatureSources {
  /** Existing query-time 25-column projection owner. */
  projection(candidate: SearchRuntimeQasCandidate): CandidateProjectionInput | null | undefined;
  /** Existing graph/task/revision context owner. */
  context(candidate: SearchRuntimeQasCandidate): SearchRuntimeQasFeatureContext | null | undefined;
}

export interface SearchRuntimeQasFeatureJoin {
  projections: CandidateProjectionInput[];
  resolveFeatures: SearchRuntimeQasFeatureResolver;
  missingProjectionPacketKeys: string[];
  missingContextPacketKeys: string[];
}

export interface SearchRuntimeQasAsyncFeatureSources {
  projection(candidate: SearchRuntimeQasCandidate): Promise<CandidateProjectionInput | null | undefined>;
  context(candidate: SearchRuntimeQasCandidate): Promise<SearchRuntimeQasFeatureContext | null | undefined>;
}

export interface SearchRuntimeQasAsyncFeatureJoin extends SearchRuntimeQasFeatureJoin {
  sourceRevisions: Record<string, string>;
}

/**
 * Compose existing feature owners at the SearchRuntime boundary.
 *
 * This adapter is deliberately synchronous and side-effect free. It does not
 * query Postgres, Qdrant, Neo4j, Valkey, or telemetry stores. Missing values
 * remain missing so the downstream presence-mask gate rejects incomplete QAS
 * rows instead of converting unknown evidence into zeroes.
 */
export function joinSearchRuntimeQasFeatureSources(
  candidates: readonly SearchRuntimeQasCandidate[],
  sources: SearchRuntimeQasFeatureSources,
): SearchRuntimeQasFeatureJoin {
  const projections: CandidateProjectionInput[] = [];
  const missingProjectionPacketKeys: string[] = [];
  const missingContextPacketKeys: string[] = [];
  const contexts = new Map<string, SearchRuntimeQasFeatureContext>();

  for (const candidate of candidates) {
    const projection = sources.projection(candidate);
    projections.push(projection ?? { packet_key: candidate.packetKey });
    if (!projection) missingProjectionPacketKeys.push(candidate.packetKey);

    const context = sources.context(candidate);
    if (context) contexts.set(candidate.packetKey, context);
    else missingContextPacketKeys.push(candidate.packetKey);
  }

  return {
    projections,
    resolveFeatures: (candidate) => contexts.get(candidate.packetKey),
    missingProjectionPacketKeys,
    missingContextPacketKeys,
  };
}

/**
 * Async composition for owners backed by revisioned snapshots or read-only
 * database queries. Calls are made once per candidate and retained in packet
 * order; no source is allowed to silently replace an absent value.
 */
export async function joinSearchRuntimeQasAsyncFeatureSources(
  candidates: readonly SearchRuntimeQasCandidate[],
  sources: SearchRuntimeQasAsyncFeatureSources,
  sourceRevisions: Record<string, string>,
): Promise<SearchRuntimeQasAsyncFeatureJoin> {
  const resolved = await Promise.all(candidates.map(async (candidate) => ({
    candidate,
    projection: await sources.projection(candidate),
    context: await sources.context(candidate),
  })));
  const joined = joinSearchRuntimeQasFeatureSources(
    resolved.map((entry) => entry.candidate),
    {
      projection: (candidate) => resolved.find((entry) => entry.candidate.packetKey === candidate.packetKey)?.projection,
      context: (candidate) => resolved.find((entry) => entry.candidate.packetKey === candidate.packetKey)?.context,
    },
  );
  return { ...joined, sourceRevisions: { ...sourceRevisions } };
}
