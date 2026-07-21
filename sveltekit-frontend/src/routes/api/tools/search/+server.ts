import { json, type RequestHandler } from '@sveltejs/kit';
import { selectTool } from '$lib/server/retrieval/hmm-tool-selector';
import type { ToolCandidateResult } from '$lib/server/retrieval/hmm-tool-selector';
import { analyzeQueryRouting } from '$lib/server/nlp/query-routing.js';
import { buildAceRoutingPacket } from '$lib/server/ace/ace-routing.js';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { query, query_embedding, top_k = 5, filters = {} } = await request.json();

    if (!query || typeof query !== 'string') {
      return json({ error: 'query is required' }, { status: 400 });
    }

    const analysis = await analyzeQueryRouting(query, {
      repositoryId: filters.repositoryId,
      previousIntent: filters.previousIntent,
      taskState: filters.taskState,
      domainHint: filters.domainHint,
    });

    // Select best tool via HMM-gated routing
    const tool: ToolCandidateResult = await selectTool(
      query,
      query_embedding || [],
      top_k,
      undefined,
      {
        intent: analysis.intent,
        domainClass: analysis.domainClass,
        intentConfidence: analysis.intentConfidence,
        domainConfidence: analysis.domainConfidence,
        intentProbabilities: analysis.intentProbabilities,
        domainProbabilities: analysis.domainProbabilities,
        analysisSource: analysis.analysisSource,
      }
    );

    const rankedTools = (
      tool.ranked_tools ??
      (tool.tool_id ? [{ tool: tool.tool_id, score: tool.score }] : [])
    ).map((entry) => ({
      toolId: entry.tool,
      toolName: entry.tool,
      score: entry.score,
      eligible: entry.score > 0,
    }));

    const acePacket = buildAceRoutingPacket({
      query,
      analysis,
      selectedToolId: tool.tool_id,
      rankedTools,
      selectedEvidenceIds: [],
      sourceRefs: [],
      allowedScopes: analysis.domainClass ? [analysis.domainClass] : [],
      prohibitedActions: analysis.authorizationRequired ? ['mutation-without-approval'] : [],
      requiresApproval: analysis.authorizationRequired,
      traceId: filters.traceId ?? `routing:${analysis.query.length}:${Date.now()}`,
      evidenceIds: [],
      processingPassId: `ace-route:${Date.now()}`,
      embeddingContractVersion: 'embeddinggemma-384',
      retrievalContractVersion: 'hybrid-rrf-v1',
    });

    return json({
      tool_id: tool.tool_id,
      tool_name: tool.name,
      confidence: tool.score,
      hmm_state: tool.hmm_state,
      domains: tool.domains,
      fallback: tool.score < 0.70,
      analysis,
      ace_packet: acePacket,
      candidate_tools: rankedTools,
    });
  } catch (error) {
    console.error('[/api/tools/search] Error:', error);
    return json(
      { error: 'Failed to select tool' },
      { status: 500 }
    );
  }
};

/**
 * GET: List available tools
 */
export const GET: RequestHandler = async () => {
  return json({
    tools: [
      {
        tool_id: 'trace.kag_search',
        name: 'KAG Search',
        domains: ['retrieval', 'graph', 'auth']
      },
      {
        tool_id: 'trace.explain_retrieval',
        name: 'Explain Retrieval',
        domains: ['retrieval', 'graph']
      },
      {
        tool_id: 'atlas.topology_expand',
        name: 'Topology Expansion',
        domains: ['topology', 'retrieval']
      },
      {
        tool_id: 'neo4j.dependency_closure',
        name: 'Dependency Closure',
        domains: ['graph', 'analysis']
      },
      {
        tool_id: 'qdrant.dense_search',
        name: 'Dense Vector Search',
        domains: ['retrieval', 'vector']
      },
      {
        tool_id: 'rg.lexical_search',
        name: 'Lexical Search (ripgrep)',
        domains: ['lexical', 'search']
      },
      {
        tool_id: 'gemma4.explain_code',
        name: 'Code Explanation',
        domains: ['synthesis', 'explanation']
      }
    ],
    total: 7
  });
};
