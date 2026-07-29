/**
 * Atlas Runtime Retrieval Endpoint
 *
 * Entry point: POST /api/atlas/runtime-retrieve
 *
 * Executes the unified Atlas retrieval workflow with FSM state management.
 * - Request context: workspace, packet identity, token budget
 * - Workflow: DISCOVER → RETRIEVE → VERIFY → SYNTHESIZE → COMPLETE
 * - Gating: FSM prevents invalid state transitions and tool misuse
 * - Data plane: Go Retrieval service via gRPC (with HTTP fallback)
 *
 * Request body:
 * {
 *   "query": "search query text",
 *   "workspaceId": "deeds-2026q3",
 *   "packetKey": "atlas:packet:...",
 *   "tokenBudget": 8192,
 *   "lanes": ["dense", "sparse", "graph"],
 *   "topK": 12
 * }
 *
 * Response:
 * {
 *   "packets": [ { packetKey, sourceRef, denseScore, ... } ],
 *   "summary": "context assembled by Go service",
 *   "finalState": "COMPLETE",
 *   "confidence": 0.85,
 *   "metadata": { ... }
 * }
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
  AtlasState,
  createAtlasRuntimeContext,
} from '$lib/server/atlas/atlas-runtime-context.js';
import { estimateExecutionState } from '$lib/server/atlas/atlas-fsm-policy.js';
import {
  retrieveFromGo,
  buildContextFromGo,
  validatePacketFromGo,
} from '$lib/server/atlas/go-retrieval-grpc-client.js';
import { buildSemanticSignalPacket } from '$lib/server/atlas/semantic-signal-routing.js';

const RequestSchema = z.object({
  query: z.string().min(1).max(1000),
  workspaceId: z.string().default('default'),
  packetKey: z.string().optional(),
  tokenBudget: z.number().int().min(512).max(32768).default(8192),
  lanes: z.array(z.enum(['dense', 'sparse', 'graph', 'symbol', 'temporal', 'centroid']))
    .default(['dense', 'sparse', 'graph']),
  topK: z.number().int().min(1).max(50).default(12),
  maxIterations: z.number().int().min(1).max(20).default(10),
});

type AtlasRetrievalRequest = z.infer<typeof RequestSchema>;

export const POST: RequestHandler = async ({ request, locals }) => {
  const startTime = Date.now();

  try {
    // Parse and validate request
    const body = await request.json();
    const input = RequestSchema.parse(body);

    // Create Atlas runtime context
    const runtime = createAtlasRuntimeContext({
      runId: crypto.randomUUID(),
      threadId: crypto.randomUUID(),
      resourceId: input.workspaceId,
      workspaceId: input.workspaceId,
      packetKey: input.packetKey || `atlas:packet:query:${Date.now()}`,
      initialState: AtlasState.DISCOVER,
      tokenBudget: input.tokenBudget,
    });
    const semanticSignal = buildSemanticSignalPacket({
      query: input.query,
      subjectId: runtime.packetKey,
      workspaceId: runtime.workspaceId,
      workspaceRevision: runtime.workspaceRevision,
      producer: 'runtime-retrieve-route',
      producerRevision: 'phase109a.runtime.v1',
      packetKey: runtime.packetKey,
      packetRevision: runtime.packetRevision,
      activeGoal: 'retrieve and validate bounded evidence',
      currentPlanStep: 'discover',
      problem: 'Need bounded retrieval without flooding context',
      proposedAction: 'Plan lanes before retrieval and keep proof compact',
      validationCriteria: ['lanes bounded', 'packet compact', 'validation retained'],
      rollbackPlan: ['use input lanes', 'keep Go retrieval unchanged'],
      status: 'RUNTIME_PROOF_PENDING',
      loopState: 'UNDERSTAND',
      loopTool: 'runtime-retrieve',
      loopResult: 'PASS',
      loopEvidenceCoverage: 0.25,
      loopTokenPressure: 0.1,
    });

    // Execution results
    const results = {
      packets: [] as any[],
      summary: '',
      finalState: runtime.state,
      confidence: runtime.confidence,
      metadata: {
        workspaceId: runtime.workspaceId,
        packetKey: runtime.packetKey,
        query: input.query,
        topK: input.topK,
        lanes: input.lanes,
        semanticSignal: semanticSignal.compactSummary,
        proofManifest: semanticSignal.proofManifest,
        iterations: 0,
        durationMs: 0,
      },
    };

    let iterationNumber = 0;
    const maxIterations = input.maxIterations;

    // FSM execution loop
    while (
      runtime.state !== AtlasState.COMPLETE &&
      iterationNumber < maxIterations
    ) {
      iterationNumber++;

      // Create observation from current state
      const observation = {
        lastTool: runtime.state,
        lastToolSucceeded: true,
        retrievalConfidence: 0.7,
        evidenceCount: results.packets.length,
        validationStatus: 'PASS' as const,
        authFailure: false,
        revisionMismatch: false,
        tokenPressure: (runtime.tokenBudget.maximumInput - runtime.tokenBudget.remainingInput) /
          runtime.tokenBudget.maximumInput,
        iterationNumber,
      };

      // Estimate next state using FSM
      const inference = estimateExecutionState(runtime.state, observation);
      const previousState = runtime.state;
      runtime.state = inference.state;
      runtime.confidence = inference.confidence;

      console.log(
        `[Atlas FSM] Iteration ${iterationNumber}: ${previousState} → ${runtime.state} (confidence: ${(runtime.confidence * 100).toFixed(1)}%)`
      );

      // Execute step based on state
      try {
        switch (runtime.state) {
          case AtlasState.DISCOVER:
            // In DISCOVER state, remain until ready to retrieve
            // In this simplified implementation, skip straight to RETRIEVE
            runtime.state = AtlasState.RETRIEVE;
            break;

          case AtlasState.RETRIEVE:
            // Call Go Retrieval gRPC service
            console.log(`[Atlas RETRIEVE] Querying Go service: "${input.query}"`);
            const retrieveResult = await retrieveFromGo(runtime, input.query, {
              topK: Math.min(input.topK, semanticSignal.retrievalPlan.final_evidence_limit),
              lanes: semanticSignal.retrievalPlan.lanes as any,
            });

            results.packets = retrieveResult.evidence;
            console.log(`[Atlas RETRIEVE] Retrieved ${results.packets.length} packets`);

            // Move to verification only if we have packets
            if (results.packets.length > 0) {
              runtime.state = AtlasState.VERIFY;
            } else {
              // No results, try recovery
              runtime.state = AtlasState.RECOVER;
            }
            break;

          case AtlasState.VERIFY:
            // Validate retrieved packets against Postgres canonical
            console.log(`[Atlas VERIFY] Validating ${results.packets.length} packets`);

            try {
              // Check first packet as representative sample
              if (results.packets.length > 0) {
                const firstPacket = results.packets[0];
                const validationResult = await validatePacketFromGo(
                  runtime,
                  firstPacket.packetKey,
                  { sourceRef: firstPacket.sourceRef }
                );

                if (validationResult.status === 'PASS') {
                  console.log(`[Atlas VERIFY] Validation PASSED`);
                  runtime.state = AtlasState.SYNTHESIZE;
                } else if (validationResult.status === 'WARN') {
                  console.warn(`[Atlas VERIFY] Validation WARNING`);
                  // Continue to synthesis with warning
                  runtime.state = AtlasState.SYNTHESIZE;
                } else {
                  console.error(`[Atlas VERIFY] Validation FAILED`, validationResult.errors);
                  runtime.state = AtlasState.RECOVER;
                }
              }
            } catch (err) {
              console.error(`[Atlas VERIFY] Validation error:`, err);
              // Continue anyway if validation service unavailable
              runtime.state = AtlasState.SYNTHESIZE;
            }
            break;

          case AtlasState.SYNTHESIZE:
            // Build context packet for LLM synthesis
            console.log(`[Atlas SYNTHESIZE] Building context for ${results.packets.length} packets`);

            try {
              const contextPacket = await buildContextFromGo(
                runtime,
                results.packets.map((p) => p.packetKey),
                Math.min(runtime.tokenBudget.remainingInput, 4096)
              );

              results.summary = contextPacket.prompt;
              console.log(`[Atlas SYNTHESIZE] Context assembled (${contextPacket.tokenCount} tokens)`);

              runtime.state = AtlasState.VALIDATE;
            } catch (err) {
              console.error(`[Atlas SYNTHESIZE] Context build error:`, err);
              // Return partial results
              runtime.state = AtlasState.COMPLETE;
            }
            break;

          case AtlasState.VALIDATE:
            // Final validation before completing
            console.log(`[Atlas VALIDATE] Final validation`);
            if (results.packets.length > 0 && results.summary.length > 0) {
              runtime.state = AtlasState.COMPLETE;
            } else {
              runtime.state = AtlasState.RECOVER;
            }
            break;

          case AtlasState.RECOVER:
            // Error recovery — log and complete
            console.warn(`[Atlas RECOVER] Workflow in recovery mode, returning partial results`);
            runtime.state = AtlasState.COMPLETE;
            break;

          default:
            runtime.state = AtlasState.COMPLETE;
        }
      } catch (err) {
        console.error(
          `[Atlas] Step error in state ${previousState}:`,
          err instanceof Error ? err.message : err
        );
        runtime.state = AtlasState.RECOVER;
      }
    }

    if (iterationNumber >= maxIterations) {
      console.warn(`[Atlas] Workflow exceeded max iterations (${maxIterations})`);
    }

    // Finalize results
    results.finalState = runtime.state;
    results.confidence = runtime.confidence;
    results.metadata.iterations = iterationNumber;
    results.metadata.durationMs = Date.now() - startTime;

    console.log(
      `[Atlas] Workflow complete: ${results.packets.length} packets, ${iterationNumber} iterations, ${results.metadata.durationMs}ms`
    );

    return json(results);
  } catch (error) {
    console.error('[Atlas] Fatal error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    return json(
      {
        packets: [],
        summary: '',
        finalState: 'RECOVER',
        confidence: 0,
        metadata: {
          error: errorMessage,
          durationMs: Date.now() - startTime,
        },
      },
      { status: 500 }
    );
  }
};
