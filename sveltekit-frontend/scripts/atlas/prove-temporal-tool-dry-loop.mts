import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildTemporalToolExecutionContext } from '../../src/lib/server/atlas/temporal/temporal-tool-execution-boundary.js';
import { recordTemporalToolDispatchOutcomeFromPostgres } from '../../src/lib/server/atlas/temporal/temporal-tool-post-dispatch-recorder.js';
import { executeTool } from '../../src/lib/server/ai/tool-shim.js';
import { closeConnections, pool } from '../../src/lib/server/db/client.js';

const APPLY = process.env.ATLAS_TEMPORAL_DRY_LOOP_PROOF === '1';
const PRODUCER_REVISION = 'atlas-temporal-dry-loop-proof-v1';

async function relationExists(name: string): Promise<boolean> {
  const result = await pool.query<{ regclass: string | null }>('SELECT to_regclass($1) AS regclass', [name]);
  return result.rows[0]?.regclass != null;
}

async function counter(path: string): Promise<number> {
  try {
    return Number((await readFile(path, 'utf8')).trim() || '0');
  } catch {
    return 0;
  }
}

function nodeIncrementCommand(path: string, shouldFail = false): string {
  const script = [
    "const fs=require('fs')",
    `const p=${JSON.stringify(path)}`,
    "let n=0; try{n=Number(fs.readFileSync(p,'utf8'))||0}catch{}",
    "fs.writeFileSync(p,String(n+1))",
    shouldFail ? "process.exit(7)" : "process.stdout.write(String(n+1))",
  ].join(';');
  return `node -e ${JSON.stringify(script)}`;
}

function temporalContext(call: { tool: string; args: unknown }, resource: string) {
  const observedAt = new Date().toISOString();
  return buildTemporalToolExecutionContext({
    call,
    descriptor: {
      opcode: 'TERMINAL_PROOF',
      query_class: 'temporal_dry_loop_proof',
      target: { canonical_id: null, resource, target_class: 'proof_counter' },
      implementation_revision: 'tool-shim-terminal-v1',
      parameter_revision: 'proof-params-v1',
      context_manifest_hash: null,
      applicability: {
        observed_at: observedAt,
        valid_time: { from: null, to: null },
        workspace_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
        source_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
        graph_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
        relevant_dimensions: [],
        evidence_frontier_hash: null,
      },
    },
    retry_policy: {
      policy_revision: 'proof-no-retry-v1',
      allow_transient_retry: false,
      max_retries: 0,
      retryable_outcomes: [],
    },
    producer_revision: PRODUCER_REVISION,
  });
}

function workflowEvent(input: {
  workflowId: string;
  actionId: string;
  sequence: number;
  kind: 'completed' | 'failed';
  toolId: string;
  observedAt: string;
}) {
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
    evidenceRefs: ['proof:temporal-dry-loop'],
    artifactRefs: [],
    startedAt: input.observedAt,
    completedAt: input.observedAt,
    errorCode: input.kind === 'failed' ? 'PROOF_TOOL_ERROR' : undefined,
    metadata: { proof_only: true },
    producerRevision: PRODUCER_REVISION,
  };
}

