#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { loadAtlasEnv } from './load-atlas-env.mjs';

// DB-adjacent modules stay dynamic: db/client constructs its Pool at import time.
loadAtlasEnv();

const APPLY = process.env.ATLAS_TEMPORAL_DAG_LIVE_PROOF === '1';
const PRODUCER_REVISION = 'atlas-temporal-dag-live-proof-v1';

const {
  buildActionExecutionKey,
  createRecommendationOutcomePostgresRepository,
  createTemporalActionPostgresRepository,
} = await import('@deeds/parent-atlas');
const { buildTemporalToolExecutionContext } = await import(
  '../../src/lib/server/atlas/temporal/temporal-tool-execution-boundary.js'
);
const { recordTemporalToolDispatchOutcomeFromPostgres } = await import(
  '../../src/lib/server/atlas/temporal/temporal-tool-post-dispatch-recorder.js'
);
const { executeTool } = await import('../../src/lib/server/ai/tool-shim.js');
const { runAgentDAG } = await import('../../src/lib/server/ai/langgraph-dag.js');
const { closeConnections, pool } = await import('../../src/lib/server/db/client.js');

async function relationExists(name: string): Promise<boolean> {
  const result = await pool.query<{ regclass: string | null }>(
    'SELECT to_regclass($1) AS regclass',
    [name],
  );
  return result.rows[0]?.regclass != null;
}

async function counter(path: string): Promise<number> {
  try {
    return Number((await readFile(path, 'utf8')).trim() || '0');
  } catch {
    return 0;
  }
}

function failingCounterCommand(path: string): string {
  const script = [
    "const fs=require('fs')",
    `const p=${JSON.stringify(path)}`,
    "let n=0;try{n=Number(fs.readFileSync(p,'utf8'))||0}catch{}",
    "fs.writeFileSync(p,String(n+1))",
    'process.exit(7)',
  ].join(';');
  const encoded = Buffer.from(script, 'utf8').toString('base64');
  return `node -e \"eval(Buffer.from(process.argv[1],'base64').toString('utf8'))\" ${encoded}`;
}

function descriptorBase(input: {
  opcode: string;
  runId: string;
  implementationRevision: string;
}) {
  return {
    schema: 'atlas.action-execution-descriptor.v1' as const,
    opcode: input.opcode,
    query_class: 'temporal_dag_live_proof',
    target: {
      canonical_id: `target:dag-live:${input.runId}`,
      resource: null,
      target_class: 'proof-target',
    },
    implementation_revision: input.implementationRevision,
    parameter_revision: `proof-params:${input.runId}`,
    context_manifest_hash: null,
    applicability: {
      schema: 'atlas.temporal-applicability.v1' as const,
      observed_at: new Date().toISOString(),
      valid_time: { from: null, to: null },
      workspace_revision: {
        value: `workspace:dag-live-proof:${input.runId}`,
        authority: 'PROVEN' as const,
        evidence_refs: [`proof:workspace:${input.runId}`],
      },
      source_revision: {
        value: `source:dag-live-proof:${input.runId}`,
        authority: 'PROVEN' as const,
        evidence_refs: [`proof:source:${input.runId}`],
      },
      graph_revision: {
        value: null,
        authority: 'NOT_APPLICABLE' as const,
        evidence_refs: [],
      },
      relevant_dimensions: ['workspace', 'source'] as const,
      evidence_frontier_hash: null,
    },
  };
}

function workflowEvent(input: {
  workflowId: string;
  actionId: string;
  sequence: number;
  kind: 'completed' | 'failed';
  toolId: string;
  errorCode?: string | null;
}) {
  const now = new Date().toISOString();
  return {
    schema: 'atlas.workflow-action.v1' as const,
    workflowId: input.workflowId,
    workflowRevision: 1,
    sequence: input.sequence,
    actionId: input.actionId,
    dagNodeId: `proof:${input.actionId}`,
    attempt: 1,
    lane: 'tool' as const,
    transport: 'local' as const,
    kind: input.kind,
    toolId: input.toolId,
    receiptId: input.kind === 'completed' ? `receipt:${input.actionId}` : undefined,
    resourceRefs: [],
    evidenceRefs: ['proof:temporal-dag-live'],
    artifactRefs: [],
    startedAt: now,
    completedAt: now,
    errorCode: input.kind === 'failed' ? input.errorCode ?? 'PROOF_TOOL_ERROR' : undefined,
    metadata: { proof_only: true },
    producerRevision: PRODUCER_REVISION,
  };
}

