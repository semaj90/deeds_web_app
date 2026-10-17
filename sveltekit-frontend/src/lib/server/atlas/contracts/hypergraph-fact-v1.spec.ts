import { describe, expect, it } from 'vitest';
import {
  createHypergraphFactV1,
  factToSemanticFactsRow,
  projectFactToNeo4j,
} from './hypergraph-fact-v1.js';

describe('HypergraphFactV1', () => {
  const baseInput = {
    predicate: 'IMPLEMENTS',
    workspaceRevision: 'ws-rev-2026-10-16',
    graphRevision: 'graph-rev-v1',
    sourceRevision: 'src-rev-a1b2c3d',
    producerRevision: 'atlas-fact-producer-v1',
    domainClass: 'legal_analysis',
    confidenceScore: 0.95,
  };

  it('produces deterministic factId and checksum regardless of participant input order', () => {
    const participantsA = [
      { entityId: 'tree_1234567890abcdef', role: 'target', entityKind: 'TREE_NODE' as const },
      { entityId: 'pkt_abcdef1234567890', role: 'source', entityKind: 'PACKET' as const },
    ];
    const participantsB = [
      { entityId: 'pkt_abcdef1234567890', role: 'source', entityKind: 'PACKET' as const },
      { entityId: 'tree_1234567890abcdef', role: 'target', entityKind: 'TREE_NODE' as const },
    ];

    const fact1 = createHypergraphFactV1({
      ...baseInput,
      participants: participantsA,
    });
    const fact2 = createHypergraphFactV1({
      ...baseInput,
      participants: participantsB,
    });

    expect(fact1.factId).toBe(fact2.factId);
    expect(fact1.checksum).toBe(fact2.checksum);
    expect(fact1.factId.startsWith('fact_')).toBe(true);
  });

  it('projects whole facts to Neo4j preserving role incidents', () => {
    const fact = createHypergraphFactV1({
      ...baseInput,
      participants: [
        { entityId: 'pkt_source', role: 'subject', ordinal: 0 },
        { entityId: 'concept_legal_deed', role: 'concept', ordinal: 1 },
        { entityId: 'statute_california_civil_code', role: 'authority', ordinal: 2 },
      ],
      evidence: [
        {
          evidenceId: 'ev_001',
          sourceRef: 'src/lib/server/contracts/deed.ts',
          contentHash: 'a'.repeat(64),
        },
      ],
    });

    const projection = projectFactToNeo4j(fact);
    expect(projection.factNode.labels).toEqual(['HypergraphFact', 'IMPLEMENTS']);
    expect(projection.factNode.properties.factId).toBe(fact.factId);
    expect(projection.relationships).toHaveLength(3);
    expect(projection.relationships.map((r) => r.role)).toEqual(['subject', 'concept', 'authority']);
  });

  it('maps to feature_semantic_facts Postgres row representation', () => {
    const fact = createHypergraphFactV1({
      ...baseInput,
      participants: [
        { entityId: 'pkt_source', role: 'subject' },
        { entityId: 'pkt_target', role: 'object' },
      ],
      evidence: [
        {
          evidenceId: 'ev_002',
          sourceRef: 'src/lib/server/evidence.ts',
          contentHash: 'b'.repeat(64),
        },
      ],
    });

    const row = factToSemanticFactsRow(fact);
    expect(row.packetKey).toBe(fact.factId);
    expect(row.sourceRef).toBe('src/lib/server/evidence.ts');
    expect(row.domainClass).toBe('legal_analysis');
    expect(row.similarityConfidence).toBe(0.95);
    expect(row.contentHash).toBe(fact.checksum);
    expect(row.metadata.predicate).toBe('IMPLEMENTS');
  });
});
