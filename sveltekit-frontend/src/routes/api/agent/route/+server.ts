import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { rankTools, selectTopTools } from '$lib/server/router/deterministic-tool-ranker';
import type { RouterObservation, ToolDescriptor, RouterConstraint } from '$lib/server/router/router-types';
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
    traceId: z.string().optional(),
    queryHash: z.string().optional(),
    priorSuccessRate: z.number().optional(),
    timeoutRiskScore: z.number().optional()
  }).optional(),
  topK: z.number().default(3).min(1).max(10)
});

type RouteRequest = z.infer<typeof routeRequestSchema>;

// Mock tool registry for Phase 1
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

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json() as RouteRequest;
    const validated = routeRequestSchema.parse(body);

    // Build RouterObservation for the ranker
    const toolMap = new Map<string, ToolDescriptor>(
      MOCK_TOOL_REGISTRY.map(t => [t.name, t])
    );

    const constraints: RouterConstraint = {
      readOnly: validated.constraints?.readOnly ?? false,
      requiresExactSourceRefs: validated.constraints?.requiresExactSourceRefs ?? false
    };

    const observation: RouterObservation = {
      query: validated.query,
      previousState: validated.previousState as any,
      constraints,
      healthyServices: new Set(['postgres', 'qdrant', 'redis', 'neo4j', 'filesystem']),
      availableTools: toolMap,
      telemetryContext: validated.telemetryContext ? {
        traceId: validated.telemetryContext.traceId || uuid(),
        queryHash: validated.telemetryContext.queryHash || '',
        priorSuccessRate: validated.telemetryContext.priorSuccessRate,
        timeoutRiskScore: validated.telemetryContext.timeoutRiskScore
      } : {
        traceId: uuid(),
        queryHash: ''
      }
    };

    // Rank tools using deterministic ranker
    const rankedCandidates = rankTools(MOCK_TOOL_REGISTRY, observation);
    const topK = selectTopTools(rankedCandidates, validated.topK);

    if (topK.length === 0) {
      return json({
        status: 'error',
        candidates: [],
        decisionId: uuid(),
        error: 'No eligible tools found'
      }, { status: 400 });
    }

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
      reasoning: buildExplanation(selectedTool),
      timing: {
        routedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      { error: message, status: 'error' },
      { status: message.includes('validation') ? 400 : 500 }
    );
  }
};

function buildExplanation(candidate: any): string {
  return `Selected ${candidate.tool.name} with ${(candidate.compositeScore * 100).toFixed(0)}% confidence`;
}