async function main(): Promise<void> {
  const prerequisites = {
    workflow_artifacts: await relationExists('workflow_artifacts'),
    atlas_agent_action_events: await relationExists('atlas_agent_action_events'),
    atlas_agent_action_ledger_sequence_seq: await relationExists('atlas_agent_action_ledger_sequence_seq'),
    atlas_recommendation_outcome_receipts: await relationExists('atlas_recommendation_outcome_receipts'),
  };

  if (!Object.values(prerequisites).every(Boolean)) {
    console.log(JSON.stringify({
      schema: 'atlas.temporal-dag-live-proof.v1',
      status: 'BLOCKED_MIGRATION_PREREQUISITE',
      prerequisites,
      writesAttempted: false,
    }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (!APPLY) {
    console.log(JSON.stringify({
      schema: 'atlas.temporal-dag-live-proof.v1',
      status: 'READY_APPLY_DISABLED',
      prerequisites,
      hint: 'Set ATLAS_TEMPORAL_DAG_LIVE_PROOF=1 only for the intended non-production proof database.',
      writesAttempted: false,
    }, null, 2));
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('TEMPORAL_DAG_LIVE_PROOF_REFUSES_PRODUCTION');
  }

  const runId = randomUUID();
  const workflowId = `proof:temporal-dag-live:${runId}`;
  const k1CounterPath = resolve(process.cwd(), 'tmp', `temporal-dag-k1-${runId}.txt`);
  let workflowSequence = 1;
  const retryPolicy = {
    policy_revision: 'proof-no-retry-v1',
    allow_transient_retry: false,
    max_retries: 0,
    retryable_outcomes: ['TOOL_ERROR', 'TIMEOUT'] as const,
  };

  const k1Call = { tool: 'terminal', args: { command: failingCounterCommand(k1CounterPath) } };
  const k1Temporal = buildTemporalToolExecutionContext({
    call: k1Call,
    descriptor: descriptorBase({
      opcode: 'TERMINAL_PROOF_FAILURE',
      runId,
      implementationRevision: 'terminal-proof-failure:v1',
    }),
    retry_policy: retryPolicy,
    producer_revision: PRODUCER_REVISION,
  });
  const k1Key = buildActionExecutionKey(k1Temporal.descriptor);

  // codebase.rg_search is explicitly read-only. A unique query may return zero
  // hits and still proves successful execution; we care about the K2 edge, not
  // retrieval quality in this temporal-control fixture.
  const k2Call = {
    tool: 'rg_search',
    args: {
      query: `temporal-dag-live-proof-${runId}`,
      paths: ['src/lib/server/atlas/temporal'],
      limit: 5,
    },
  };
  const k2Temporal = buildTemporalToolExecutionContext({
    call: k2Call,
    descriptor: descriptorBase({
      opcode: 'RG_SEARCH',
      runId,
      implementationRevision: 'rg-search:dag-live-proof:v1',
    }),
    retry_policy: retryPolicy,
    producer_revision: PRODUCER_REVISION,
  });
  const k2Key = buildActionExecutionKey(k2Temporal.descriptor);

  const plan = {
    schema: 'atlas.temporal-alternative-plan.v1' as const,
    workflow_id: workflowId,
    workflow_revision: 1,
    candidates: [{
      candidate: {
        candidate_action_id: `candidate:${runId}:rg-search`,
        opcode: 'RG_SEARCH',
        query_class: 'temporal_dag_live_proof',
        target_class: 'proof-target',
        semantic_affinity: 1,
        structural_affinity: 1,
        query_class_affinity: 1,
        expected_information_gain: 1,
        execution_cost: 0.1,
        estimated_latency: 0.1,
        mutation_risk: 0,
        token_savings: 1,
        dependency_readiness: 1,
        downstream_utility: 1,
        latency_budget_ms: 10_000,
        prior_failure_error_code: null,
        evidence_refs: [`proof:k2:${runId}`],
        feature_revision: 'features:temporal-dag-live-proof:v1',
      },
      execution_key: k2Key,
      call: k2Call,
      temporal: k2Temporal,
    }],
    history_limit: 64,
    history_scope: 'WORKFLOW' as const,
    excluded_execution_keys: [],
    persist_outcome_receipt: true,
    created_at: new Date().toISOString(),
    producer_revision: PRODUCER_REVISION,
  };

  try {
    // Genuine K1 failure: execute a subprocess once, then persist the explicit
    // TOOL_ERROR. The DAG replay must suppress this exact call from history.
    const firstK1Result = await executeTool(k1Call);
    const k1AfterSeed = await counter(k1CounterPath);
    if (k1AfterSeed !== 1) throw new Error(`DAG_K1_SEED_DISPATCH_COUNT:${k1AfterSeed}`);
    if ((firstK1Result as any)?.ok !== false) {
      throw new Error(`DAG_K1_EXPECTED_REAL_FAILURE:${JSON.stringify(firstK1Result)}`);
    }
    await recordTemporalToolDispatchOutcomeFromPostgres({
      workflow_event: workflowEvent({
        workflowId,
        actionId: `k1-terminal-failure:${runId}`,
        sequence: workflowSequence++,
        kind: 'failed',
        toolId: 'terminal',
        errorCode: 'PROOF_K1_TERMINAL_EXIT_7',
      }),
      descriptor: k1Temporal.descriptor,
      outcome: 'TOOL_ERROR',
      error_code: 'PROOF_K1_TERMINAL_EXIT_7',
      evidence_refs: [`proof:k1:${runId}`],
      producer_revision: PRODUCER_REVISION,
    });

    const ctx: Record<string, any> = {
      strategy: 'default',
      runId,
      temporalAction: k1Temporal,
      temporalAlternativePlan: plan,
      // Explicit proof-owned canonical outcome for K2. The post-dispatch hook
      // first requires the MCP contract's success=true; it does not silently
      // promote arbitrary transport success to ActionOutcomeV1.
      temporalAuthoritativeActionOutcome: 'SUCCESS_EXACT',
      temporalPostDispatch: async ({ call, result, temporalAction }: any) => {
        if (call.tool !== 'rg_search') {
          throw new Error(`DAG_UNEXPECTED_POST_DISPATCH_TOOL:${call.tool}`);
        }
        if (result?.success !== true) {
          throw new Error(`DAG_K2_RG_SEARCH_NOT_SUCCESSFUL:${JSON.stringify(result)}`);
        }
        await recordTemporalToolDispatchOutcomeFromPostgres({
          workflow_event: workflowEvent({
            workflowId,
            actionId: `k2-rg-search:${runId}`,
            sequence: workflowSequence++,
            kind: 'completed',
            toolId: 'rg_search',
          }),
          descriptor: temporalAction.descriptor,
          outcome: 'SUCCESS_EXACT',
          tool_result: result,
          evidence_refs: [`proof:k2:${runId}`],
          producer_revision: PRODUCER_REVISION,
          result_schema_id: 'atlas.temporal-dag-live-rg-result.v1',
          result_revisions: { proof_run: runId },
        });
      },
    };

    // `graph` forces the production DAG tool path. parseToolCall still identifies
    // K1 from execute_bash; applyTemporalBoundary must replace it before dispatch.
    const dagResult = await runAgentDAG(
      `graph <execute_bash>${k1Call.args.command}</execute_bash>`,
      ctx,
    );
    if (dagResult.success !== true) {
      throw new Error(`DAG_K2_DID_NOT_FINALIZE_SUCCESS:${JSON.stringify(dagResult)}`);
    }

    const k1AfterDag = await counter(k1CounterPath);
    if (k1AfterDag !== 1) throw new Error(`DAG_K1_REDISPATCHED:${k1AfterDag}`);

    const temporalRepository = createTemporalActionPostgresRepository(pool);
    const k1History = await temporalRepository.currentByExecutionKey(k1Key, PRODUCER_REVISION);
    const k2History = await temporalRepository.currentByExecutionKey(k2Key, PRODUCER_REVISION);
    if (k1History.receipt.event_count !== 1) throw new Error(`DAG_K1_HISTORY_COUNT:${k1History.receipt.event_count}`);
    if (k2History.receipt.event_count !== 1) throw new Error(`DAG_K2_HISTORY_COUNT:${k2History.receipt.event_count}`);
    if (k1History.current?.latest_outcome !== 'TOOL_ERROR') {
      throw new Error(`DAG_K1_HISTORY_OUTCOME:${String(k1History.current?.latest_outcome)}`);
    }
    if (k2History.current?.latest_outcome !== 'SUCCESS_EXACT') {
      throw new Error(`DAG_K2_HISTORY_OUTCOME:${String(k2History.current?.latest_outcome)}`);
    }

    const selection = ctx.temporalAlternativeSelection;
    if (!selection) throw new Error('DAG_ALTERNATIVE_SELECTION_MISSING');
    if (selection.failed_execution_key !== k1Key) throw new Error('DAG_FAILED_EXECUTION_KEY_MISMATCH');
    if (selection.selected_execution_key !== k2Key) throw new Error('DAG_SELECTED_EXECUTION_KEY_MISMATCH');

    const outcomeBoundary = ctx.temporalRecommendationOutcome;
    if (!outcomeBoundary?.receipt) throw new Error('DAG_RECOMMENDATION_OUTCOME_MISSING');
    const outcomeRepository = createRecommendationOutcomePostgresRepository(pool);
    const outcomeRows = await outcomeRepository.listByRecommendationId(
      selection.package_selection.recommendation.recommendation_id,
    );
    if (outcomeRows.length !== 1) throw new Error(`DAG_RECOMMENDATION_OUTCOME_COUNT:${outcomeRows.length}`);
    const outcome = outcomeRows[0]!;
    if (outcome.selected_action_id !== plan.candidates[0]!.candidate.candidate_action_id) {
      throw new Error('DAG_OUTCOME_SELECTED_ACTION_MISMATCH');
    }
    if (outcome.resulting_execution_key !== k2Key) throw new Error('DAG_OUTCOME_EXECUTION_KEY_MISMATCH');
    if (outcome.downstream_success !== true) throw new Error('DAG_OUTCOME_DOWNSTREAM_SUCCESS_MISMATCH');

    console.log(JSON.stringify({
      schema: 'atlas.temporal-dag-live-proof.v1',
      status: 'TEMPORAL_DAG_LIVE_ALTERNATIVE_PROVEN',
      runId,
      workflowId,
      k1: {
        executionKey: k1Key,
        realDispatchCountBeforeDag: k1AfterSeed,
        realDispatchCountAfterDag: k1AfterDag,
        outcome: k1History.current?.latest_outcome ?? null,
        eventCount: k1History.receipt.event_count,
      },
      k2: {
        executionKey: k2Key,
        tool: 'rg_search',
        outcome: k2History.current?.latest_outcome ?? null,
        eventCount: k2History.receipt.event_count,
        resultRef: k2History.current?.latest_result_ref ?? null,
      },
      recommendation: {
        recommendationId: outcome.recommendation_id,
        selectedActionId: outcome.selected_action_id,
        resultingExecutionKey: outcome.resulting_execution_key,
        downstreamSuccess: outcome.downstream_success,
        receiptChecksum: outcomeBoundary.append_receipt?.receipt_checksum ?? null,
      },
      invariants: {
        k1KnownFailureNotRedispatched: true,
        alternativeSelectedFromDurableHistory: true,
        k2ActuallyDispatched: true,
        k2TemporalSuccessPersisted: true,
        recommendationOutcomePersistedAndReadBack: true,
        workflowIdentityOwnedOutsideTemporalLedger: true,
      },
    }, null, 2));
  } finally {
    await rm(k1CounterPath, { force: true }).catch(() => {});
  }
}

try {
  await main();
} finally {
  await closeConnections();
}
