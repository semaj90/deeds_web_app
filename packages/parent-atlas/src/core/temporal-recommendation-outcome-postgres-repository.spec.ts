import { describe, expect, it } from 'vitest';

import { temporalActionChecksum } from './temporal-action-ledger.js';
import { buildFinalRecommendationOutcomeReceipt } from './temporal-recommendation-outcome-runtime.js';
import { createRecommendationOutcomePostgresRepository } from './temporal-recommendation-outcome-postgres-repository.js';

const K1 = 'a'.repeat(64);

function receipt() {
  return buildFinalRecommendationOutcomeReceipt({
    recommendation: {
      schema: 'atlas.next-action-recommendation.v1',
      recommendation_id: 'rec:test',
      workflow_id: 'wf:1',
      workflow_revision: 1,
      policy_family: 'DETERMINISTIC_FULL_SCAN',
      tang_claim: null,
      feature_revision: 'features:v1',
      candidates: [
        { candidate_action_id: 'candidate:rg', rank: 1, score: 0.9, execution_key: K1, evidence_refs: [] },
      ],
      created_at: '2026-08-21T20:00:00.000Z',
      producer_revision: 'recommend:v1',
    },
    selected_action_id: 'candidate:rg',
    resulting_execution_key: K1,
    downstream_success: true,
    observed_at: '2026-08-21T20:01:00.000Z',
    producer_revision: 'outcome:v1',
  });
}

describe('recommendation outcome postgres repository', () => {
  it('appends then checksum-verifies immutable readback', async () => {
    const value = receipt();
    const receiptChecksum = temporalActionChecksum(value);
    const calls: string[] = [];
    const db = {
      async query(text: string) {
        calls.push(text);
        if (text.includes('INSERT INTO atlas_recommendation_outcome_receipts')) {
          return { rowCount: 1, rows: [{ receipt_checksum: receiptChecksum }] };
        }
        return { rowCount: 1, rows: [{ receipt_checksum: receiptChecksum, receipt_json: value }] };
      },
    } as any;

    const result = await createRecommendationOutcomePostgresRepository(db).append(value, 'repo-test:v1');
    expect(result.inserted).toBe(true);
    expect(result.receipt_checksum).toBe(receiptChecksum);
    expect(result.readback_checksum).toBe(receiptChecksum);
    expect(calls).toHaveLength(2);
  });

  it('accepts an identical duplicate only after matching readback', async () => {
    const value = receipt();
    const receiptChecksum = temporalActionChecksum(value);
    const db = {
      async query(text: string) {
        if (text.includes('INSERT INTO atlas_recommendation_outcome_receipts')) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [{ receipt_checksum: receiptChecksum, receipt_json: value }] };
      },
    } as any;

    const result = await createRecommendationOutcomePostgresRepository(db).append(value, 'repo-test:v1');
    expect(result.inserted).toBe(false);
  });

  it('rejects tampered receipt JSON on readback', async () => {
    const value = receipt();
    const receiptChecksum = temporalActionChecksum(value);
    const tampered = { ...value, downstream_success: false };
    const db = {
      async query(text: string) {
        if (text.includes('INSERT INTO atlas_recommendation_outcome_receipts')) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [{ receipt_checksum: receiptChecksum, receipt_json: tampered }] };
      },
    } as any;

    await expect(
      createRecommendationOutcomePostgresRepository(db).append(value, 'repo-test:v1'),
    ).rejects.toThrow('RECOMMENDATION_OUTCOME_CHECKSUM_READBACK_MISMATCH');
  });

  it('lists checksum-verified receipts for one recommendation', async () => {
    const value = receipt();
    const receiptChecksum = temporalActionChecksum(value);
    const db = {
      async query(text: string) {
        expect(text).toContain('WHERE recommendation_id = $1');
        return { rowCount: 1, rows: [{ receipt_checksum: receiptChecksum, receipt_json: value }] };
      },
    } as any;

    const values = await createRecommendationOutcomePostgresRepository(db).listByRecommendationId('rec:test');
    expect(values).toEqual([value]);
  });
});
