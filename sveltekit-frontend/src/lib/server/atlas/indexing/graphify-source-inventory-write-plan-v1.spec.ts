import { describe, expect, it } from 'vitest';
import { buildGraphifySourceInventoryWritePlan } from './graphify-source-inventory-write-plan-v1.js';

describe('GraphifySourceInventoryWritePlanV1', () => {
  it('keeps content-hash authority separate from legacy Git source revision', () => {
    const plan = buildGraphifySourceInventoryWritePlan('content_hash');
    expect(plan.sourceRevisionAuthorityColumn).toBe('content_hash');
    expect(plan.legacySourceRevisionColumn).toBe('source_revision');
    expect(plan.preservesLegacySourceRevisionSemantics).toBe(true);
    expect(plan.writesAreAuthorized).toBe(false);
    expect(plan.requiresReadbackCanary).toBe(true);
  });

  it('supports direct source-revision authority without changing the safety gates', () => {
    const plan = buildGraphifySourceInventoryWritePlan('source_revision');
    expect(plan.sourceRevisionAuthorityColumn).toBe('source_revision');
    expect(plan.writesAreAuthorized).toBe(false);
    expect(plan.requiresReadbackCanary).toBe(true);
  });
});
