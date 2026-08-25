#!/usr/bin/env node
/**
 * Read-only schema-validation proof: can an agentic-error-mapreduce.mjs
 * cluster be honestly represented as an AgentActionEventV1 (the
 * Temporal Action Ledger's canonical event shape)?
 *
 * Answers the open item recorded in
 * openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md under
 * `## TABLE-AUDIT-02` — agentic-error-mapreduce.mjs currently never
 * writes into atlas_agent_action_events, even though that table already
 * exists, is well-indexed, and its outcome enum was clearly designed
 * for exactly this (TOOL_ERROR, TEST_FAILED, TYPECHECK_FAILED,
 * MUTATION_REJECTED).
 *
 * This script does NOT call TemporalActionPostgresRepository.append().
 * It only proves the mapping is schema-valid via buildAgentActionEvent()
 * — zero Postgres/Redis/Qdrant/Neo4j writes. Promoting this to a real
 * `--emit-ledger` apply mode is a separate, explicit follow-up gated on
 * review of the mapping decisions this script documents inline.
 *
 * Usage:
 *   node scripts/atlas/prove-agentic-error-temporal-event-mapping.mjs [--window-minutes 15]
 *
 * If no live error_signal_stream rows exist in the window (the common
 * case in this dev environment — see TABLE-AUDIT-02), falls back to one
 * fixture cluster shaped exactly like reducePhase()'s real output, so
 * the mapping can still be proven schema-valid without requiring live
 * data.
 */
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { mapPhase, reducePhase } from './agentic-error-mapreduce.mjs';
import { resolveWorkspaceRevisionCoordinate } from './lib/workspace-revision-authority.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

const { values: args } = parseArgs({
  options: { 'window-minutes': { type: 'string', default: '15' } },
  strict: false,
});

const pkg = await import('../../packages/parent-atlas/dist/index.js');
const { buildAgentActionEvent } = pkg;

const PRODUCER_REVISION = 'agentic-error-mapreduce-temporal-mapping-proof-v1';

function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Mapping decisions (documented here for review, not applied silently):
 *
 * - opcode: AGENTIC_ERROR_CLUSTER_CLASSIFY — this action is "classify an
 *   error cluster", not "fix the error". A future FIX action would be a
 *   separate opcode/event once ACE dispatch actually applies a patch.
 * - target.resource: the cluster key (error_class:model_name:task_id) —
 *   there is no single canonical_id for a cluster (it aggregates many
 *   packet_keys), so `resource` is used per actionTargetSchema's
 *   canonical_id-or-resource requirement.
 * - query_class: the raw `error_class` column — the pre-classification
 *   grouping key, distinct from `state` (the HMM-classified output).
 * - input_hash: sha256 of the sorted fingerprint set — deterministic
 *   for the same underlying error signals, changes if new signals join
 *   the cluster.
 * - implementation_revision / parameter_revision: static revision
 *   strings for the classifier code + its EMISSION/PRIOR tables, since
 *   this pipeline doesn't track git revisions per run. These would need
 *   to become real revisions (e.g. git SHA of this file) before this
 *   mapping is trustworthy for reuse/replay decisions.
 * - workspace/source/graph revision authority: UNPROVEN, not
 *   NOT_APPLICABLE — these dimensions plausibly DO matter (if source
 *   changes, is the error still valid?) but this pipeline doesn't track
 *   them yet, so claiming NOT_APPLICABLE would be dishonest.
 *   relevant_dimensions: [] means none participate in execution_key
 *   yet — this is the most significant gap for real ledger reuse
 *   semantics (EXACT_SUCCESS_REUSE etc. depend on revision authority
 *   being PROVEN).
 * - outcome: this action's job is classification, not repair, so
 *   outcome reflects whether classification produced a usable result:
 *   SUCCESS_EXACT if state != 'unknown' and confidence >= 0.5,
 *   SUCCESS_PARTIAL if state != 'unknown' and confidence < 0.5,
 *   NO_RESULT if state === 'unknown'.
 * - result_ref: recovery_packet_key if selected, else the cluster key
 *   itself (a real result_ref for a classification action, not a
 *   fabricated success marker).
 */
