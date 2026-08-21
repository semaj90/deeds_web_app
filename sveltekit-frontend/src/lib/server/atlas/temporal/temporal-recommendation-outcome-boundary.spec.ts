import { describe, expect, it } from 'vitest';

import { buildActionExecutionKey, temporalActionChecksum } from '@deeds/parent-atlas';
import { selectTemporalAlternativeTool } from './temporal-action-alternative-boundary.js';
import { buildTemporalToolExecutionContext } from './temporal-tool-execution-boundary.js';
import { buildTemporalRecommendationOutcome } from './temporal-recommendation-outcome-boundary.js';

const H = temporalActionChecksum;

function temporal(call: { tool: string; args: Record<string, unknown> }) {
  return buildTemporalToolExecutionContext({
    call,
    descriptor: {
      schema: 'atlas.action-execution-descriptor.v1',
      opcode: 'RG_SEARCH',
      query_class: 'EXACT_SYMBOL',
      target: { canonical_id: 'symbol:foo', resource: null, target_class: 'symbol' },
      implementation_revision: 'rg:v1',
      parameter_revision: 'params:v1',
      context_manifest_hash: null,
      applicability: {
        schema: 'atlas.temporal-applicability.v1',
        observed_at: '2026-08-21T20:00:00.000Z',
        valid_time: { from: null, to: null },
        workspace_revision: { value: 'W1', authority: 'PROVEN', evidence_refs: [] },
        source_revision: { value: 'S1', authority: 'PROVEN', evidence_refs: [] },
        graph_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
        relevant_dimensions: ['workspace', 'source'],
        evidence_frontier_hash: H('frontier'),
      },
    },
    retry_policy: {
      policy_revision: 'retry:v1',
      allow_transient_retry: false,
      max_retries: 0,
      retryable_outcomes: [],
    },
    producer_revision: 'tool:v1',
  });
}

function selection() {
  const call = { tool: 'rg_search', args: { query: 'foo' } };
  const temporalContext = temporal(call);
  const executionKey = buildActionExecutionKey(temporalContext.descriptor);
  return selectTemporalAlternativeTool({
    failed_boundary: {
      schema: 'atlas.temporal-tool-boundary-decision.v1',
      execution_key: 'f'.repeat(64),
      tool: 'search.hybrid',
      disposition: 'SELECT_ALTERNATIVE',
      reused_result_ref: null,
      prior_event_id: 'evt:failed',
      lookup_event_count: 1,
      reuse_decision: 'HIT',
      reason: 'EXACT_FAILURE_DO_NOT_REPEAT',
      boundary_checksum: 'e'.repeat(64),
    },
    plan: {
      workflow_id: 'wf:1',
      workflow_revision: 1,
      candidates: [{
        candidate: {
          candidate_action_id: 'candidate:rg',
          opcode: 'RG_SEARCH',
          query_class: 'EXACT_SYMBOL',
          target_class: 'symbol',
          semantic_affinity: 0.5,
          structural_affinity: 1,
          query_class_affinity: 1,
          expected_information_gain: 0.9,
          execution_cost: 0.1,
          estimated_latency: 0.1,
          mutation_risk: 0,
          token_savings: 0.5,
          dependency_readiness: 1,
          downstream_utility: 0.8,
          latency_budget_ms: 1000,
          prior_failure_error_code: null,
          evidence_refs: [],
          feature_revision: 'features:v1',
        },
        execution_key: executionKey,
        call,
        temporal: temporalContext,
      }],
      history_limit: 32,
      history_scope: 'WORKFLOW',
      excluded_execution_keys: [],
      persist_outcome_receipt: true,
      created_at: '2026-08-21T20:00:01.000Z',
      producer_revision: 'recommend:v1',
    },
    history_events: [],
    history_receipt_ref: 'temporal-history:test',
  });
}

describe('temporal recommendation outcome boundary', () => {
  it('binds downstream success to the exact frozen alternative selection', () => {
    const selected = selection();
    const receipt = buildTemporalRecommendationOutcome({
      selection: selected,
      downstream_success: true,
      observed_at: '2026-08-21T20:02:00.000Z',
      producer_revision: 'langgraph-outcome:v1',
      evidence_refs: ['dag:final-success'],
    });

    expect(receipt.recommendation_id).toBe(selected.package_selection.recommendation.recommendation_id);
    expect(receipt.selected_action_id).toBe('candidate:rg');
    expect(receipt.resulting_execution_key).toBe(selected.selected_execution_key);
    expect(receipt.downstream_success).toBe(true);
    expect(receipt.outcome).toBeNull();
    expect(receipt.evidence_refs).toContain(selected.boundary_checksum);
    expect(receipt.evidence_refs).toContain('temporal-history:test');
  });

  it('admits an authoritative negative action outcome without changing downstream semantics', () => {
    const receipt = buildTemporalRecommendationOutcome({
      selection: selection(),
      downstream_success: false,
      outcome: 'TEST_FAILED',
      observed_at: '2026-08-21T20:03:00.000Z',
      producer_revision: 'langgraph-outcome:v1',
    });
    expect(receipt.downstream_success).toBe(false);
    expect(receipt.outcome).toBe('TEST_FAILED');
  });
});
