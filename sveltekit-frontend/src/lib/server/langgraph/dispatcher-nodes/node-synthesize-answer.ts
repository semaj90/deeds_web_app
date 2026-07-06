/**
 * Node: Synthesize Answer
 * Decision: Generate final answer using Gemma4 with ranked candidates
 * MCP Tool: answer:synthesize
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

export async function nodeSynthesizeAnswer(
  state: DispatcherState,
  ctx: NodeContext
): Promise<DispatcherState> {
  const nodeName = 'node_synthesize_answer';
  const startTime = Date.now();
  nodeEntry(nodeName, state);

  try {
    let current = updateSynthesisPath(state, nodeName);

    if (state.candidates.length === 0) {
      current = { ...current, action: 'degraded', reason: 'No candidates for synthesis' };
      const totalDuration = Date.now() - startTime;
      nodeExit(nodeName, current, totalDuration);
      return { ...current, latency_ms: totalDuration };
    }

    // Call MCP tool for Gemma4 synthesis
    const { result, error, duration_ms } = await callMcpTool(ctx, 'answer:synthesize', {
      query: state.query,
      context_packets: state.candidates.slice(0, 5), // top 5 candidates
      synthesis_model: 'gemma4-legal-iq4xs-direct.gguf',
      max_tokens: 1024,
      temperature: 0.3,
      include_citations: true,
    });

    const synthesis = result?.synthesis || null;
    const citations = result?.citations || [];

    current = recordToolCall(current, {
      tool_name: 'answer:synthesize',
      params: { candidate_count: state.candidates.length },
      result: { synthesis_len: synthesis?.length || 0, citation_count: citations.length },
      error: error,
      duration_ms,
    });

    if (error) {
      current = recordError(current, `Synthesis failed: ${error}`);
      current = { ...current, action: 'degraded', reason: error };
    } else if (synthesis && synthesis.length > 10) {
      current = {
        ...current,
        action: 'success',
        reason: `Generated answer (${synthesis.length} chars, ${citations.length} citations)`,
        result: { synthesis, citations },
      };
    } else {
      current = { ...current, action: 'degraded', reason: 'Synthesis too short or empty' };
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
