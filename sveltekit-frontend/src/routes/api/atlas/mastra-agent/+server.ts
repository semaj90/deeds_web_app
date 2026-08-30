/**
 * Mastra + Atlas Agent Endpoint
 *
 * Entry point: POST /api/atlas/mastra-agent
 *
 * Runs a Mastra agent powered by Atlas FSM, Gemma4 reasoning, and MCP tools.
 * - Model: Gemma4 LLM with tool calling
 * - State machine: Atlas FSM gates tool eligibility
 * - Tools: 7 semantic Atlas tools (discover, retrieve, validate, build_context, etc.)
 * - Data plane: Go Retrieval gRPC, Postgres canonical, Redis cache
 *
 * Request body:
 * {
 *   "prompt": "Find evidence for X",
 *   "workspaceId": "deeds-2026q3",
 *   "context": { ... }
 * }
 *
 * Response: LLM-generated answer with evidence citations
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
  createAtlasRuntimeContext,
  AtlasState,
} from '$lib/server/atlas/atlas-runtime-context.js';
import { buildSemanticSignalPacket } from '$lib/server/atlas/semantic-signal-routing.js';
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';
import {
  atlasRetrieveTool,
  atlasValidateChangeTool,
  atlasApplyChangeTool,
  atlasBuildContextTool,
  atlasDiscoverTool,
  atlasInspectRuntimeTool,
  createAtlasRequestContext,
  atlasToolCallProcessor,
} from '$lib/server/atlas/atlas-mastra-adapter.js';

const RequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  workspaceId: z.string().default('default'),
  contextLimit: z.number().int().min(512).max(16384).default(4096),
  maxSteps: z.number().int().min(1).max(20).default(10),
  // Required to acknowledge this route is a simulated demo, not a real Mastra
  // agent (see NOT_IMPLEMENTED comment block below) — without this flag the
  // route refuses to respond with fabricated data. Audit finding 2026-08-02:
  // this route imported real Atlas tool functions but never called any of
  // them, silently returning canned evidence as if it were a real answer.
  acknowledgeMock: z.boolean().default(false),
});

type MastraAgentRequest = z.infer<typeof RequestSchema>;

export const POST: RequestHandler = async ({ request, locals }) => {
  const startTime = Date.now();

  try {
    // Parse and validate request
    const body = await request.json();
    const input = RequestSchema.parse(body);

    // Verify authorization
    if (!locals.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // This route does not implement a real Mastra agent — see the commented-out
    // MastraAgent instantiation below. It never calls any of the atlasDiscoverTool
    // / atlasRetrieveTool / etc. functions it imports; it fabricates a canned
    // response instead. That's fine for local demo/testing, but a real client
    // could previously get a confident `{success:true}` response built entirely
    // from hardcoded data. Require an explicit acknowledgement so nothing can
    // hit this path unintentionally believing it's getting real evidence.
    if (!input.acknowledgeMock) {
      return json(
        {
          success: false,
          error: 'not_implemented',
          message:
            'This route does not run a real Mastra agent yet — the actual atlasDiscoverTool/' +
            'atlasRetrieveTool/etc. calls are not wired (see src/routes/api/atlas/mastra-agent/' +
            '+server.ts). It only returns simulated demo data, and only when the request body ' +
            'includes "acknowledgeMock": true. For real Atlas semantic retrieval, use the MCP ' +
            'atlas.* tools directly (handleAtlasSemanticToolCall) instead.',
        },
        { status: 501 }
      );
    }

    // Create Atlas runtime context
    const runtime = createAtlasRuntimeContext({
      runId: crypto.randomUUID(),
      threadId: crypto.randomUUID(),
      resourceId: input.workspaceId,
      workspaceId: input.workspaceId,
      packetKey: `atlas:packet:agent:${Date.now()}`,
      initialState: AtlasState.DISCOVER,
      tokenBudget: input.contextLimit,
    });
    const semanticSignal = buildSemanticSignalPacket({
      query: input.prompt,
      subjectId: runtime.packetKey,
      workspaceId: runtime.workspaceId,
      workspaceRevision: runtime.workspaceRevision,
      producer: 'mastra-agent-route',
      producerRevision: 'phase109a.runtime.v1',
      packetKey: runtime.packetKey,
      packetRevision: runtime.packetRevision,
      activeGoal: 'agent response with bounded evidence',
      currentPlanStep: 'discover',
      problem: 'Need a compact agent plan without flooding context',
      proposedAction: 'Use bounded retrieval plan before synthesis',
      validationCriteria: ['bounded lanes', 'compact signal packet', 'evidence preserved'],
      rollbackPlan: ['fall back to runtime-retrieve route', 'keep agent stubbed'],
      status: 'RUNTIME_PROOF_PENDING',
      loopState: 'UNDERSTAND',
      loopTool: 'atlas.inspect_runtime',
      loopResult: 'PASS',
      loopEvidenceCoverage: 0.2,
      loopTokenPressure: 0.1,
    });

    // Create request context for Mastra integration
    const requestContext = await createAtlasRequestContext({
      runId: runtime.runId,
      threadId: runtime.threadId,
      resourceId: runtime.resourceId,
      workspaceId: runtime.workspaceId,
      packetKey: runtime.packetKey,
    });

    // Stub: In production, instantiate actual Mastra agent here
    // const agent = new MastraAgent({
    //   model: 'gemma4-legal-iq4xs-direct.gguf',
    //   tools: [
    //     atlasDiscoverTool,
    //     atlasRetrieveTool,
    //     atlasValidateChangeTool,
    //     atlasBuildContextTool,
    //     atlasInspectRuntimeTool,
    //   ],
    //   processors: {
    //     onToolCall: async (call, ctx) => atlasToolCallProcessor(call, runtime),
    //   },
    //   stopWhen: async (msg, ctx) => runtime.state === AtlasState.COMPLETE,
    // });

    // For now, simulate agent loop with FSM
    const agentResponse = {
      thought: `User is asking: "${input.prompt}"`,
      toolCalls: [] as Array<{ toolId: string; input: Record<string, unknown> }>,
      answer: 'Agent response would go here',
      evidence: [] as any[],
      steps: [] as Array<{ state: string; tool: string; result: string }>,
      semanticSignal: semanticSignal.compactSummary,
    };

    // Step 1: DISCOVER
    console.log(`[Mastra Agent] DISCOVER: Analyzing query "${input.prompt}"`);
    runtime.state = AtlasState.DISCOVER;
    agentResponse.steps.push({
      state: 'DISCOVER',
      tool: 'atlas.discover',
      result: 'Query analyzed, ready for retrieval',
    });

    // Step 2: RETRIEVE
    console.log(`[Mastra Agent] RETRIEVE: Calling atlas.retrieve`);
    runtime.state = AtlasState.RETRIEVE;

    // Simulate tool call
    const toolCall = {
      toolId: 'atlas.retrieve',
      input: {
        query: input.prompt,
        topK: 12,
        lanes: ['dense', 'sparse', 'graph'],
      },
    };

    agentResponse.toolCalls.push(toolCall);

    // Simulate retrieval result
    agentResponse.evidence = [
      {
        packetKey: 'atlas:packet:evidence:001',
        sourceRef: 'src/lib/server/atlas',
        denseScore: 0.92,
        summary: 'Atlas runtime context management',
      },
    ];

    agentResponse.steps.push({
      state: 'RETRIEVE',
      tool: 'atlas.retrieve',
      result: `Retrieved ${agentResponse.evidence.length} evidence packets`,
    });

    // Step 3: VERIFY
    console.log(`[Mastra Agent] VERIFY: Validating evidence`);
    runtime.state = AtlasState.VERIFY;
    agentResponse.steps.push({
      state: 'VERIFY',
      tool: 'atlas.validate_change',
      result: 'Evidence validated against Postgres canonical',
    });

    // Step 4: SYNTHESIZE
    console.log(`[Mastra Agent] SYNTHESIZE: Building context`);
    runtime.state = AtlasState.SYNTHESIZE;
    agentResponse.steps.push({
      state: 'SYNTHESIZE',
      tool: 'atlas.build_context',
      result: 'Context assembled for LLM generation',
    });

    // Step 5: COMPLETE
    runtime.state = AtlasState.COMPLETE;
    agentResponse.answer =
      `Based on the retrieved evidence, I can provide information about your query. ` +
      `Found ${agentResponse.evidence.length} relevant packets across the workspace.`;

    const durationMs = Date.now() - startTime;

    console.log(
      `[Mastra Agent] Workflow complete: ${agentResponse.steps.length} steps, ${durationMs}ms`
    );

    return json({
      success: true,
      mock: true,
      warning:
        'This response is entirely simulated demo data. No atlas.* tool was actually ' +
        'invoked, no Postgres/Qdrant/gRPC call was made, and "evidence" below is hardcoded. ' +
        'Do not treat this as a real retrieval result.',
      agent: {
        model: LLM_MODEL_ID,
        state: runtime.state,
        confidence: runtime.confidence,
      },
      response: {
        answer: agentResponse.answer,
        evidence: agentResponse.evidence,
        toolCalls: agentResponse.toolCalls,
        steps: agentResponse.steps,
      },
      metadata: {
        workspaceId: runtime.workspaceId,
        runId: runtime.runId,
        durationMs,
        stepCount: agentResponse.steps.length,
        evidenceCount: agentResponse.evidence.length,
        semanticSignal: semanticSignal.compactSummary,
        proofManifest: semanticSignal.proofManifest,
      },
    });
  } catch (error) {
    console.error('[Mastra Agent] Fatal error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    return json(
      {
        success: false,
        error: errorMessage,
        metadata: {
          durationMs: Date.now() - startTime,
        },
      },
      { status: 500 }
    );
  }
};
