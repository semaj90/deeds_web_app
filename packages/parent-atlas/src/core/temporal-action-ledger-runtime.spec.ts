import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAgentActionEvent, temporalActionChecksum } from './temporal-action-ledger.js';
import {
  appendTemporalActionEvent,
  lookupCurrentActionByExecutionKey,
  readTemporalActionEvents,
  rebuildTemporalActionCurrentIndex,
  resolveTemporalActionLedgerPaths,
} from './temporal-action-ledger-runtime.js';

const roots: string[] = [];
const H = temporalActionChecksum;

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-action-ledger-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function event(sequence: number, outcome: 'SUCCESS_EXACT' | 'NO_RESULT', resultRef: string | null) {
  const observedAt = `2026-08-21T10:00:0${sequence}.000Z`;
  return buildAgentActionEvent({
    event_id: `evt:${sequence}`,
    ledger_sequence: sequence,
    workflow_action: { workflow_id: 'wf:1', workflow_revision: 1, action_id: 'A53', sequence: 1 },
    descriptor: {
      schema: 'atlas.action-execution-descriptor.v1',
      opcode: 'RG_SEARCH',
      query_class: 'EXACT_SYMBOL',
      target: { canonical_id: 'symbol:foo', resource: null, target_class: 'symbol' },
      input_hash: H('same-input'),
      implementation_revision: 'rg:v1',
      parameter_revision: 'params:v1',
      context_manifest_hash: null,
      applicability: {
        schema: 'atlas.temporal-applicability.v1',
        observed_at: observedAt,
        valid_time: { from: null, to: null },
        workspace_revision: { value: 'W1', authority: 'PROVEN', evidence_refs: ['e:w1'] },
        source_revision: { value: 'S1', authority: 'PROVEN', evidence_refs: ['e:s1'] },
        graph_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
        relevant_dimensions: ['workspace', 'source'],
        evidence_frontier_hash: H('frontier'),
      },
    },
    state: 'FINALIZED',
    outcome,
    result_ref: resultRef,
    error_code: outcome === 'NO_RESULT' ? 'NOT_FOUND' : null,
    evidence_refs: [],
    artifact_refs: resultRef ? [resultRef] : [],
    cost: { latency_ms: sequence, gpu_bytes: null, tokens: 0, tool_calls: 1 },
    observed_at: observedAt,
    producer_revision: 'test:v1',
  });
}

describe('temporal action ledger runtime', () => {
  it('appends immutable JSONL, rebuilds current projection, and looks up by execution key', async () => {
    const rootDir = await tempRoot();
    const options = { rootDir, workspaceId: 'deeds-web-app', ledgerRevision: 'ledger:v1', producerRevision: 'runtime:v1' };
    const first = event(1, 'NO_RESULT', null);
    const second = event(2, 'SUCCESS_EXACT', 'cas:result:2');

    await appendTemporalActionEvent(options, first);
    await appendTemporalActionEvent(options, second);

    const stored = await readTemporalActionEvents(resolveTemporalActionLedgerPaths(rootDir).eventsJsonl);
    expect(stored.map((row) => row.event_id)).toEqual(['evt:1', 'evt:2']);

    const index = await rebuildTemporalActionCurrentIndex(options);
    expect(index.event_count).toBe(2);
    expect(index.execution_key_count).toBe(1);
    expect(index.rows).toHaveLength(1);
    expect(index.rows[0]?.latest_outcome).toBe('SUCCESS_EXACT');
    expect(index.rows[0]?.last_failure_event_id).toBe('evt:1');
    expect(index.rows[0]?.last_success_event_id).toBe('evt:2');

    const hit = await lookupCurrentActionByExecutionKey(rootDir, second.execution_key);
    expect(hit?.latest_result_ref).toBe('cas:result:2');

    const manifest = JSON.parse(await readFile(resolveTemporalActionLedgerPaths(rootDir).manifestJson, 'utf8'));
    expect(manifest.canonical_event_owner).toBe('WORKFLOW_RUNTIME');
    expect(manifest.projection_authority).toBe('DERIVED');
    expect(manifest.action_latest_arrow_ref).toBeNull();
  });

  it('rejects non-append-only ledger sequence reuse', async () => {
    const rootDir = await tempRoot();
    const options = { rootDir, workspaceId: 'deeds-web-app', ledgerRevision: 'ledger:v1', producerRevision: 'runtime:v1' };
    await appendTemporalActionEvent(options, event(2, 'SUCCESS_EXACT', 'cas:2'));
    await expect(appendTemporalActionEvent(options, event(1, 'NO_RESULT', null)))
      .rejects.toThrow('ACTION_LEDGER_SEQUENCE_NOT_APPEND_ONLY');
  });

  it('detects mutated JSONL events by checksum during rebuild/read', async () => {
    const rootDir = await tempRoot();
    const options = { rootDir, workspaceId: 'deeds-web-app', ledgerRevision: 'ledger:v1', producerRevision: 'runtime:v1' };
    const original = event(1, 'SUCCESS_EXACT', 'cas:1');
    await appendTemporalActionEvent(options, original);
    const paths = resolveTemporalActionLedgerPaths(rootDir);
    const text = await readFile(paths.eventsJsonl, 'utf8');
    const mutated = text.replace('cas:1', 'cas:tampered');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(paths.eventsJsonl, mutated, 'utf8');

    await expect(readTemporalActionEvents(paths.eventsJsonl)).rejects.toThrow('ACTION_EVENT_CHECKSUM_MISMATCH');
  });
});
