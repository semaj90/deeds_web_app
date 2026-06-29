/**
 * ACE Policy Orchestrator API Route
 * Endpoint: POST /api/ace/policy-orchestrator
 *
 * Request body: { query: string; candidates: ScoredCandidate[] }
 * Response: { aceContext: ACEAssemblyPlan; trace: RLMTraceEntry }
 *
 * Flow:
 * 1. Decompose query via Gemma4 planner
 * 2. Extract features via worker pool
 * 3. Score via policy-reranker.pt
 * 4. Assemble ACE packets
 * 5. Log RLM trace
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { Gemma4PolicyOrchestrator } from '$lib/gpu/gemma4-policy-orchestrator';
import type { ScoredCandidate } from '$lib/gpu/gemma4-policy-orchestrator';

// Singleton orchestrator (initialize on first request)
let orchestrator: Gemma4PolicyOrchestrator | null = null;

async function getOrchestrator() {
  if (!orchestrator) {
    orchestrator = new Gemma4PolicyOrchestrator();
    try {
      await orchestrator.initialize();
    } catch (err) {
      console.warn('[ACE] Policy model initialization failed (fallback will degrade gracefully):', err);
      // Don't re-throw; orchestrator will use fallback heuristic scoring
    }
  }
  return orchestrator;
}

interface PolicyOrchestratorRequest {
  query: string;
  candidates: ScoredCandidate[];
  context?: {
    caseId?: string;
    userId?: string;
  };
}

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Validate auth
    if (!locals.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as PolicyOrchestratorRequest;
    if (!body.query || !body.candidates) {
      return json({ error: 'Missing query or candidates' }, { status: 400 });
    }

    const orchestrator = await getOrchestrator();

    // Stage 1: Decompose
    const decomposition = await orchestrator.decomposeQuery(body.query, body.context);

    // Stage 2: Feature Engineering
    const candidatesWithFeatures = await orchestrator.extractFeatures(body.candidates, body.query);

    // Stage 3: Policy Reranking
    const policyScores = await orchestrator.rerank(candidatesWithFeatures);

    // Stage 4: ACE Assembly
    const aceAssembly = await orchestrator.assembleACE(policyScores, candidatesWithFeatures);

    // Stage 5: Gemma4 Synthesis
    let synthesis = null;
    try {
      synthesis = await orchestrator.synthesizeAnswer(body.query, decomposition, aceAssembly);
    } catch (err) {
      console.warn('[API] Synthesis failed (non-blocking):', err);
      // Synthesis is optional; continue without it
    }

    // Stage 6: RLM Logging
    const traceId = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // TODO: Wire orchestrator.logRLMTrace() when Postgres/Redis backend available

    // Return full ACE + Synthesis + trace info
    return json(
      {
        success: true,
        aceContext: {
          selectedPackets: aceAssembly.selectedPackets,
          evidence: aceAssembly.evidence,
          contextWindow: aceAssembly.contextWindow
        },
        synthesis: synthesis
          ? {
              answer: synthesis.answer,
              citations: synthesis.citations,
              confidence: synthesis.confidence,
              reasoning: synthesis.reasoning
            }
          : null,
        trace: {
          traceId,
          decomposition,
          policyScores,
          selectedPacketCount: aceAssembly.selectedPackets.length,
          synthesisGenerated: !!synthesis
        }
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[ACE Policy Orchestrator] Error:', err);
    return json(
      {
        error: err instanceof Error ? err.message : 'Policy orchestration failed',
        candidates: [], // fallback empty
        trace: null
      },
      { status: 500 }
    );
  }
};

export const GET: RequestHandler = async () => {
  return json(
    {
      endpoint: '/api/ace/policy-orchestrator',
      method: 'POST',
      description: 'Gemma4 policy orchestrator for agent-to-agent retrieval',
      body: {
        query: 'string (user question)',
        candidates: 'ScoredCandidate[] (from Qdrant ANN)',
        context: '{ caseId?: string; userId?: string }'
      },
      response: {
        aceContext: 'ACEAssemblyPlan (selected packets + evidence)',
        trace: 'RLMTraceEntry (for training loop)'
      },
      stages: [
        'Stage 1: Decompose query via Gemma4 planner',
        'Stage 2: Extract 16-scalar features via worker pool',
        'Stage 3: Score via policy-reranker.pt',
        'Stage 4: Assemble ACE packets (deterministic)',
        'Stage 5: (Caller) Synthesize with Gemma4',
        'Stage 6: Log RLM trace for training'
      ]
    },
    { status: 200 }
  );
};
