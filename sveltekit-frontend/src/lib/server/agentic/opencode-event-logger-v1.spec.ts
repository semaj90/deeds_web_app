import { describe, expect, it, vi } from 'vitest';
import { recordOpenCodeAgenticEventV1 } from './opencode-event-logger-v1.js';
import { db, pool } from '$lib/server/db/client.js';

describe('opencode-event-logger-v1 contract', () => {
  it('formats payload, generates deterministic checksum, and records to agent_os_events and atlas_agent_action_events (mocked)', async () => {
    const mockDbInsert = vi.spyOn(db, 'insert').mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1042 }]),
      }),
    } as never);

    const mockPoolQuery = vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ event_id: 'evt:mock-test' }],
    } as never);

    const receipt = await recordOpenCodeAgenticEventV1({
      likely_cause: 'PostgreSQL 18 DB-ALIGN-01 contract reconciliation complete.',
      evidence: ['parent_atlas_db_contract_readonly.sql', 'schema-postgres.ts'],
      patch_targets: ['src/routes/(app)/evidence/+page.server.ts'],
      safe_next_command: 'npm run test:lane-contracts',
      smoke_command: 'npm run test:lane-contracts -- src/lib/server/evidence/',
      report_path: 'docs/reports/audit.md',
    });

    expect(receipt.agentOsEventId).toBe(1042);
    expect(receipt.ledgerEventId).toMatch(/^evt:/);
    expect(receipt.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockPoolQuery).toHaveBeenCalled();

    mockDbInsert.mockRestore();
    mockPoolQuery.mockRestore();
  });

  it('performs live PostgreSQL 18 insert and readback into agent_os_events and atlas_agent_action_events', async () => {
    const receipt = await recordOpenCodeAgenticEventV1({
      likely_cause: 'Live integration verification for OpenCode agentic ledger event.',
      evidence: ['parent_atlas_db_contract_readonly.sql'],
      patch_targets: ['src/lib/server/agentic/opencode-event-logger-v1.ts'],
      safe_next_command: 'npm run test:lane-contracts',
      smoke_command: 'npm run test:lane-contracts -- src/lib/server/agentic/',
      severity: 'info',
    });

    expect(receipt.agentOsEventId).toBeGreaterThan(0);
    expect(receipt.ledgerEventId).toMatch(/^evt:/);

    // Readback from agent_os_events
    const osRow = await pool.query(
      `SELECT id, event_type, source, severity FROM agent_os_events WHERE id = $1`,
      [receipt.agentOsEventId]
    );
    expect(osRow.rows).toHaveLength(1);
    expect(osRow.rows[0].event_type).toBe('opencode_skill_execution');

    // Readback from atlas_agent_action_events
    const ledgerRow = await pool.query(
      `SELECT event_id, opcode, state, outcome FROM atlas_agent_action_events WHERE event_id = $1`,
      [receipt.ledgerEventId]
    );
    expect(ledgerRow.rows).toHaveLength(1);
    expect(ledgerRow.rows[0].opcode).toBe('OPENCODE_SKILL_EXECUTION');
    expect(ledgerRow.rows[0].state).toBe('FINALIZED');
  });
});
