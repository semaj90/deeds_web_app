import { describe, expect, it } from 'vitest';

import { buildAgentActionEvent } from './temporal-action-ledger.js';
import { createTemporalActionPostgresRepository } from './temporal-action-postgres-repository.js';

const HASH = 'a'.repeat(64);

function makeEvent(sequence = 1) {
  return buildAgentActionEvent({
    event_id: `workflow:w1:1:${sequence}`,
    ledger_sequence: sequence,
    workflow_action: {
      workflow_id: 'w1',
      workflow_revision: 1,
      action_id: 'a1',
      sequence,
    },
    descriptor: {
      opcode: 'RG_SEARCH',
      query_class: 'exact_symbol',
      target: {
        canonical_id: 'symbol:one',
        resource: 'src/lib/one.ts',
        target_class: 'typescript_symbol',
      },
      input_hash: HASH,
      implementation_revision: 'rg-search-v1',
      parameter_revision: 'params-v1',
      context_manifest_hash: null,
      applicability: {
        observed_at: `2026-08-21T18:00:0${sequence}.000Z`,
        valid_time: { from: null, to: null },
        workspace_revision: { value: 'workspace:123', authority: 'PROVEN', evidence_refs: [] },
        source_revision: { value: 'source:456', authority: 'PROVEN', evidence_refs: [] },
        graph_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
        relevant_dimensions: ['workspace', 'source'],
        evidence_frontier_hash: null,
      },
    },
    state: 'FINALIZED',
    outcome: 'SUCCESS_EXACT',
    result_ref: 'artifact:result-1',
    error_code: null,
    evidence_refs: ['evidence:1'],
    artifact_refs: ['artifact:result-1'],
    cost: { latency_ms: 12, gpu_bytes: null, tokens: 0, tool_calls: 1 },
    observed_at: `2026-08-21T18:00:0${sequence}.000Z`,
    producer_revision: 'temporal-test-v1',
  });
}

describe('temporal action postgres repository', () => {
  it('appends then checksum-verifies immutable readback', async () => {
    const event = makeEvent();
    const calls: Array<{ text: string; values?: any[] }> = [];
    const db = {
      async query(text: string, values?: any[]) {
        calls.push({ text, values });
        if (text.includes('INSERT INTO atlas_agent_action_events')) {
          return { rowCount: 1, rows: [{ event_id: event.event_id }] };
        }
        return {
          rowCount: 1,
          rows: [{ event_id: event.event_id, event_checksum: event.event_checksum, event_json: event }],
        };
      },
    } as any;

    const repository = createTemporalActionPostgresRepository(db);
    const receipt = await repository.append(event, 'postgres-repository-test-v1');

    expect(receipt.inserted).toBe(true);
    expect(receipt.event_checksum).toBe(event.event_checksum);
    expect(receipt.readback_checksum).toBe(event.event_checksum);
    expect(calls).toHaveLength(2);
  });

  it('accepts idempotent duplicate event only after matching readback', async () => {
    const event = makeEvent();
    const db = {
      async query(text: string) {
        if (text.includes('INSERT INTO atlas_agent_action_events')) {
          return { rowCount: 0, rows: [] };
        }
        return {
          rowCount: 1,
          rows: [{ event_id: event.event_id, event_checksum: event.event_checksum, event_json: event }],
        };
      },
    } as any;

    const receipt = await createTemporalActionPostgresRepository(db).append(
      event,
      'postgres-repository-test-v1',
    );
    expect(receipt.inserted).toBe(false);
    expect(receipt.readback_checksum).toBe(event.event_checksum);
  });

  it('rejects tampered event JSON even when the checksum column looks valid', async () => {
    const event = makeEvent();
    const tampered = {
      ...event,
      descriptor: {
        ...event.descriptor,
        opcode: 'QDRANT_SEARCH',
      },
    };
    const db = {
      async query(text: string) {
        if (text.includes('INSERT INTO atlas_agent_action_events')) {
          return { rowCount: 0, rows: [] };
        }
        return {
          rowCount: 1,
          rows: [{ event_id: event.event_id, event_checksum: event.event_checksum, event_json: tampered }],
        };
      },
    } as any;

    await expect(
      createTemporalActionPostgresRepository(db).append(event, 'postgres-repository-test-v1'),
    ).rejects.toThrow('TEMPORAL_EVENT_CHECKSUM_READBACK_MISMATCH');
  });

  it('rebuilds current projection by execution key instead of storing a second truth', async () => {
    const event = makeEvent();
    const db = {
      async query() {
        return {
          rowCount: 1,
          rows: [{ event_id: event.event_id, event_checksum: event.event_checksum, event_json: event }],
        };
      },
    } as any;

    const { current, receipt } = await createTemporalActionPostgresRepository(db)
      .currentByExecutionKey(event.execution_key, 'postgres-repository-test-v1');

    expect(current?.latest_event_id).toBe(event.event_id);
    expect(current?.latest_outcome).toBe('SUCCESS_EXACT');
    expect(receipt.event_count).toBe(1);
    expect(receipt.projection_checksum).toBe(current?.projection_checksum);
  });
});
