/**
 * Node: Rerank Candidates
 * Decision: Use GPU cosine similarity to rerank top candidates
 * MCP Tool: retrieval:rerank
 */

import type { DispatcherState, NodeContext } from './types.js';
import {
  updateSynthesisPath,
  recordToolCall,
  recordError,
  callMcpTool,
  nodeEntry,
  nodeExit,
} from './node-helpers.js';

export async function nodeRerankCandidates(
  state: DispatcherState,
  ctx: NodeContext
): Promise<DispatcherState> {
  const nodeName = 'node_rerank_candidates';
  const startTime = Date.now();
  nodeEntry(nodeName, state);

  try {
    let current = updateSynthesisPath(state, nodeName);

    if (state.candidates.length === 0) {
      current = { ...current, action: 'degraded', reason: 'No candidates to rerank' };
      const totalDuration = Date.now() - startTime;
      nodeExit(nodeName, current, totalDuration);
      return { ...current, latency_ms: totalDuration };
    }

    // Call MCP tool to GPU rerank
    const { result, error, duration_ms } = await callMcpTool(ctx, 'retrieval:rerank', {
      query: state.query,
      candidates: state.candidates.map((c) => ({
        packet_key: c.packet_key,
        feature_id: c.feature_id,
        summary: c.summary,
      })),
      top_k: Math.min(10, state.candidates.length),
      use_gpu: true,
    });

    const rerankStats = result?.stats || { reranked: 0, top_k: 0 };

    current = recordToolCall(current, {
      tool_name: 'retrieval:rerank',
      params: { candidate_count: state.candidates.length },
      result: rerankStats,
      error: error,
      duration_ms,
    });

    if (error) {
      current = recordError(current, `Reranking failed: ${error}`);
      current = { ...current, action: 'degraded', reason: error };
    } else {
      current = {
        ...current,
        action: 'success',
        reason: `Reranked ${rerankStats.reranked} candidates, top ${rerankStats.top_k} selected`,
        result: result?.ranked_candidates,
      };
    }

    const totalDuration = Date.now() - startTime;
    nodeExit(nodeName, current, totalDuration);
    return { ...current, latency_ms: totalDuration };
  } catch (err) {
    const totalDuration = Date.now() - startTime;
    const errorMsg = String(err);
    let current = recordError(state, errorMsg);
    current = { ...current, action: 'failed', reason: errorMsg, latency_ms: totalDuration };
    nodeExit(nodeName, current, totalDuration);
    return current;
  }
}
