import { describe, expect, it } from 'vitest';
import { buildAgenticFileCompilerBlockPlan } from './prompt-plan.js';

describe('buildPromptPlan', () => {
  it('makes block order part of identity', () => {
    const base = { promptPlanId: 'p', contextManifestId: 'c', systemInstructionRevision: 's', toolSchemaRevision: 't', estimatedTokens: 10 };
    const a = buildAgenticFileCompilerBlockPlan({ ...base, blocks: [{ kind: 'TASK', ref: 'a' }, { kind: 'EVIDENCE', ref: 'b' }] });
    const b = buildAgenticFileCompilerBlockPlan({ ...base, blocks: [{ kind: 'EVIDENCE', ref: 'b' }, { kind: 'TASK', ref: 'a' }] });
    expect(a.checksum).not.toBe(b.checksum);
    expect(a.schema).toBe('atlas.agentic-file-compiler.block-plan.v1');
  });
});
