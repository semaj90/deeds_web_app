/**
 * Record agent execution traces with retrieval context for Phase 3F learning pipeline.
 *
 * Captures: query, retrieval_strategy, selected_concepts, tools_called, outcome, reward
 * This tuple is the training data for Gemma4 planner fine-tuning (QLoRA).
 *
 * CRITICAL: selected_concepts must come from the retrieval context assembler.
 * If null, QLoRA export will skip the trace (missing_selected_concepts counter).
 */

import { pool } from '../db/client';

export interface AgentTraceInput {
  query: string;
  retrievalStrategy: 'vector_only' | 'lexical_only' | 'structural_only' | 'fusion' | 'cold_neschrom' | 'structural';
  selectedConcepts: string[];           // CRITICAL: from ACE context assembler
  selectedPackets: string[];            // CRITICAL: from ACE context assembler
  toolsCalled: string[];
  outcome: 'success' | 'partial' | 'failure';
  reward: number;
  taskId?: string;
  traceSource?: 'opencode' | 'claude_code' | 'gemma4' | 'manual' | 'ci' | 'error-agent';
  repairDiffStats?: {
    filesTouched?: number;
    linesAdded?: number;
    linesDeleted?: number;
    testsPassing?: number;
    testsFailing?: number;
  };
}

/**
 * Record agent trace — NON-BLOCKING (fire-and-forget).
 * Should be called after repair completes to preserve agent latency.
 */
export async function recordAgentTrace(input: AgentTraceInput): Promise<void> {
  try {
    // Validate critical fields
    if (!input.selectedConcepts || input.selectedConcepts.length === 0) {
      console.warn(
        '[AgentTrace] selectedConcepts is empty — trace will be skipped by QLoRA export filter'
      );
    }

    await pool.query(
      `
        INSERT INTO agent_traces (
          task_id,
          prompt,
          retrieved_packets,
          tool_calls,
          commands,
          outcome,
          retrieval_strategy,
          selected_concepts,
          score,
          trace_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        input.taskId || 'global',
        input.query,
        JSON.stringify(input.selectedPackets || []),
        JSON.stringify(input.toolsCalled.map((t) => ({ tool: t }))),
        JSON.stringify(input.toolsCalled),
        input.outcome,
        input.retrievalStrategy,
        JSON.stringify(input.selectedConcepts),
        input.reward,
        input.traceSource || 'gemma4'
      ]
    );

    console.log(`[AgentTrace] Recorded: ${input.query.slice(0, 50)}... (outcome=${input.outcome}, reward=${input.reward.toFixed(2)})`);
  } catch (err) {
    // Non-blocking: log but don't throw
    console.error('[AgentTrace] Recording failed (non-fatal):', (err as Error)?.message);
  }
}

/**
 * Check Phase 3F readiness: how many agent traces have selected_concepts?
 */
export async function getPhase3FReadiness(): Promise<{
  totalTraces: number;
  withConcepts: number;
  withoutConcepts: number;
  readyForQLoRA: number;
  eligiblePercentage: number;
}> {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE selected_concepts IS NOT NULL AND array_length(selected_concepts, 1) > 0) as with_concepts,
        COUNT(*) FILTER (WHERE selected_concepts IS NULL OR array_length(selected_concepts, 1) = 0) as without_concepts,
        COUNT(*) FILTER (WHERE outcome = 'success' AND score >= 0.85 AND array_length(selected_concepts, 1) > 1) as ready_for_qlora
      FROM agent_traces
    `);

    const row = result.rows[0];
    const total = Number(row.total) || 0;
    const withConcepts = Number(row.with_concepts) || 0;

    return {
      totalTraces: total,
      withConcepts: withConcepts,
      withoutConcepts: total - withConcepts,
      readyForQLoRA: Number(row.ready_for_qlora) || 0,
      eligiblePercentage: total > 0 ? Math.round((withConcepts / total) * 100) : 0
    };
  } catch (err) {
    console.error('[Phase3F] Readiness check failed:', (err as Error)?.message);
    return {
      totalTraces: 0,
      withConcepts: 0,
      withoutConcepts: 0,
      readyForQLoRA: 0,
      eligiblePercentage: 0
    };
  }
}
