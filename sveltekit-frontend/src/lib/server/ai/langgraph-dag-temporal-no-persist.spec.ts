// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const proof = vi.hoisted(() => ({
  persistenceCalls: 0,
}));

vi.mock('../cache/valkey-client.js', () => ({
  getValkeyClient: () => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
  }),
}));

vi.mock('./auto-fix.js', () => ({ suggestFix: vi.fn(async () => 'fixture-fix') }));
vi.mock('./ace-builder.js', () => ({
  buildACEPacket: vi.fn(async () => ({ fixture: true })),
  injectACETableCache: vi.fn(async () => undefined),
}));
vi.mock('./learning-loop.js', () => ({
  recordExecutionOutcome: vi.fn(async () => undefined),
  mutatePromptWithLearnings: vi.fn(async (query: string) => query),
}));
vi.mock('../observability/synthesis-logger.js', () => ({
  logSynthesisRun: vi.fn(async () => undefined),
}));
vi.mock('./engram-registry.js', () => ({
  reinforceEngramPath: vi.fn(async () => undefined),
}));

vi.mock('../atlas/temporal/temporal-recommendation-outcome-boundary.js', () => ({
  persistTemporalRecommendationOutcomeFromPostgres: vi.fn(async () => {
    proof.persistenceCalls += 1;
    throw new Error('DAG03_PERSISTENCE_MUST_NOT_BE_CALLED');
  }),
}));

beforeEach(() => {
  proof.persistenceCalls = 0;
});

describe('ACT-REC-OUT-DAG-03 recommendation receipt persistence opt-out', () => {
  it('reaches terminal success without attempting persistence when persist_outcome_receipt=false', async () => {
    const ctx: any = {
      strategy: 'default',
      temporalAlternativePlan: {
        schema: 'atlas.temporal-alternative-plan.v1',
        persist_outcome_receipt: false,
      },
      // The guard requires both plan and selection to exist before inspecting
      // persist_outcome_receipt. A sentinel selection proves the opt-out is the
      // reason persistence is skipped rather than absence of temporal context.
      temporalAlternativeSelection: {
        schema: 'atlas.temporal-alternative-selection.v1',
        selected_execution_key: 'a'.repeat(64),
      },
      temporalAuthoritativeActionOutcome: null,
    };

    const { runAgentDAG } = await import('./langgraph-dag.js');
    const result = await runAgentDAG('plain deterministic fixture', ctx);

    expect(result.success).toBe(true);
    expect(proof.persistenceCalls).toBe(0);
    expect(ctx.temporalRecommendationOutcomePersisted).not.toBe(true);
    expect(ctx.temporalRecommendationOutcome).toBeUndefined();
  });
});
