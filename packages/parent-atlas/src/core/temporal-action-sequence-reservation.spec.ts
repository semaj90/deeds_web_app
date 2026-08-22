import { describe, expect, it } from 'vitest';

import { reserveTemporalActionLedgerSequence } from './temporal-action-sequence-reservation.js';

describe('temporal action sequence reservation', () => {
  it('reserves storage-owned append order without claiming identity authority', async () => {
    const db = {
      async query(text: string) {
        expect(text).toContain("nextval('atlas_agent_action_ledger_sequence_seq')");
        return { rowCount: 1, rows: [{ ledger_sequence: '42' }] };
      },
    } as any;

    await expect(
      reserveTemporalActionLedgerSequence(db, 'sequence-test-v1'),
    ).resolves.toMatchObject({
      ledger_sequence: 42,
      allocator: 'atlas_agent_action_ledger_sequence_seq',
      identity_authority: false,
      producer_revision: 'sequence-test-v1',
    });
  });

  it.each([
    [{ rowCount: 0, rows: [] }, 'TEMPORAL_LEDGER_SEQUENCE_RESERVATION_MISSING'],
    [{ rowCount: 1, rows: [{ ledger_sequence: '0' }] }, 'TEMPORAL_LEDGER_SEQUENCE_RESERVATION_INVALID'],
    [{ rowCount: 1, rows: [{ ledger_sequence: 'not-a-number' }] }, 'TEMPORAL_LEDGER_SEQUENCE_RESERVATION_INVALID'],
    [{ rowCount: 1, rows: [{ ledger_sequence: String(Number.MAX_SAFE_INTEGER + 1) }] }, 'TEMPORAL_LEDGER_SEQUENCE_RESERVATION_INVALID'],
  ])('fails closed on invalid sequence reservation %#', async (response, error) => {
    const db = { async query() { return response; } } as any;
    await expect(
      reserveTemporalActionLedgerSequence(db, 'sequence-test-v1'),
    ).rejects.toThrow(error);
  });
});
