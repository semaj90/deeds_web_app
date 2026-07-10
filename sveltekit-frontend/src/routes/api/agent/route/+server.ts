import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { makeRouteDecision, buildRouteTrace, validateRoute } from '$lib/server/router/viterbi-router';
import type { RouterObservation, RouterDecision, RouteTrace } from '$lib/server/router/router-types';
import { v4 as uuid } from 'uuid';

// Request schema
const routeRequestSchema = z.object({
  query: z.string().min(1, 'Query required'),
  constraints: z.object({
    readOnly: z.boolean().default(true),
    requiresExactSourceRefs: z.boolean().default(false)
  }).default({}),
  previousState: z.string().default('START'),
  healthyServices: z.array(z.string()).default(['postgres', 'redis', 'qdrant']),
  telemetryContext: z.object({
    traceId: z.string().optional(),
    queryHash: z.string().optional(),
    priorSuccessRate: z.number().min(0).max(1).optional(),
    timeoutRiskScore: z.number().min(0).max(1).optional()
  }).optional()
});

type RouteRequest = z.infer<typeof routeRequestSchema>;

// Response schema
const routeResponseSchema = z.object({
  traceId: z.string(),
  decision: z.object({
    decisionId: z.string(),
    selectedTool: z.object({
      name: z.string(),
      namespace: z.string(),
      description: z.string(),
      readOnly: z.boolean(),
      providesSourceRefs: z.boolean(),
      requiresServices: z.array(z.string()),
      resultClass: z.string(),
      timeout: z.number(),
      maxRetries: z.number()
    }),
    candidates: z.array(z.object({
      tool: z.object({ name: z.string() }),
      eligible: z.boolean(),
      compositeScore: z.number()
    })).length(3),
    selectedState: z.string(),
    reasoning: z.string()
  }),
  trace: z.object({
    traceId: z.string(),
    queryHash: z.string(),
    query: z.string(),
    selectedToolName: z.string(),
    selectedState: z.string(),
    candidateTools: z.array(z.string()),
    schemaValid: z.boolean(),
    approvalRequired: z.boolean()
  }),
  status: z.literal('ok')
});

/**
 * POST /api/agent/route
 *
 * Deterministic tool selection with HMM-shaped telemetry (Phase 1).
 *
 * Flow:
 * 1. Parse + validate request (query, constraints, previousState)
 * 2. Build RouterObservation from available tools
 * 3. Make route decision (eligibility gates → weighted ranking → top 3)
 * 4. Build auditable trace
 * 5. Return decision + trace for execution (via /api/agent/execute)
 *
 * Three-table telemetry:
 * - proposed_tool_calls (this endpoint writes to agent_traces → decision_id)
 * - tool_call_events (execution writes to this)
 * - outcome_ledger (recovery/result classification writes to this)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // 1. Parse request
    const body = await request.json() as RouteRequest;
    const validated = routeRequestSchema.parse(body);

    // 2. Build observation
    // TODO: Wire to real tool registry (MCP tools from /api/mcp/tools)
    // For now, use mock tools with predictable behavior
    const mockTools = new Map([
      [
        'kb.trace_search',
        {
          name: 'kb.trace_search',
          namespace: 'kb',
          description: 'Search knowledge base by query',
          readOnly: true,
          providesSourceRefs: true,
          requiresServices: ['postgres', 'qdrant'],
          resultClass: 'candidates' as const,
          timeout: 5000,
          maxRetries: 2
        }
      ],
      [
        'topology.search_near',
        {
          name: 'topology.search_near',
          namespace: 'topology',
          description: 'Find related topology nodes',
          readOnly: true,
          providesSourceRefs: true,
          requiresServices: ['neo4j'],
          resultClass: 'candidates' as const,
          timeout: 3000,
          maxRetries: 2
        }
      ],
      [
        'graph.expand_neighborhood',
        {
          name: 'graph.expand_neighborhood',
          namespace: 'graph',
          description: 'Expand k-hop neighborhood',
          readOnly: true,
          providesSourceRefs: false,
          requiresServices: ['neo4j'],
          resultClass: 'partial' as const,
          timeout: 8000,
          maxRetries: 1
        }
      ]
    ]);

    const healthyServices = new Set(validated.healthyServices);

    const observation: RouterObservation = {
      query: validated.query,
      constraints: validated.constraints,
      previousState: validated.previousState as any,
      healthyServices,
      availableTools: mockTools,
      telemetryContext: validated.telemetryContext
    };

    // 3. Make route decision
    const decision = makeRouteDecision(uuid(), observation);

    // 4. Build trace
    const traceId = validated.telemetryContext?.traceId || uuid();
    const queryHash = validated.telemetryContext?.queryHash || '';
    const trace = buildRouteTrace(
      traceId,
      validated.query,
      queryHash,
      decision,
      uuid(), // proposalId
      true    // schemaValid (placeholder)
    );

    // 5. Validate trace
    const validation = validateRoute(trace);
    if (!validation.valid) {
      return json(
        {
          error: 'Trace validation failed',
          errors: validation.errors
        },
        { status: 400 }
      );
    }

    // 6. Return decision + trace
    const response = routeResponseSchema.parse({
      traceId,
      decision,
      trace,
      status: 'ok'
    });

    return json(response);
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
 * GET /api/agent/route?q=...&constraints=...
 *
 * Query-string variant for testing (no approval workflow).
 */
export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q') || '';
  const readOnly = url.searchParams.get('readOnly') !== 'false';

  if (!query) {
    return json({ error: 'Missing query parameter' }, { status: 400 });
  }

  // Delegate to POST logic
  return POST({
    request: new Request(new URL(url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        constraints: { readOnly, requiresExactSourceRefs: false },
        previousState: 'START'
      })
    }),
    locals,
    params: {}
  } as any);
};
