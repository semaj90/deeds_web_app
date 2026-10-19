import { describe, expect, it } from 'vitest';
import {
  computeReceiptDigest,
  isTrainable,
  verifyReceiptIntegrity,
  type ToolExecutionReceiptV1,
} from './atlas-tool-execution-receipt-v1.js';
import {
  FLOATS_PER_TILE,
  packCandidateTiles,
  tileCellOffset,
} from './atlas-feature-matrix-4x6-v1.js';

describe('ToolExecutionReceiptV1 & Training Admission Policy', () => {
  const dummySha = 'sha256:' + 'a'.repeat(64);
  const now = new Date().toISOString();

  const validReceipt: ToolExecutionReceiptV1 = {
    schema: 'atlas.tool-execution-receipt.v1',
    executionId: 'exec_vitest_001',
    requestId: 'req_001',
    taskId: 'task_001',
    stageId: 'stage_test',
    tool: {
      name: 'vitest',
      version: '3.2.7',
      binaryDigest: dummySha,
    },
    input: {
      workspaceRevision: dummySha,
      sourceRevision: dummySha,
      inputDigest: dummySha,
    },
    execution: {
      startedAt: now,
      finishedAt: now,
      exitCode: 0,
      timedOut: false,
      outputDigest: dummySha,
      eventRefs: ['evt_test_1', 'evt_test_2'],
    },
    verification: {
      status: 'VERIFIED_PASS',
      verifierId: 'verifier:atlas_gate',
      assertionRefs: ['assert_exit_zero', 'assert_tests_passed'],
      verifiedAt: now,
    },
  };

  it('admits authentic VERIFIED_PASS outcomes for adaptive training', () => {
    expect(isTrainable(validReceipt)).toBe(true);
    const integrity = verifyReceiptIntegrity(validReceipt);
    expect(integrity.qualified).toBe(true);
  });

  it('admits authentic VERIFIED_FAIL outcomes as valid learning signals', () => {
    const failReceipt: ToolExecutionReceiptV1 = {
      ...validReceipt,
      execution: {
        ...validReceipt.execution,
        exitCode: 1,
      },
      verification: {
        ...validReceipt.verification,
        status: 'VERIFIED_FAIL',
      },
    };

    expect(isTrainable(failReceipt)).toBe(true);
    expect(verifyReceiptIntegrity(failReceipt).qualified).toBe(true);
  });

  it('strictly excludes FABRICATED, UNVERIFIED, or CONFIG_VALIDATED outcomes from training', () => {
    const fabricated: ToolExecutionReceiptV1 = {
      ...validReceipt,
      verification: {
        ...validReceipt.verification,
        status: 'FABRICATED',
      },
    };
    expect(isTrainable(fabricated)).toBe(false);
    expect(verifyReceiptIntegrity(fabricated).qualified).toBe(false);

    const unverified: ToolExecutionReceiptV1 = {
      ...validReceipt,
      verification: {
        ...validReceipt.verification,
        status: 'EXECUTED_UNVERIFIED',
      },
    };
    expect(isTrainable(unverified)).toBe(false);

    const configOnly: ToolExecutionReceiptV1 = {
      ...validReceipt,
      verification: {
        ...validReceipt.verification,
        status: 'CONFIG_VALIDATED',
      },
    };
    expect(isTrainable(configOnly)).toBe(false);
  });

  it('computes deterministic cryptographic receipt digests', () => {
    const digest1 = computeReceiptDigest(validReceipt);
    const digest2 = computeReceiptDigest(validReceipt);
    expect(digest1).toBe(digest2);
    expect(digest1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

// DECISION 4X6-TILE-01 (2026-10-18): a tile is 4 candidates x 6 features. The previous block here tested
// "4 investigation states of one candidate" and an independent advisory scorer; both were rejected.
// Full adapter/GEMM coverage lives in atlas-rank-input-adapter-v1.spec.ts.
describe('4x6 candidate tile layout', () => {
  it('packs four distinct candidates into one 24-float tile, one candidate per row', () => {
    const rows = [10, 20, 30, 40].map((candidateOrdinal, i) => ({
      candidateOrdinal,
      values: [0.1 * (i + 1), 0.2, 0.3, 0.4, 0.5, 0.6],
      present: [1, 1, 1, 1, 1, 1] as (0 | 1)[],
    }));
    const tiles = packCandidateTiles(rows);
    expect(tiles.tileCount).toBe(1);
    expect(tiles.features).toHaveLength(FLOATS_PER_TILE);
    expect(tiles.candidateOrdinals).toEqual([10, 20, 30, 40]);
    expect(Array.from(tiles.validRows)).toEqual([1, 1, 1, 1]);
    expect(tiles.features[tileCellOffset(0, 1, 0)]).toBeCloseTo(0.2); // candidate 20, channel 0
    expect(tiles.features[tileCellOffset(0, 3, 5)]).toBeCloseTo(0.6); // candidate 40, channel 5
  });
});
