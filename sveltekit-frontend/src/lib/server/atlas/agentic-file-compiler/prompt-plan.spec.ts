import { describe, expect, it } from 'vitest';
import { buildPromptPlan } from './prompt-plan.js';

describe('buildPromptPlan', () => {
  it('makes block order part of identity', () => {
    const base = { promptPlanId: 'p', contextManifestId: 'c', systemInstructionRevision: 's', toolSchemaRevision: 't', estimatedTokens: 10 };
    const a = buildPromptPlan({ ...base, blocks: [{ kind: 'TASK', ref: 'a' }, { kind: 'EVIDENCE', ref: 'b' }] });
    const b = buildPromptPlan({ ...base, blocks: [{ kind: 'EVIDENCE', ref: 'b' }, { kind: 'TASK', ref: 'a' }] });
    expect(a.checksum).not.toBe(b.checksum);
  });
});
