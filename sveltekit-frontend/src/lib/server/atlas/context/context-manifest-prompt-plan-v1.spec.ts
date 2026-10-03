import { describe, expect, it } from 'vitest';
import { buildAceContextManifestAdmissionV1 } from './ace-context-manifest-admission-v1.js';
import { buildManifestBoundPromptPlanV1 } from './context-manifest-prompt-plan-v1.js';

const snapshot = {
  schema: 'atlas.candidate-feature-snapshot.v1' as const,
  candidateSnapshotRevision: 'candidate:prompt-fixture',
  ordinalMapChecksum: 'a'.repeat(64),
  workspaceRevision: 'workspace:prompt-fixture',
  featureRevision: 'feature:prompt-fixture',
  rowCount: 1,
  rows: [{
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: 0,
    canonicalId: 'canonical:prompt-fixture',
    packetKey: 'packet:prompt-fixture',
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: 'workspace:prompt-fixture',
    sourceRevision: 'source:prompt-fixture',
    graphRevision: 'graph:prompt-fixture',
    semanticRevision: 'semantic:prompt-fixture',
    featureRevision: 'feature:prompt-fixture',
    representationBindings: [],
    laneMask: ['semantic'] as const,
    evidenceRefs: ['evidence:prompt-fixture'],
  }],
  snapshotChecksum: 'b'.repeat(64),
  identityAuthority: false as const,
  canonicalOwnerChanged: false as const,
  producerRevision: 'producer:prompt-fixture',
};

const admission = buildAceContextManifestAdmissionV1({
  snapshot,
  requestId: 'request:prompt-fixture',
  tokenBudget: 512,
  retrievalPolicyRevision: 'policy:prompt-fixture',
  acePlaybookRevision: 'playbook:prompt-fixture',
  representationRevision: 'semantic:prompt-fixture',
  graphRevision: 'graph:prompt-fixture',
});

const baseInput = {
  admission,
  tokenizerRevision: 'tokenizer:fixture-v1',
  promptTemplateRevision: 'template:fixture-v1',
  instructionRevision: 'instruction:fixture-v1',
  modelRevision: 'ornith:fixture-v1',
  adapterRevision: null,
  toolSchemaRevision: 'tools:fixture-v1',
  systemPolicyRevision: 'policy:fixture-v1',
  stablePrefix: 'Summarize the admitted evidence only.',
  segments: [
    { ordinal: 0, kind: 'SYSTEM' as const, packetKey: null, evidenceRefs: [], contentChecksum: 'c'.repeat(64), tokenCount: 8 },
    { ordinal: 1, kind: 'EVIDENCE' as const, packetKey: 'packet:prompt-fixture', evidenceRefs: ['evidence:prompt-fixture'], contentChecksum: 'd'.repeat(64), tokenCount: 12 },
  ],
  contextLimitTokens: 1024,
  reservedOutputTokens: 128,
  maxInputTokens: 896,
};

describe('manifest-bound PromptPlan bridge', () => {
  it('binds prompt plan and stable-prefix identity to admitted manifest and ordered evidence', () => {
    const first = buildManifestBoundPromptPlanV1(baseInput);
    const replay = buildManifestBoundPromptPlanV1(baseInput);

    expect(first.promptPlan.contextManifestChecksum).toBe(admission.manifest.identityChecksum);
    expect(first.promptPlan.requestId).toBe(admission.manifest.v1.requestId);
    expect(first.orderedEvidenceChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first.promptPlan.checksumSha256).toBe(replay.promptPlan.checksumSha256);
    expect(first.contextPrefixIdentity.checksum).toBe(replay.contextPrefixIdentity.checksum);
    expect(first.contextPrefixIdentity.stableEvidenceRevision).not.toBe('');
  });

  it('fails closed if prompt evidence differs from the manifest evidence set', () => {
    expect(() => buildManifestBoundPromptPlanV1({
      ...baseInput,
      segments: baseInput.segments.map((segment) => segment.kind === 'EVIDENCE'
        ? { ...segment, evidenceRefs: ['evidence:other'] }
        : segment),
    })).toThrow('PROMPT_PLAN_EVIDENCE_SET_MISMATCH');
  });

  it('fails closed on duplicate evidence references', () => {
    expect(() => buildManifestBoundPromptPlanV1({
      ...baseInput,
      segments: [
        ...baseInput.segments,
        { ...baseInput.segments[1]!, ordinal: 2 },
      ],
    })).toThrow('PROMPT_PLAN_DUPLICATE_EVIDENCE_REF');
  });

  it('does not admit non-evidence-only prompt plans', () => {
    expect(() => buildManifestBoundPromptPlanV1({
      ...baseInput,
      segments: [baseInput.segments[0]!],
    })).toThrow('PROMPT_PLAN_EVIDENCE_SEGMENTS_REQUIRED');
  });
});