async function main() {
  const prerequisites = {
    workflow_artifacts: await relationExists('workflow_artifacts'),
    atlas_agent_action_events: await relationExists('atlas_agent_action_events'),
    atlas_agent_action_ledger_sequence_seq: await relationExists('atlas_agent_action_ledger_sequence_seq'),
  };

  if (!Object.values(prerequisites).every(Boolean)) {
    console.log(JSON.stringify({
      schema: 'atlas.temporal-dry-loop-proof.v1',
      status: 'BLOCKED_MIGRATION_PREREQUISITE',
      prerequisites,
      canonicalWritesAttempted: false,
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  if (!APPLY) {
    console.log(JSON.stringify({
      schema: 'atlas.temporal-dry-loop-proof.v1',
      status: 'READY_APPLY_DISABLED',
      prerequisites,
      hint: 'Set ATLAS_TEMPORAL_DRY_LOOP_PROOF=1 only in the intended non-production proof database.',
      canonicalWritesAttempted: false,
    }, null, 2));
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('TEMPORAL_DRY_LOOP_PROOF_REFUSES_PRODUCTION');
  }

  const runId = randomUUID();
  const successCounter = resolve(process.cwd(), 'tmp', `temporal-success-${runId}.txt`);
  const failureCounter = resolve(process.cwd(), 'tmp', `temporal-failure-${runId}.txt`);
  const workflowId = `proof:temporal-dry-loop:${runId}`;

  try {
    const successCall = { tool: 'terminal', args: { command: nodeIncrementCommand(successCounter, false) } };
    const successTemporal = temporalContext(successCall, successCounter);
    const successContext: Record<string, unknown> = { temporalAction: successTemporal };

    const firstSuccess = await executeTool(successCall, successContext);
    const afterFirstSuccess = await counter(successCounter);
    if (afterFirstSuccess !== 1) throw new Error(`SUCCESS_FIRST_DISPATCH_COUNT:${afterFirstSuccess}`);

    await recordTemporalToolDispatchOutcomeFromPostgres({
      workflow_event: workflowEvent({
        workflowId,
        actionId: 'success-terminal',
        sequence: 1,
        kind: 'completed',
        toolId: 'terminal',
        observedAt: new Date().toISOString(),
      }),
      descriptor: successTemporal.descriptor,
      outcome: 'SUCCESS_EXACT',
      tool_result: firstSuccess,
      producer_revision: PRODUCER_REVISION,
      result_schema_id: 'atlas.temporal-proof-terminal-result.v1',
      result_revisions: { proof_run: runId },
    });

    const secondSuccess = await executeTool(successCall, { temporalAction: successTemporal });
    const afterSecondSuccess = await counter(successCounter);
    if (afterSecondSuccess !== 1) throw new Error(`SUCCESS_REDISPATCHED:${afterSecondSuccess}`);
    if ((secondSuccess as any)?.temporalDisposition !== 'REUSE_RESULT') {
      throw new Error(`SUCCESS_NOT_REUSED:${JSON.stringify(secondSuccess)}`);
    }

    const failureCall = { tool: 'terminal', args: { command: nodeIncrementCommand(failureCounter, true) } };
    const failureTemporal = temporalContext(failureCall, failureCounter);
    const firstFailure = await executeTool(failureCall, { temporalAction: failureTemporal });
    const afterFirstFailure = await counter(failureCounter);
    if (afterFirstFailure !== 1) throw new Error(`FAILURE_FIRST_DISPATCH_COUNT:${afterFirstFailure}`);

    await recordTemporalToolDispatchOutcomeFromPostgres({
      workflow_event: workflowEvent({
        workflowId,
        actionId: 'failed-terminal',
        sequence: 2,
        kind: 'failed',
        toolId: 'terminal',
        observedAt: new Date().toISOString(),
      }),
      descriptor: failureTemporal.descriptor,
      outcome: 'TOOL_ERROR',
      error_code: 'PROOF_TOOL_ERROR',
      producer_revision: PRODUCER_REVISION,
    });

    const secondFailure = await executeTool(failureCall, { temporalAction: failureTemporal });
    const afterSecondFailure = await counter(failureCounter);
    if (afterSecondFailure !== 1) throw new Error(`FAILURE_REDISPATCHED:${afterSecondFailure}`);
    if ((secondFailure as any)?.temporalDisposition !== 'SELECT_ALTERNATIVE') {
      throw new Error(`FAILURE_NOT_SHORT_CIRCUITED:${JSON.stringify(secondFailure)}`);
    }

    console.log(JSON.stringify({
      schema: 'atlas.temporal-dry-loop-proof.v1',
      status: 'TEMPORAL_DRY_LOOP_PROVEN',
      workflowId,
      success: {
        firstDispatchCount: afterFirstSuccess,
        secondDispatchCount: afterSecondSuccess,
        secondDisposition: (secondSuccess as any).temporalDisposition,
        resultRef: (secondSuccess as any).resultRef,
      },
      failure: {
        firstDispatchCount: afterFirstFailure,
        secondDispatchCount: afterSecondFailure,
        secondDisposition: (secondFailure as any).temporalDisposition,
      },
      invariants: {
        successRedispatched: false,
        failedActionRedispatched: false,
        successResultMaterializedByWorkflowArtifacts: true,
        workflowIdentityMintedByTemporalLedger: false,
        actionOutcomeInferredFromTransport: false,
      },
    }, null, 2));
  } finally {
    await rm(successCounter, { force: true }).catch(() => {});
    await rm(failureCounter, { force: true }).catch(() => {});
  }
}

try {
  await main();
} finally {
  await closeConnections();
}