function clusterToAgentActionEvent(cluster, observedAtIso, workspaceRevisionCoordinate) {
  const opcode = 'AGENTIC_ERROR_CLUSTER_CLASSIFY';
  const fingerprintsSorted = [...cluster.fingerprints].sort();
  const inputHash = sha256Hex(fingerprintsSorted.join(','));
  const workflowId = `workflow:agentic-error-mapreduce:${cluster.task_id ?? 'no-task'}`;
  const actionId = `action:classify:${cluster.key}`;
  const eventId = `event:${sha256Hex(`${workflowId}\0${actionId}\0${observedAtIso}`)}`;

  const outcome = cluster.state === 'unknown'
    ? 'NO_RESULT'
    : cluster.confidence >= 0.5
      ? 'SUCCESS_EXACT'
      : 'SUCCESS_PARTIAL';
  const resultRef = outcome === 'NO_RESULT' ? null : (cluster.recovery_packet_key ?? cluster.key);

  const input = {
    event_id: eventId,
    ledger_sequence: 1, // fixture only — a real write must call reserveLedgerSequence()
    workflow_action: {
      workflow_id: workflowId,
      workflow_revision: 0,
      action_id: actionId,
      sequence: 0,
    },
    descriptor: {
      opcode,
      query_class: cluster.error_class,
      target: {
        canonical_id: null,
        resource: cluster.key,
        target_class: 'ERROR_CLUSTER',
      },
      input_hash: inputHash,
      implementation_revision: 'agentic-error-mapreduce-v1',
      parameter_revision: 'hmm-emission-prior-v1',
      context_manifest_hash: null,
      applicability: {
        observed_at: observedAtIso,
        // workspace_revision: real, resolved via resolveWorkspaceRevisionCoordinate()
        // (Option A chosen in TABLE-AUDIT-02: read the existing periodic
        // workspace-source-binding observation snapshot, honestly UNPROVEN
        // when stale rather than always claiming PROVEN).
        workspace_revision: workspaceRevisionCoordinate.coordinate,
        // source_revision/graph_revision remain UNPROVEN — Option A's
        // per-file source bindings and any graph-revision concept are out
        // of scope for this proof; only workspace-level identity is wired.
        source_revision: { value: null, authority: 'UNPROVEN', evidence_refs: [] },
        graph_revision: { value: null, authority: 'UNPROVEN', evidence_refs: [] },
        relevant_dimensions: workspaceRevisionCoordinate.coordinate.authority === 'PROVEN' ? ['workspace'] : [],
        evidence_frontier_hash: null,
      },
    },
    state: 'FINALIZED',
    outcome,
    result_ref: resultRef,
    error_code: outcome === 'NO_RESULT' ? 'AGENTIC_ERROR_CLASSIFICATION_NO_RESULT' : null,
    evidence_refs: cluster.packet_keys.slice(0, 20),
    artifact_refs: [],
    cost: { latency_ms: null, gpu_bytes: null, tokens: null, tool_calls: null },
    observed_at: observedAtIso,
    producer_revision: PRODUCER_REVISION,
  };

  return buildAgentActionEvent(input);
}

async function main() {
  const windowMinutes = parseInt(args['window-minutes'] ?? '15', 10);
  let clusters = [];
  let source = 'live';
  try {
    const mapped = await mapPhase();
    clusters = reducePhase(mapped);
  } catch (err) {
    console.warn(`[proof] mapPhase/reducePhase failed (${err.message}) — falling back to fixture cluster`);
  }

  if (!clusters.length) {
    source = 'fixture';
    clusters = [{
      key: 'schema_mismatch:hforf.gguf:fixture-task-1',
      error_class: 'schema_mismatch',
      model_name: 'hforf.gguf',
      task_id: 'fixture-task-1',
      packet_keys: ['packet:fixture0001'],
      feature_ids: ['fixture.feature'],
      fingerprints: ['fixture-fp-1'],
      top_route: '/api/fixture',
      state: 'schema_mismatch',
      confidence: 0.82,
      suggested_action: 'Run drizzle-kit introspect and verify migration was applied',
      latest_seen: new Date().toISOString(),
      count: 3,
    }];
  }

  const workspaceRevisionCoordinate = resolveWorkspaceRevisionCoordinate({ repoRoot: REPO_ROOT });

  const observedAtIso = new Date().toISOString();
  const results = [];
  for (const cluster of clusters) {
    try {
      const event = clusterToAgentActionEvent(cluster, observedAtIso, workspaceRevisionCoordinate);
      results.push({ cluster_key: cluster.key, status: 'SCHEMA_VALID', opcode: event.descriptor.opcode, outcome: event.outcome, execution_key: event.execution_key, event_id: event.event_id, workspace_revision_authority: event.descriptor.applicability.workspace_revision.authority });
    } catch (err) {
      results.push({ cluster_key: cluster.key, status: 'SCHEMA_INVALID', error: err.message });
    }
  }

  const report = {
    schema: 'atlas.agentic-error-temporal-event-mapping-proof.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    workspaceRevisionResolution: { authority: workspaceRevisionCoordinate.coordinate.authority, reason: workspaceRevisionCoordinate.reason, ageMs: workspaceRevisionCoordinate.ageMs },
    databaseWrites: false,
    ledgerAppendCalled: false,
    windowMinutes,
    clusterSource: source,
    clusterCount: clusters.length,
    results,
    allValid: results.every((r) => r.status === 'SCHEMA_VALID'),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.allValid) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[proof] fatal:', err);
  process.exitCode = 1;
});
