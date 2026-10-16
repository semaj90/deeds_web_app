import { describe, it, expect } from 'vitest';
import { selectVerifiedRetrievalMode } from './auto-mode-classifier-gate.js';
import {
  buildKarpathyDagCacheKey,
  type KarpathyDagHit,
} from '$lib/server/indexer/karpathy-dag-subhelpers.js';

describe('selectVerifiedRetrievalMode (Auto-Mode Classifier Gate)', () => {
  const liveRev = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const staleRev = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  const validHit: KarpathyDagHit = {
    nodeId: 'node:ui:1',
    filePath: 'src/lib/components/ActionPopup.svelte',
    semanticTag: 'ui-component',
    similarityScore: 0.91,
    sourceRevision: liveRev,
    dagLevel: 'FILE',
    dependencies: ['src/lib/components/Button.svelte'],
    dependents: ['src/routes/+page.svelte', 'src/routes/cases/+page.svelte'],
    cacheKey: buildKarpathyDagCacheKey('src/lib/components/ActionPopup.svelte', liveRev, 'ui-component'),
    canonicalAuthority: false,
  };

  const staleHit: KarpathyDagHit = {
    ...validHit,
    nodeId: 'node:ui:2',
    sourceRevision: staleRev,
    cacheKey: buildKarpathyDagCacheKey('src/lib/components/ActionPopup.svelte', staleRev, 'ui-component'),
  };

  it('rejects stale DAG hits and falls back to SEMANTIC_DENSE_768', () => {
    const liveRevisions = new Map([['src/lib/components/ActionPopup.svelte', liveRev]]);
    const res = selectVerifiedRetrievalMode({
      query: 'ActionPopup onclick handler',
      candidateDagHits: [staleHit],
      liveSourceRevisions: liveRevisions,
      hyperedgeMatchCount: 3,
    });

    expect(res.mode).toBe('SEMANTIC_DENSE_768');
    expect(res.admittedDagHits).toHaveLength(0);
    expect(res.rejectionReason).toBe('STALE_OR_MISSING_SOURCE_REVISION');
    expect(res.canonicalAuthority).toBe(false);
  });

  it('admits HYPERGRAPH_NARY when valid DAG hits and verified hyperedges exist', () => {
    const liveRevisions = new Map([['src/lib/components/ActionPopup.svelte', liveRev]]);
    const res = selectVerifiedRetrievalMode({
      query: 'ActionPopup rune state',
      candidateDagHits: [validHit, staleHit],
      liveSourceRevisions: liveRevisions,
      hyperedgeMatchCount: 2,
    });

    expect(res.mode).toBe('HYPERGRAPH_NARY');
    expect(res.admittedDagHits).toHaveLength(1);
    expect(res.admittedDagHits[0].nodeId).toBe('node:ui:1');
    expect(res.rejectionReason).toBeNull();
    expect(res.canonicalAuthority).toBe(false);
  });

  it('selects KARPATHY_DAG_FUSED when valid DAG hits exist but hyperedgeMatchCount is 0', () => {
    const res = selectVerifiedRetrievalMode({
      query: 'ActionPopup component',
      candidateDagHits: [validHit],
      liveSourceRevisions: { 'src/lib/components/ActionPopup.svelte': liveRev },
      hyperedgeMatchCount: 0,
    });

    expect(res.mode).toBe('KARPATHY_DAG_FUSED');
    expect(res.admittedDagHits).toHaveLength(1);
    expect(res.rejectionReason).toBeNull();
  });

  it('falls back to SEMANTIC_DENSE_768 when no candidate DAG hits are supplied', () => {
    const res = selectVerifiedRetrievalMode({
      query: 'general search',
      candidateDagHits: [],
      liveSourceRevisions: new Map(),
      hyperedgeMatchCount: 0,
    });

    expect(res.mode).toBe('SEMANTIC_DENSE_768');
    expect(res.admittedDagHits).toHaveLength(0);
    expect(res.rejectionReason).toBe('NO_TOPOLOGICAL_HITS_ADMITTED');
  });
});
