import { describe, expect, it } from 'vitest';
import { buildTs2345RepairLoopFixtureV1 } from './repair-loop-fixture-v1.js';

describe('repair loop fixture v1', () => {
  it('builds the bounded TS2345 read-only sequence', () => {
    const fixture = buildTs2345RepairLoopFixtureV1();
    expect(fixture.errorCode).toBe('TS2345');
    expect(fixture.steps.map((step) => step.actionId)).toEqual([
      'RG_EXACT_SEARCH', 'OAK_RESOLVE', 'RUN_TYPECHECK', 'STOP_SUCCESS',
    ]);
    expect(fixture.steps.every((step) => step.mutability === 'READ_ONLY')).toBe(true);
    expect(fixture.repairApplied).toBe(false);
    expect(fixture.writesPerformed).toBe(false);
  });

  it('does not claim a live repair or canonical authority', () => {
    const fixture = buildTs2345RepairLoopFixtureV1();
    expect(fixture.status).toBe('FIXTURE_ONLY');
    expect(fixture.canonicalAuthority).toBe(false);
    expect(fixture.maxSteps).toBe(4);
  });
});
