import { describe, expect, it } from 'vitest';
import {
  AtlasEvidenceResolverRegistryV1,
  applyKnowledgeClaimMutationsV1,
  buildAtlasEvidenceResourceV1,
  buildAtlasKnowledgeClaimV1,
  buildContextualTextAnchorV1,
  buildResolvedEvidenceRefV1,
  createPhaseScopedEvidenceResolverV1,
  reconcileKnowledgeClaimsV1,
  relocateContextualTextAnchorV1,
  runKnowledgeClaimPreflightV1,
  sha256TextV1,
  type AtlasEvidenceResolverV1,
} from './index.js';

const source = buildAtlasEvidenceResourceV1({ namespace: 'SOURCE', locator: 'src/example.ts', byteRange: null, lineRange: { startLine: 2, endLine: 2 } });

function resolved(version = 'source:r1', content = 'const x = 1;\n') {
  return buildResolvedEvidenceRefV1({
    resource: source,
    evidenceVersion: version,
    authorityRevision: version,
    sourceRevision: version,
    contentChecksum: sha256TextV1(content),
    resolvedByteRange: null,
    resolvedLineRange: { startLine: 2, endLine: 2 },
    stableSymbolId: null,
    symbolVersionId: null,
    resolutionMethod: 'EXACT_SOURCE_REVISION',
    resolverRevision: 'resolver:v1',
  });
}

function registryWith(evidence = resolved()) {
  const registry = new AtlasEvidenceResolverRegistryV1();
  let calls = 0;
  const resolver: AtlasEvidenceResolverV1 = {
    namespace: 'SOURCE',
    resolverRevision: 'resolver:v1',
    async resolve(resource) {
      calls += 1;
      return { evidence: { ...evidence, resource }, content: 'const x = 1;\n' };
    },
  };
  registry.register(resolver);
  return { registry, calls: () => calls };
}

describe('ParentAtlasKnowledgeFabricV1 foundation', () => {
  it('makes evidence versions resolver-owned and phase cache scoped', async () => {
    const { registry, calls } = registryWith();
    const phase = createPhaseScopedEvidenceResolverV1(registry);
    await phase.resolve(source, 'old');
    await phase.resolve(source, 'old');
    expect(calls()).toBe(1);
    expect(phase.cacheSize()).toBe(1);
  });

  it('relocates exact text and fails closed on ambiguous text', () => {
    const before = 'one\nneedle\nthree\n';
    const anchor = buildContextualTextAnchorV1(before, 2, 2);
    const moved = relocateContextualTextAnchorV1('zero\none\nneedle\nthree\n', anchor);
    expect(moved.status).toBe('RESOLVED');
    const duplicate = relocateContextualTextAnchorV1('needle\nneedle\n', buildContextualTextAnchorV1('needle\n', 1, 1));
    expect(duplicate.status).toBe('AMBIGUOUS');
  });

  it('applies claim mutations atomically only after evidence resolves', async () => {
    const { registry } = registryWith();
    const result = await applyKnowledgeClaimMutationsV1([], [{ mutationId: 'm1', operation: 'ADD', claimId: 'claim:1', statement: 'The example defines x.', claimRevision: 'claim:r1', evidenceResources: [source] }], registry);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.state).toBe('VERIFIED');
    expect(result.receipt.writesPerformed).toBe(false);
  });

  it('preflights changed evidence as stale without mutating claims', async () => {
    const original = buildAtlasKnowledgeClaimV1({ claimId: 'claim:1', statement: 'The example defines x.', evidenceRefs: [resolved('source:r1')], claimRevision: 'claim:r1', state: 'VERIFIED' });
    const { registry } = registryWith(resolved('source:r2', 'const x = 2;\n'));
    const report = await runKnowledgeClaimPreflightV1([original], registry);
    expect(report.stale).toBe(1);
    expect(report.issues.some((issue) => issue.kind === 'SOURCE_REVISION_CHANGED')).toBe(true);
    expect(report.writesPerformed).toBe(false);
  });

  it('retains issue-free claims sparsely and requires explicit stale decisions', () => {
    const first = buildAtlasKnowledgeClaimV1({ claimId: 'claim:1', statement: 'One.', evidenceRefs: [resolved()], claimRevision: 'claim:r1', state: 'VERIFIED' });
    const second = buildAtlasKnowledgeClaimV1({ claimId: 'claim:2', statement: 'Two.', evidenceRefs: [resolved()], claimRevision: 'claim:r1', state: 'VERIFIED' });
    const issue = [{ claimId: 'claim:1', evidenceResourceKey: source.resourceKey, kind: 'SOURCE_REVISION_CHANGED' as const }];
    expect(() => reconcileKnowledgeClaimsV1([first, second], issue, { confirmedClaimIds: [], claims: [], retractedClaimIds: [] })).toThrow('STALE_CLAIM_DECISION_MISSING');
    const updated = buildAtlasKnowledgeClaimV1({ claimId: 'claim:1', statement: 'One updated.', evidenceRefs: [resolved('source:r2')], claimRevision: 'claim:r2', state: 'VERIFIED' });
    const result = reconcileKnowledgeClaimsV1([first, second], issue, { confirmedClaimIds: [], claims: [updated], retractedClaimIds: [] });
    expect(result.receipt.retainedWithoutModelRepeat).toBe(1);
    expect(result.claims.find((claim) => claim.claimId === 'claim:2')?.claimChecksum).toBe(second.claimChecksum);
  });
});
