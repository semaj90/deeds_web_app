import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { rankTools, selectTopTools, isEligible } from '$lib/server/router/deterministic-tool-ranker';
import type { RouterObservation, ToolDescriptor } from '$lib/server/router/router-types';
import { v4 as uuid } from 'uuid';

// Request schema
const routeRequestSchema = z.object({
  query: z.string(),
  previousState: z.string().default('RETRIEVE'),
  constraints: z.object({
    readOnly: z.boolean().default(false),
    requiresExactSourceRefs: z.boolean().default(false)
  }).optional(),
  telemetryContext: z.object({
    priorSuccessRate: z.number().optional(),
    averageLatencyMs: z.number().optional()
  }).optional(),
  topK: z.number().default(3).min(1).max(10)
});

type RouteRequest = z.infer<typeof routeRequestSchema>;

// Mock tool registry for Phase 1
// In Phase 2B, this will be indexed from Qdrant + Neo4j
const MOCK_TOOL_REGISTRY: ToolDescriptor[] = [
  {
    name: 'kb.trace_search',
    namespace: 'kb',
    description: 'Search knowledge base using semantic similarity + BM25',
    readOnly: true,
    providesSourceRefs: true,
    requiresServices: ['postgres', 'qdrant'],
    resultClass: 'candidates',
    timeout: 5000,
    maxRetries: 2
  },
  {
    name: 'graph.expand_neighborhood',
    namespace: 'graph',
    description: 'Expand neighborhood in Neo4j topology graph',
    readOnly: true,
    providesSourceRefs: true,
    requiresServices: ['neo4j'],
    resultClass: 'candidates',
    timeout: 3000,
    maxRetries: 1
  },
  {
    name: 'topology.search_near',
    namespace: 'topology',
    description: 'Search SOM topology for similar clusters',
    readOnly: true,
    providesSourceRefs: false,
    requiresServices: ['postgres', 'redis'],
    resultClass: 'candidates',
    timeout: 2000,
    maxRetries: 1
  },
  {
    name: 'codebase.rg_search',
    namespace: 'codebase',
    description: 'Search codebase using ripgrep for lexical matches',
    readOnly: true,
    providesSourceRefs: true,
    requiresServices: ['filesystem'],
    resultClass: 'candidates',
    timeout: 4000,
    maxRetries: 2
  },
  {
    name: 'context.build_kv_packet',
    namespace: 'context',
    description: 'Build key-value context packet for synthesis',
    readOnly: true,
    providesSourceRefs: false,
    requiresServices: ['postgres', 'redis'],
    resultClass: 'answer',
    timeout: 3000,
    maxRetries: 1
  }
];

/**
 * POST /api/agent/route
 *
 * Route a query to the best tool(s) using deterministic ranking.
 *
 * Flow:
 * 1. Parse request (query, state, constraints)
 * 2. Run eligibility gates (hard filters)
 * 3. Score all eligible tools (9 weighted signals)
 * 4. Select top-K candidates
 * 5. Return ranked tools + decision metadata
 *
 * Response includes:
 * - candidates: ranked ToolCandidate[] with all score breakdowns
 * - decisionId: unique trace ID for audit trail
 * - selectedTool: recommendation (candidates[0])
 * - confidenceScore: composite score [0,1]
 * - reasoning: human-readable explanation
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // 1. Parse request
    const body = await request.json() as RouteRequest;
    const validated = routeRequestSchema.parse(body);

    // Build RouterObservation for the ranker
    const observation: RouterObservation = {
      query: validated.query,
      previousState: validated.previousState,
      constraints: {
        readOnly: validated.constraints?.readOnly ?? false,
        requiresExactSourceRefs: validated.constraints?.requiresExactSourceRefs ?? false
      },
      healthyServices: new Set(['postgres', 'qdrant', 'redis', 'neo4j', 'filesystem']),
      telemetryContext: validated.telemetryContext,
      availableTools: MOCK_TOOL_REGISTRY
    };

    // 2-4. Rank tools using deterministic ranker
    const rankedCandidates = rankTools(MOCK_TOOL_REGISTRY, observation);
    const topK = selectTopTools(rankedCandidates, validated.topK);

    if (topK.length === 0) {
      return json({
        status: 'error',
        candidates: [],
        decisionId: uuid(),
        error: 'No eligible tools found for this query and constraints'
      }, { status: 400 });
    }

    // 5. Return ranked results
    const selectedTool = topK[0];
    const decisionId = uuid();

    return json({
      status: 'ok',
      decisionId,
      candidates: topK.map(c => ({
        name: c.tool.name,
        namespace: c.tool.namespace,
        description: c.tool.description,
        eligible: c.eligible,
        ineligibilityReason: c.ineligibilityReason,
        scores: {
          semantic: c.semanticScore,
          intent: c.intentScore,
          schemaFitness: c.schemaFitness,
          transition: c.transitionScore,
          health: c.healthScore,
          historicalSuccess: c.historicalSuccessScore,
          provenance: c.provenanceScore,
          latency: c.latencyScore,
          topology: c.topologyScore
        },
        compositeScore: c.compositeScore
      })),
      selectedTool: {
        name: selectedTool.tool.name,
        namespace: selectedTool.tool.namespace,
        description: selectedTool.tool.description,
        compositeScore: selectedTool.compositeScore
      },
      confidenceScore: selectedTool.compositeScore,
      reasoning: buildExplanation(selectedTool, validated.query),
      timing: {
        routedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const statusCode = message.includes('validation') ? 400 : 500;
    return json(
      { error: message, status: 'error' },
      { status: statusCode }
    );
  }
};

/**
 * Build human-readable explanation for tool selection
 */
function buildExplanation(candidate: any, query: string): string {
  const scores = candidate.scores || {};
  const topScores = Object.entries(scores)
    .filter(([, v]: [string, any]) => v > 0.7)
    .sort(([, a]: [string, any], [, b]: [string, any]) => b - a)
    .slice(0, 3)
    .map(([k]: [string, any]) => k);

  const reason = `Selected ${candidate.tool.name} with confidence ${(candidate.compositeScore * 100).toFixed(0)}%`;
  const contrib = topScores.length > 0 ? ` based on strong ${topScores.join(', ')} scores` : '';

  return reason + contrib;
}
