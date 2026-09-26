import { describe, expect, it } from 'vitest';
import { buildAceContextManifestAdmissionV1 } from './ace-context-manifest-admission-v1.js';
import { bridgeContextManifestToPromptPlanV1 } from './ace-context-prompt-plan-bridge-v1.js';

const row = (i: number) => ({
  schema: 'atlas.candidate-feature-row.v1' as const, candidateOrdinal: i, canonicalId: `canonical:${i}`, packetKey: `packet:${i}`,
  sourceRef: `src/f${i}.ts`, treeNodeId: null, symbolVersionId: null, workspaceRevision: 'workspace:r1', sourceRevision: `src-r${i}`,
  graphRevision: null, semanticRevision: null, featureRevision: 'feature:r1', representationBindings: [], laneMask: ['semantic'] as const,
  evidenceRefs: [`evidence:${i}`],
});
const snapshot = {
  schema: 'atlas.candidate-feature-snapshot.v1' as const, candidateSnapshotRevision: 'candidate:r1', ordinalMapChecksum: 'a'.repeat(64),
  workspaceRevision: 'workspace:r1', featureRevision: 'feature:r1', rowCount: 3, rows: [0, 1, 2].map(row),
  snapshotChecksum: 'b'.repeat(64), identityAuthority: false as const, canonicalOwnerChanged: false as const, producerRevision: 'producer:r1',
};

function bridge(selected: number[] = [0, 1], promptTemplateRevision: string | null = null) {
  const admission = buildAceContextManifestAdmissionV1({
    snapshot: snapshot as never, requestId: 'req:1', selectedOrdinals: selected, tokenBudget: 512, retrievalPolicyRevision: 'policy:r1',
    acePlaybookRevision: 'playbook:r1', representationRevision: null, graphRevision: null, promptTemplateRevision,
  });
  return {
    admission,
    receipt: {
      schema: 'atlas.ace-packet-context-manifest-bridge.v1' as const, candidateSnapshotRevision: 'candidate:r1', ordinalMapChecksum: 'a'.repeat(64),
      featureRevision: 'feature:r1', selectedOrdinals: selected, selectedPacketSetChecksum: selected.join('').padEnd(64, 'c'),
      contextManifestIdentityChecksum: admission.manifest.identityChecksum, representationRevision: null, graphRevision: null,
      packetCount: selected.length, canonicalAuthority: false as const, writesPerformed: false as const,
    },
  };
}

const tokenizer = { revision: 'tok:r1', countTokens: (t: string) => t.split(/\s+/).filter(Boolean).length };
const ev = (i: number, text = `evidence text ${i}`) => ({ candidateOrdinal: i, packetKey: `packet:${i}`, evidenceRefs: [`evidence:${i}`], text });
const input = (over: Record<string, unknown> = {}) => ({
  bridge: bridge(), requestId: 'req:1', system: { text: 'You are a code assistant.' }, instruction: { text: 'Answer from evidence only.' },
  evidence: [ev(0), ev(1)], userQuery: { text: 'why does it fail' }, tokenizer, promptTemplateRevision: 'prompt:r1', instructionRevision: 'instr:r1', ...over,
}) as never;

describe('ACE3-07A manifest -> PromptPlanV1 bridge', () => {
  it('is deterministic, orders segments, binds the manifest, and never calls a model', () => {
    const a = bridgeContextManifestToPromptPlanV1(input());
    const b = bridgeContextManifestToPromptPlanV1(input());
    expect(a.plan.checksumSha256).toBe(b.plan.checksumSha256);
    expect(a.prefix.stablePrefixChecksum).toBe(b.prefix.stablePrefixChecksum);
    expect(a.plan.segments.map((s) => s.kind)).toEqual(['SYSTEM', 'INSTRUCTION', 'EVIDENCE', 'EVIDENCE', 'USER_QUERY']);
    expect(a.plan.contextManifestChecksum).toBe(a.prefix.contextManifestIdentityChecksum);
    expect(a.modelCalled).toBe(false);
    expect(a.writesPerformed).toBe(false);
  });
  it('a different user query changes the plan but not the stable prefix', () => {
    const a = bridgeContextManifestToPromptPlanV1(input());
    const b = bridgeContextManifestToPromptPlanV1(input({ userQuery: { text: 'something else entirely' } }));
    expect(a.plan.checksumSha256).not.toBe(b.plan.checksumSha256);
    expect(a.prefix.stablePrefixChecksum).toBe(b.prefix.stablePrefixChecksum);
    expect(a.prefix.stablePrefixTokens).toBe(b.prefix.stablePrefixTokens);
  });
  it('different evidence text or tokenizer revision changes the stable prefix', () => {
    const base = bridgeContextManifestToPromptPlanV1(input());
    const text = bridgeContextManifestToPromptPlanV1(input({ evidence: [ev(0), ev(1, 'changed evidence')] }));
    const tok = bridgeContextManifestToPromptPlanV1(input({ tokenizer: { ...tokenizer, revision: 'tok:r2' } }));
    expect(text.prefix.stablePrefixChecksum).not.toBe(base.prefix.stablePrefixChecksum);
    expect(tok.prefix.stablePrefixChecksum).not.toBe(base.prefix.stablePrefixChecksum);
  });
  it('rejects evidence not matching the selected ordinals, duplicates, empties, receipt/manifest mismatch', () => {
    expect(() => bridgeContextManifestToPromptPlanV1(input({ evidence: [ev(0)] }))).toThrow('EVIDENCE_ORDINALS_MISMATCH');
    expect(() => bridgeContextManifestToPromptPlanV1(input({ evidence: [ev(0), ev(0)] }))).toThrow('DUPLICATE_EVIDENCE_ORDINAL');
    expect(() => bridgeContextManifestToPromptPlanV1(input({ evidence: [ev(0), ev(1, '  ')] }))).toThrow('EMPTY_SEGMENT');
    const bad = bridge();
    bad.receipt.contextManifestIdentityChecksum = 'f'.repeat(64);
    expect(() => bridgeContextManifestToPromptPlanV1(input({ bridge: bad }))).toThrow('RECEIPT_MANIFEST_MISMATCH');
  });
  it('rejects a prompt template revision that contradicts the manifest and an over-budget plan', () => {
    expect(() => bridgeContextManifestToPromptPlanV1(input({ bridge: bridge([0, 1], 'prompt:other') }))).toThrow('PROMPT_TEMPLATE_REVISION_MISMATCH');
    expect(() => bridgeContextManifestToPromptPlanV1(input({ maxInputTokens: 3 }))).toThrow('exceeds maxInputTokens');
  });
});
