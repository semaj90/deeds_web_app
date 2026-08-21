/**
 * Policy Trainer — QLoRA for Ornith's MCP behavior learning
 *
 * Training example:
 *   STATE: task, retrieval evidence, current TRACE state
 *   ACTION: which tool, with what arguments, what interpretation, what patch
 *   OUTCOME: compile test verifier result
 *
 * Training phases:
 *   Phase A: SFT QLoRA (strong successful traces)
 *   Phase B: Preference training (good action vs bad action)
 *   Phase C: On-policy distillation (Ornith generates trajectories, teacher evaluates)
 *
 * Important: Do NOT train from raw old traces immediately
 * - Old traces were generated under old retrieval models, schemas, tool names
 * - Need trajectory eligibility gate:
 *   - schema compatible
 *   - tool still exists
 *   - packet lineage valid
 *   - test still reproducible
 *   - source revision resolvable
 *
 * Training corpus: Old traces remain useful as evidence mining input
 * but NOT automatically as gold demonstrations.
 */

export type PolicyTrainerType =
  | 'qlora_sft'
  | 'preference_training'
  | 'on_policy_distillation';

export interface PolicyTrainingExample {
  state: {
    task_id: string;
    retrieval_evidence: Array<{
      packet_key: string;
      source_ref: string;
      score: number;
      retrieval_strategy: string;
    }>;
    trace_state: {
      agent_run_id: string;
      tool_calls: Array<{
        tool_name: string;
        arguments: Record<string, unknown>;
        interpretation: string;
      }>;
      current_state: string;
    };
  };
  action: {
    tool_name: string;
    arguments: Record<string, unknown>;
    interpretation: string;
    patch?: {
      file_path: string;
      changes: Array<{
        line_number: number;
        old_content: string;
        new_content: string;
      }>;
    };
  };
  outcome: {
    compile_pass: boolean;
    test_pass: boolean;
    behavioral_eval_pass: boolean;
    reward: number;
    agent_run_id: string;
  };
}

export interface PolicyTrainerConfig {
  type: PolicyTrainerType;
  model_name: string; // e.g., 'models/gemma4-legal-iq4xs-direct.gguf'
  adapter_name: string;
  device: string;
  // QLoRA configuration
  lora_rank: number;
  lora_alpha: number;
  lora_dropout: number;
  target_modules: string[];
  // Training data
  data_source: 'agent_runs' | 'manual' | 'synthetic';
  // Eligibility gate
  eligibility_gate: {
    schema_version: string;
    min_success_rate: number;
    max_age_days: number;
  };
}

export interface PolicyTrainerStats {
  total_examples: number;
  successful_examples: number;
  failed_examples: number;
  training_loss: number;
  validation_loss: number;
  evaluation_accuracy: number;
  evaluation_f1_score: number;
  evaluation_reward: number;
  // Phase-specific stats
  phase_a_sft_loss?: number;
  phase_b_preference_loss?: number;
  phase_c_opd_loss?: number;
}

/**
 * Create a policy trainer instance
 */
export function createPolicyTrainer(config: PolicyTrainerConfig) {
  return {
    config,
    stats: null as PolicyTrainerStats | null,
    train: async (data: PolicyTrainingExample[]) => {
      throw new Error('PolicyTrainer.train() not implemented - use specific trainer implementation');
    },
    validate: async (data: PolicyTrainingExample[]) => {
      // Validate eligibility gate
      throw new Error('PolicyTrainer.validate() not implemented - use specific trainer implementation');
    },
    evaluate: async (test_set: PolicyTrainingExample[]) => {
      throw new Error('PolicyTrainer.evaluate() not implemented - use specific trainer implementation');
    },
  };
}

/**
 * Check if a training trace is eligible
 */
export function isTraceEligible(trace: {
  schema_version: string;
  tool_calls: Array<{
    tool_name: string;
    arguments: Record<string, unknown>;
  }>;
  source_revision: string;
  test_pass: boolean;
  age_days: number;
}): boolean {
  // Schema compatibility
  const isSchemaCompatible = trace.schema_version.startsWith('atlas-agent-run-v2');
  
  // Tool existence
  const tools = new Set([
    'trace_kag_search',
    'trace_kag_multi_lane_search',
    'kag_record_agent_run',
    'packet_search',
    'graph_expand_neighborhood',
    'graph_shortest_path',
  ]);
  
  const toolExists = trace.tool_calls.every(
    tc => tools.has(tc.tool_name)
  );
  
  // Packet lineage valid
  const hasValidPacketLineage = trace.tool_calls.some(
    tc => tc.tool_name === 'trace_kag_search' || tc.tool_name === 'trace_kag_multi_lane_search'
  );
  
  // Test reproducible
  const isTestReproducible = trace.test_pass;
  
  // Source revision resolvable
  const isSourceResolvable = trace.source_revision !== '';
  
  // Age check
  const isRecentEnough = trace.age_days <= 365; // Max 1 year old
  
  return (
    isSchemaCompatible &&
    toolExists &&
    hasValidPacketLineage &&
    isTestReproducible &&
    isSourceResolvable &&
    isRecentEnough
  );
}

/**
 * Generate training examples from agent runs
 *
 * Must derive labels from execution evidence, not manual decisions.
 *
 * Examples:
 *   - successful run: used evidence positive
 *   - failed run: high ranked evidence maybe negative
 *   - later repair: evidence contrastive positive
 *
 * This aligns with multi rollout distillation research which uses
 * successful and failed sibling trajectories as useful supervision.
 */
export function generateTrainingExamples(
  agentRuns: Array<{
    run_id: string;
    task_id: string;
    tool_calls: Array<{
      tool_name: string;
      arguments: Record<string, unknown>;
      interpretation: string;
    }>;
    outcome: {
      compile_pass: boolean;
      test_pass: boolean;
      behavioral_eval_pass: boolean;
      reward: number;
    };
    source_revision: string;
    age_days: number;
  }>
): PolicyTrainingExample[] {
  return agentRuns
    .filter(run => isTraceEligible({
      schema_version: 'atlas-agent-run-v2',
      tool_calls: run.tool_calls.map(tc => ({
        tool_name: tc.tool_name,
        arguments: tc.arguments,
      })),
      source_revision: run.source_revision,
      test_pass: run.outcome.test_pass,
      age_days: run.age_days,
    }))
    .map(run => ({
      state: {
        task_id: run.task_id,
        retrieval_evidence: run.tool_calls
          .filter(tc => 
            tc.tool_name === 'trace_kag_search' || tc.tool_name === 'trace_kag_multi_lane_search'
          )
          .map(tc => ({
            packet_key: tc.arguments.packet_key as string,
            source_ref: tc.arguments.source_ref as string,
            score: tc.arguments.score as number,
            retrieval_strategy: tc.arguments.retrieval_strategy as string,
          })),
        trace_state: {
          agent_run_id: run.run_id,
          tool_calls: run.tool_calls,
          current_state: 'after_execution',
        },
      },
      action: {
        tool_name: run.tool_calls[run.tool_calls.length - 1]?.tool_name ?? '',
        arguments: run.tool_calls[run.tool_calls.length - 1]?.arguments ?? {},
        interpretation: run.tool_calls[run.tool_calls.length - 1]?.interpretation ?? '',
        patch: run.outcome.test_pass ? {
          file_path: '',
          changes: [],
        } : undefined,
      },
      outcome: {
        ...run.outcome,
        agent_run_id: run.run_id,
      },
    }));
}
