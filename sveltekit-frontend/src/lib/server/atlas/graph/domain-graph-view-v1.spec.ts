import { describe, expect, it } from 'vitest';
import { buildDomainGraphViewV1, type DomainLinkV1 } from './domain-graph-view-v1.js';

const rev = 'sha256:' + 'b'.repeat(64);
const groups = [
  { groupId: 'retrieval', groupLabel: 'Retrieval', parentGroupId: null, taxonomyLevel: 0 },
  { groupId: 'ranking', groupLabel: 'Ranking', parentGroupId: 'retrieval', taxonomyLevel: 1 },
];
const base = { snapshotId: 's', queryId: 'q', taxonomyRevision: 'tax-v1', groups };
const link = (over: Partial<DomainLinkV1>): DomainLinkV1 => ({
  sourceRef: 'src/rank.ts', packetKey: 'packet:r1', groupId: 'ranking', origin: 'CLASSIFIER', confidence: 0.99, ...over,
});
const qual = (links: DomainLinkV1[]) =>
  buildDomainGraphViewV1({ ...base, links }).edges.find((e) => e.type !== 'PARENT_OF')!.qualification;

describe('domain graph view v1', () => {
  it('keeps classifier links PROPOSED even at 0.99 confidence', () => {
    expect(qual([link({})])).toBe('PROPOSED');
  });

  it('proves IMPLEMENTS only with a span and source revision', () => {
    const span = { startByte: 10, endByte: 40 };
    expect(qual([link({ origin: 'IMPLEMENTS', span, sourceRevision: rev })])).toBe('STRUCTURAL_PROVEN');
    expect(qual([link({ origin: 'IMPLEMENTS', span })])).toBe('PROPOSED');
    expect(qual([link({ origin: 'IMPLEMENTS', sourceRevision: rev })])).toBe('PROPOSED');
  });

  it('requires a named reviewer for HUMAN_REVIEWED', () => {
    expect(qual([link({ origin: 'HUMAN_REVIEW', reviewedBy: 'operator' })])).toBe('HUMAN_REVIEWED');
    expect(qual([link({ origin: 'HUMAN_REVIEW' })])).toBe('PROPOSED');
  });

  it('marks taxonomy PROPOSED unless reviewed and drops links to unknown groups', () => {
    const view = buildDomainGraphViewV1({ ...base, links: [link({}), link({ groupId: 'nope' })] });
    expect(view.view).toBe('DOMAIN');
    expect(view.edges.find((e) => e.type === 'PARENT_OF')!.qualification).toBe('PROPOSED');
    expect(view.edges.filter((e) => e.type === 'CLASSIFIED_AS')).toHaveLength(1);
    const reviewed = buildDomainGraphViewV1({ ...base, taxonomyReviewed: true, links: [] });
    expect(reviewed.edges.find((e) => e.type === 'PARENT_OF')!.qualification).toBe('HUMAN_REVIEWED');
  });

  it('bounds the node count', () => {
    const view = buildDomainGraphViewV1({ ...base, maxNodes: 2, links: [link({})] });
    expect(view.nodes).toHaveLength(2);
    expect(view.truncated).toBe(true);
  });
});
