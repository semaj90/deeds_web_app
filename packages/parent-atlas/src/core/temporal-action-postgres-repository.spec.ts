import { describe, expect, it } from 'vitest';

import { buildAgentActionEvent } from './temporal-action-ledger.js';
import { createTemporalActionPostgresRepository } from './temporal-action-postgres-repository.js';

const HASH = 'a'.repeat(64);

function makeEvent(sequence = 1, overrides: { state?: 'FINALIZED' | 'STARTED'; workflowId?: string } = {}) {
  const finalized = overrides.state !== 'STARTED';
  return buildAgentActionEvent({
    event_id: `workflow:${overrides.workflowId ?? 'w1'}:1:${sequence}`,
    ledger_sequence: sequence,
    workflow_action: {
      workflow_id: overrides.workflowId ?? 'w1',
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
        observed_at: `2026-08-21T18:00:${String(sequence).padStart(2, '0')}.000Z`,
        valid_time: { from: null, to: null },
        workspace_revision: { value: 'workspace:123', authority: 'PROVEN', evidence_refs: [] },
        source_revision: { value: 'source:456', authority: 'PROVEN', evidence_refs: [] },
        graph_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
        relevant_dimensions: ['workspace', 'source'],
        evidence_frontier_hash: null,
      },
    },
    state: finalized ? 'FINALIZED' : 'STARTED',
    outcome: finalized ? 'SUCCESS_EXACT' : null,
    result_ref: finalized ? `artifact:result-${sequence}` : null,
    error_code: null,
    evidence_refs: [`evidence:${sequence}`],
    artifact_refs: finalized ? [`artifact:result-${sequence}`] : [],
    cost: { latency_ms: 12, gpu_bytes: null, tokens: 0, tool_calls: 1 },
    observed_at: `2026-08-21T18:00:${String(sequence).padStart(2, '0')}.000Z`,
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

  it('reads bounded finalized history and normalizes newest-first SQL rows into deterministic ledger order', async () => {
    const e1 = makeEvent(1);
    const e2 = makeEvent(2);
    const e3 = makeEvent(3);
    const calls: Array<{ text: string; values?: any[] }> = [];
    const db = {
      async query(text: string, values?: any[]) {
        calls.push({ text, values });
        return {
          rowCount: 3,
          rows: [e3, e2, e1].map((event) => ({
            event_id: event.event_id,
            event_checksum: event.event_checksum,
            event_json: event,
          })),
        };
      },
    } as any;

    const { events, receipt } = await createTemporalActionPostgresRepository(db).listRecentFinalized({
      limit: 3,
      producer_revision: 'history-test-v1',
    });

    expect(calls[0]?.text).toContain("WHERE state = 'FINALIZED'");
    expect(calls[0]?.text).toContain('LIMIT $1');
    expect(calls[0]?.values).toEqual([3]);
    expect(events.map((event) => event.ledger_sequence)).toEqual([1, 2, 3]);
    expect(receipt).toMatchObject({
      event_count: 3,
      limit: 3,
      workflow_id: null,
      oldest_ledger_sequence: 1,
      newest_ledger_sequence: 3,
    });
  });

  it('uses the indexed workflow filter when recommendation history is workflow-scoped', async () => {
    const event = makeEvent(4, { workflowId: 'wf:scoped' });
    const calls: Array<{ text: string; values?: any[] }> = [];
    const db = {
      async query(text: string, values?: any[]) {
        calls.push({ text, values });
        return {
          rowCount: 1,
          rows: [{ event_id: event.event_id, event_checksum: event.event_checksum, event_json: event }],
        };
      },
    } as any;

    const { receipt } = await createTemporalActionPostgresRepository(db).listRecentFinalized({
      workflow_id: 'wf:scoped',
      limit: 64,
      producer_revision: 'history-test-v1',
    });

    expect(calls[0]?.text).toContain('AND workflow_id = $1');
    expect(calls[0]?.values).toEqual(['wf:scoped', 64]);
    expect(receipt.workflow_id).toBe('wf:scoped');
  });

  it('rejects non-finalized rows from the history read even if the storage query returned them', async () => {
    const started = makeEvent(5, { state: 'STARTED' });
    const db = {
      async query() {
        return {
          rowCount: 1,
          rows: [{ event_id: started.event_id, event_checksum: started.event_checksum, event_json: started }],
        };
      },
    } as any;

    await expect(createTemporalActionPostgresRepository(db).listRecentFinalized({
      producer_revision: 'history-test-v1',
    })).rejects.toThrow('TEMPORAL_HISTORY_NON_FINALIZED_READBACK');
  });
});
