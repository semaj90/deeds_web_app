import { describe, expect, it } from 'vitest';

import { createTemporalActionPostgresRepository } from './temporal-action-postgres-repository.js';

describe('temporal action ledger sequence reservation', () => {
  it('uses the Postgres sequence as append-log ordering only', async () => {
    const calls: Array<{ text: string; values?: any[] }> = [];
    const db = {
      async query(text: string, values?: any[]) {
        calls.push({ text, values });
        return { rowCount: 1, rows: [{ ledger_sequence: '42' }] };
      },
    } as any;

    const receipt = await createTemporalActionPostgresRepository(db)
      .reserveLedgerSequence('temporal-recorder-v1');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("nextval('atlas_agent_action_ledger_sequence_seq')");
    expect(receipt).toEqual({
      schema: 'atlas.temporal-action-sequence-reservation-receipt.v1',
      ledger_sequence: 42,
      allocator: 'atlas_agent_action_ledger_sequence_seq',
      identity_authority: false,
      producer_revision: 'temporal-recorder-v1',
    });
  });

  it('rejects missing reservation rows', async () => {
    const db = {
      async query() {
        return { rowCount: 0, rows: [] };
      },
    } as any;

    await expect(createTemporalActionPostgresRepository(db)
      .reserveLedgerSequence('temporal-recorder-v1'))
      .rejects.toThrow('TEMPORAL_LEDGER_SEQUENCE_RESERVATION_FAILED');
  });

  it('rejects unsafe or non-positive sequence values', async () => {
    for (const ledgerSequence of ['0', '-1', '9007199254740993', 'not-a-number']) {
      const db = {
        async query() {
          return { rowCount: 1, rows: [{ ledger_sequence: ledgerSequence }] };
        },
      } as any;

      await expect(createTemporalActionPostgresRepository(db)
        .reserveLedgerSequence('temporal-recorder-v1'))
        .rejects.toThrow('TEMPORAL_LEDGER_SEQUENCE_INVALID');
    }
  });
});
