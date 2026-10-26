import { describe, expect, it } from 'vitest';
import { buildKnowledgeGraphViewV1, extractWikilinkOccurrencesV1 } from './knowledge-graph-view-v1.js';

const rev = 'sha256:' + 'a'.repeat(64);

describe('knowledge graph view v1', () => {
  it('records exact UTF-8 byte spans, including after multibyte text', () => {
    const text = 'é→ see [[Alpha|a]] and [[Beta]]';
    const [first, second] = extractWikilinkOccurrencesV1(text);
    const bytes = Buffer.from(text, 'utf8');
    expect(bytes.subarray(first.startByte, first.endByte).toString('utf8')).toBe('[[Alpha|a]]');
    expect(bytes.subarray(second.startByte, second.endByte).toString('utf8')).toBe('[[Beta]]');
    expect(first.alias).toBe('a');
  });

  it('ignores wikilinks inside fenced code blocks', () => {
    const text = '[[Real]]\n```\n[[Fake]]\n```\n';
    expect(extractWikilinkOccurrencesV1(text).map((o) => o.target)).toEqual(['Real']);
  });

  it('proves wikilink edges structurally but never lets a proposed claim exceed PROPOSED', () => {
    const view = buildKnowledgeGraphViewV1({
      snapshotId: 's1',
      queryId: 'q1',
      documents: [{ sourceRef: 'docs/a.md', sourceRevision: rev, text: 'x [[Beta]]' }],
      proposedClaims: [{ fromSourceRef: 'docs/a.md', toTarget: 'Gamma', relation: 'CONTRADICTS', confidence: 0.99 }],
    });
    expect(view.view).toBe('KNOWLEDGE');
    const link = view.edges.find((e) => e.type === 'WIKILINK')!;
    expect(link.qualification).toBe('STRUCTURAL_PROVEN');
    expect(link.span).not.toBeNull();
    expect(link.sourceRevision).toBe(rev);
    const claim = view.edges.find((e) => e.type === 'CONTRADICTS')!;
    expect(claim.qualification).toBe('PROPOSED');
    expect(claim.span).toBeUndefined();
  });

  it('does not mint identity for unresolved targets and bounds node count', () => {
    const view = buildKnowledgeGraphViewV1({
      snapshotId: 's1',
      queryId: 'q1',
      maxNodes: 2,
      documents: [{ sourceRef: 'docs/a.md', sourceRevision: rev, text: '[[A]] [[B]] [[C]]' }],
    });
    expect(view.nodes.length).toBe(2);
    expect(view.truncated).toBe(true);
    const target = view.nodes.find((n) => n.type === 'UnresolvedWikilinkTarget')!;
    expect(target.packetKey).toBeNull();
    expect(target.sourceRef).toBeNull();
    expect(target.properties.resolved).toBe(false);
  });
});
