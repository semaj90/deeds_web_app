import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeGenerationRunV1,
  buildKnowledgeGraphProjectionV1,
  buildKnowledgeIndexV1,
  buildKnowledgePageSnapshotV1,
  buildKnowledgeSourceSnapshotV1,
  canFinishKnowledgeGenerationRunV1,
  isKnowledgePageManifestCurrentV1,
  reconcileKnowledgeGeneratedProvenanceV1,
  reconcileKnowledgeOkfSourcesV1,
  reconcileKnowledgeVerificationEventsV1,
  sha256TextV1,
} from './index.js';

const hash = (value: string) => sha256TextV1(value);

function job(status: 'PENDING' | 'SKIPPED' | 'COMPLETE') {
  return { schema: 'atlas.knowledge-page-job.v1' as const, jobId: 'job:1', pageId: 'page:1', path: 'docs/knowledge/one.md', title: 'One', purpose: 'Document one.', sourceSetChecksum: hash('sources'), relatedPageIds: [], instructions: [], status, completedBy: status === 'COMPLETE' ? 'parent-atlas/test' : null };
}

describe('knowledge durability contracts', () => {
  it('freezes source snapshots independent of input ordering', () => {
    const base = { snapshotRevision: 'snapshot:r1', workspaceRevision: 'workspace:r1', sources: [{ sourceRef: 'b', sourceRevision: 'r1', sourceContentChecksum: hash('b') }, { sourceRef: 'a', sourceRevision: 'r1', sourceContentChecksum: hash('a') }], openspecRevision: 'openspec:r1', testRevision: 'tests:r1', reportRevisions: ['report:b', 'report:a'], rawWorktreeFingerprint: null };
    const a = buildKnowledgeSourceSnapshotV1(base);
    const b = buildKnowledgeSourceSnapshotV1({ ...base, sources: [...base.sources].reverse(), reportRevisions: [...base.reportRevisions].reverse() });
    expect(a.sourceSetChecksum).toBe(b.sourceSetChecksum);
  });

  it('treats completed/skipped page jobs as finishable but pending as blocking', () => {
    const run = buildKnowledgeGenerationRunV1({ runId: 'run:1', mode: 'UPDATE', phase: 'GENERATING', startedAt: '2026-09-02T00:00:00.000Z', workspaceRevision: 'workspace:r1', sourceSnapshotRevision: 'source:r1', sourceSetChecksum: hash('sources'), dagRevision: 'dag:r1', plannerRevision: 'planner:r1', programRevision: 'program:r1', modelRevision: 'model:r1', pageJobs: [job('PENDING')] });
    expect(canFinishKnowledgeGenerationRunV1(run)).toBe(false);
    expect(canFinishKnowledgeGenerationRunV1({ ...run, pageJobs: [job('COMPLETE')], runChecksum: run.runChecksum })).toBe(true);
  });

  it('binds page manifest currentness to page bytes, claims, verification and source snapshot', () => {
    const markdown = '# One\n';
    const entry = { schema: 'atlas.knowledge-page-manifest-entry.v1' as const, pageId: 'page:1', path: 'docs/knowledge/one.md', workspaceRevision: 'workspace:r1', sourceSnapshotRevision: 'snapshot:r1', sourceSetChecksum: hash('sources'), pageRevision: 'page:r1', pageChecksum: hash(markdown), claimSetChecksum: hash('claims'), claimCount: 2, verificationReceiptChecksum: hash('verify'), completedRunId: 'run:1', completedBy: 'parent-atlas/test', status: 'CURRENT' as const, canonicalAuthority: false as const };
    expect(isKnowledgePageManifestCurrentV1({ entry, workspaceRevision: 'workspace:r1', sourceSnapshotRevision: 'snapshot:r1', sourceSetChecksum: hash('sources'), pageMarkdown: markdown, claimSetChecksum: hash('claims'), verificationReceiptChecksum: hash('verify') })).toBe(true);
    expect(isKnowledgePageManifestCurrentV1({ entry, workspaceRevision: 'workspace:r1', sourceSnapshotRevision: 'snapshot:r1', sourceSetChecksum: hash('sources'), pageMarkdown: '# Changed\n', claimSetChecksum: hash('claims'), verificationReceiptChecksum: hash('verify') })).toBe(false);
  });

  it('advances generated provenance only when body bytes change', () => {
    const first = reconcileKnowledgeGeneratedProvenanceV1({ pageId: 'page:1', beforeBody: null, afterBody: '# One\n', previous: null, generatedBy: 'parent-atlas/test', runId: 'run:1', programRevision: 'program:r1', modelRevision: 'model:r1', generatedAt: '2026-09-02T00:00:00.000Z' });
    expect(first).not.toBeNull();
    const same = reconcileKnowledgeGeneratedProvenanceV1({ pageId: 'page:1', beforeBody: '# One\n', afterBody: '# One\n', previous: first, generatedBy: 'parent-atlas/test2', runId: 'run:2', programRevision: 'program:r2', modelRevision: 'model:r2', generatedAt: '2026-09-03T00:00:00.000Z' });
    expect(same).toEqual(first);
  });

  it('preserves non-Parent-Atlas OKF sources and verification events', () => {
    const sources = reconcileKnowledgeOkfSourcesV1([{ id: 'human-1', resource: 'manual://a' }, { id: 'parent-atlas-source-old', resource: 'source://old' }], ['source://new']);
    expect(sources.some((entry) => entry.id === 'human-1')).toBe(true);
    expect(sources.some((entry) => entry.resource === 'source://old')).toBe(false);
    const events = reconcileKnowledgeVerificationEventsV1([{ by: 'human/james' }, { by: 'parent-atlas/old' }], { by: 'parent-atlas/claim-verifier-v1', receiptChecksum: hash('receipt') });
    expect(events.map((event) => event.by)).toEqual(['human/james', 'parent-atlas/claim-verifier-v1']);
  });

  it('builds deterministic index and graph projections with no canonical authority', () => {
    const index = buildKnowledgeIndexV1({ knowledgeRevision: 'knowledge:r1', pages: [{ pageId: 'b', path: 'b.md', title: 'B', description: '', claimCount: 1, verifiedClaimCount: 1 }, { pageId: 'a', path: 'a.md', title: 'A', description: '', claimCount: 1, verifiedClaimCount: 1 }] });
    expect(index.pages[0]?.pageId).toBe('a');
    const graph = buildKnowledgeGraphProjectionV1({ knowledgeRevision: 'knowledge:r1', nodes: [{ nodeKey: 'claim:1', nodeClass: 'CLAIM' }, { nodeKey: 'page:1', nodeClass: 'KNOWLEDGE_PAGE' }], edges: [{ sourceNodeKey: 'page:1', targetNodeKey: 'claim:1', edgeType: 'ASSERTS' }] });
    expect(graph.canonicalAuthority).toBe(false);
    expect(graph.writesPerformed).toBe(false);
  });

  it('checksum-seals exact pre-worker snapshots', () => {
    const snapshot = buildKnowledgePageSnapshotV1({ runId: 'run:1', jobId: 'job:1', pageId: 'page:1', beforePageChecksum: hash('page'), beforeClaimSetChecksum: hash('claims'), beforePageArtifactRef: 'artifact:page', beforeClaimArtifactRef: 'artifact:claims' });
    expect(snapshot.snapshotChecksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
