/**
 * atlas.retrieve_evidence — the first real caller wired to the canonical
 * pre-call schemas (RetrieveEvidenceInputSchema / OutputSchema /
 * LaneStatusSchema). See
 * openspec/changes/parent-atlas-runtime-ownership-precall/proposal.md
 * for the required proof gates this function exists to satisfy:
 *
 *   INVALID_INPUT_REJECTED, DEFAULT_LANES_APPLIED,
 *   WORKSPACE_REVISION_PRESERVED, CENTROID_NOT_CONFIGURED_REPORTED,
 *   TURBOVEC_NOT_CONFIGURED_REPORTED, FALLBACK_LANE_EXECUTED,
 *   OUTPUT_SCHEMA_VALIDATED
 *
 * (MCP_OR_TRPC_CONSUMER_READS_RESULT is satisfied by the tRPC procedure
 * at src/lib/server/trpc/routers/atlas.ts, not by this file.)
 *
 * Deliberately NOT included yet (per operator instruction — "do not add
 * the full NLP classifier yet, begin with deterministic normalization
 * and lane selection"): QueryPlanSchema / intent classification. This
 * function does normalization (trim, already enforced by the input
 * schema) and lane selection (mapping requested lane names to the
 * underlying retrieval backends) only.
 */

import {
  RetrieveEvidenceInputSchema,
  RetrieveEvidenceOutputSchema,
  type RetrieveEvidenceInput,
  type RetrieveEvidenceOutput,
  type LaneStatus,
} from './retrieve-evidence-schema.js';
import { parallelRetrieve } from '$lib/server/retrieval/parallel-orchestrator.js';
import { tryEmbedCanonical } from '$lib/server/embedding/canonical-embed.js';

export class RetrieveEvidenceInputError extends Error {
  constructor(public readonly issues: unknown) {
    super('atlas.retrieve_evidence: invalid input');
    this.name = 'RetrieveEvidenceInputError';
  }
}

// Orchestrator lane name -> schema-facing lane name. 'turbovec' has no
// equivalent in RetrieveEvidenceInputSchema's lane enum (it's always
// attempted regardless of what was requested, since it's a zero-cost
// stub check) so it keeps its own name rather than being folded into
// 'semantic'.
const ORCHESTRATOR_LANE_NAME: Record<string, string> = {
  qdrant: 'semantic',
  turbovec: 'turbovec',
  redis: 'centroid',
  postgres: 'lexical',
  neo4j: 'graph',
};

// Lanes the input schema allows requesting but that have no backing
// implementation at all yet (distinct from centroid/turbovec, which ARE
// wired but report not_configured because they lack live data/backend).
const NOT_YET_IMPLEMENTED_LANES = ['exact', 'ast', 'schema'] as const;

export async function retrieveEvidence(rawInput: unknown): Promise<RetrieveEvidenceOutput> {
  // --- INVALID_INPUT_REJECTED ---
  const parsed = RetrieveEvidenceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new RetrieveEvidenceInputError(parsed.error.issues);
  }
  // --- DEFAULT_LANES_APPLIED (zod .default() already applied above when
  // `lanes` was omitted) + WORKSPACE_REVISION_PRESERVED (passed straight
  // through untouched below, never regenerated or dropped) ---
  const input: RetrieveEvidenceInput = parsed.data;
  const requestedLanes = new Set(input.lanes);

  const lanes: LaneStatus[] = [];

  for (const lane of NOT_YET_IMPLEMENTED_LANES) {
    if (requestedLanes.has(lane)) {
      lanes.push({
        lane,
        status: 'not_configured',
        candidateCount: 0,
        reason: 'lane_not_yet_implemented',
        fallbackUsed: false,
      });
    }
  }

  // Semantic lane needs a query embedding. Failure to embed degrades to
  // not_configured for that lane rather than searching with a garbage
  // vector — the orchestrator handles this via includeQdrant/queryVector.
  let queryVector: Float32Array | null = null;
  if (requestedLanes.has('semantic')) {
    const embedded = await tryEmbedCanonical(input.query).catch(() => null);
    if (embedded?.embedding?.length) {
      queryVector = new Float32Array(embedded.embedding);
    }
  }

  const centroidEnabled = input.centroidRouting?.enabled === true;

  const orchestratorResult = await parallelRetrieve(input.query, queryVector, {
    topK: input.topK,
    includeQdrant: requestedLanes.has('semantic'),
    // Always attempted regardless of request — TurboVec has no gRPC
    // backend wired yet, so this always resolves not_configured. See
    // parallel-orchestrator.ts's searchTurboVec.
    includeTurboVec: true,
    // Centroid routing is NOT enabled just because 'centroid' was
    // requested — it also requires centroidRouting.enabled:true, per
    // the "no settled cross-store centroid ownership contract" finding
    // (openspec/changes/session-159-followup-tasks.md, Phase 11).
    includeRedis: requestedLanes.has('centroid') && centroidEnabled,
    includeFts: requestedLanes.has('lexical'),
    includeNeo4j: requestedLanes.has('graph'),
  });

  // --- FALLBACK_LANE_EXECUTED: true when at least one lane actually
  // produced results while another lane in the same request was
  // not_configured/error. ---
  const anyLaneSucceededWithResults = orchestratorResult.lanes.some(
    (l) => l.status === 'success' && l.results.length > 0
  );

  for (const l of orchestratorResult.lanes) {
    // --- CENTROID_NOT_CONFIGURED_REPORTED / TURBOVEC_NOT_CONFIGURED_REPORTED:
    // both flow through here unchanged from parallel-orchestrator.ts's own
    // not_configured statuses — this loop does not upgrade or hide them. ---
    lanes.push({
      lane: ORCHESTRATOR_LANE_NAME[l.lane] ?? l.lane,
      status: l.status,
      candidateCount: l.results.length,
      reason: l.reason ?? l.error,
      fallbackUsed: l.status !== 'success' && anyLaneSucceededWithResults,
    });
  }

  const evidence = orchestratorResult.results.map((r) => ({
    packetKey: r.id,
    sourceRef:
      typeof r.metadata?.source_ref === 'string'
        ? (r.metadata.source_ref as string)
        : typeof r.metadata?.sourceRef === 'string'
          ? (r.metadata.sourceRef as string)
          : r.id,
    score: r.score,
    summary: typeof r.content === 'string' ? r.content.slice(0, 400) : undefined,
  }));

  // --- WORKSPACE_REVISION_PRESERVED: echoed back unchanged, observable in
  // the response itself rather than only asserted internally. ---
  const output: RetrieveEvidenceOutput = {
    workspaceRevision: input.workspaceRevision,
    evidence,
    lanes,
  };

  // --- OUTPUT_SCHEMA_VALIDATED: throws (not silently returns) if this
  // function ever produces a shape the schema disagrees with. ---
  return RetrieveEvidenceOutputSchema.parse(output);
}
