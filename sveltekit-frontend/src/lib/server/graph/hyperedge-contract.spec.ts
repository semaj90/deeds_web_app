import { describe, expect, it } from 'vitest';
import { buildFeatureRelationship, featureRelationshipToKernel } from '@deeds/parent-atlas';

import { createHyperedgeV1, hyperedgeToRelationshipKernel, projectHyperedgeIncidence } from './hyperedge-contract';

const base = {
  predicate: 'MUTATION_EVENT',
  evidenceRefs: ['receipt:test:1', 'patch:abc'],
  workspaceRevision: 'workspace:42',
  graphRevision: 'graph:9',
  sourceRevision: 'source:before->after',
  producerRevision: 'graphify:2026-08-16',
};

describe('HyperedgeV1', () => {
  it('keeps role-bearing n-ary facts deterministic independent of participant input order', () => {
    const participants = [
      { canonicalId: 'agent:repair', role: 'agent' },
      { canonicalId: 'symbol:processUser', role: 'canonical_symbol' },
      { canonicalId: 'receipt:verify:1', role: 'verification_receipt' },
    ];

    const first = createHyperedgeV1({ ...base, participants });
    const second = createHyperedgeV1({ ...base, participants: [...participants].reverse() });

    expect(first.hyperedgeId).toBe(second.hyperedgeId);
    expect(first.checksum).toBe(second.checksum);
    expect(first.participants).toEqual(second.participants);
  });

  it('changes canonical event identity when a semantic participant role changes', () => {
    const first = createHyperedgeV1({
      ...base,
      participants: [
        { canonicalId: 'agent:repair', role: 'agent' },
        { canonicalId: 'symbol:processUser', role: 'canonical_symbol' },
      ],
    });
    const second = createHyperedgeV1({
      ...base,
      participants: [
        { canonicalId: 'agent:repair', role: 'reviewer' },
        { canonicalId: 'symbol:processUser', role: 'canonical_symbol' },
      ],
    });

    expect(first.hyperedgeId).not.toBe(second.hyperedgeId);
  });

  it('lets graph projection revision change without rewriting canonical hyperedge identity', () => {
    const participants = [
      { canonicalId: 'request:1', role: 'request' },
      { canonicalId: 'tool:graph', role: 'tool' },
      { canonicalId: 'result:1', role: 'result' },
    ];
    const first = createHyperedgeV1({ ...base, predicate: 'TOOL_EXECUTION', participants });
    const rebuiltProjection = createHyperedgeV1({
      ...base,
      predicate: 'TOOL_EXECUTION',
      participants,
      graphRevision: 'graph:10',
    });

    expect(rebuiltProjection.hyperedgeId).toBe(first.hyperedgeId);
    expect(rebuiltProjection.checksum).not.toBe(first.checksum);
  });

  it('projects deterministic incidence rows without treating the projection as canonical truth', () => {
    const edge = createHyperedgeV1({
      ...base,
      participants: [
        { canonicalId: 'request:1', role: 'request' },
        { canonicalId: 'tool:graph', role: 'tool' },
        { canonicalId: 'packet:1', role: 'input_packet' },
      ],
    });

    const rows = projectHyperedgeIncidence(edge);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.hyperedgeId === edge.hyperedgeId)).toBe(true);
    expect(rows.every((row) => row.graphRevision === 'graph:9')).toBe(true);
    expect(rows.every((row) => row.incidenceWeight === 1)).toBe(true);
  });

  it('adapts KAG taxonomy facts to the shared kernel without losing revisions', () => {
    const edge = createHyperedgeV1({
      ...base,
      predicate: 'ENTITY_CLASSIFIED_AS',
      participants: [
        { canonicalId: 'entity:file', role: 'subject' },
        { canonicalId: 'concept:retrieval', role: 'object' },
      ],
    });

    const kernel = hyperedgeToRelationshipKernel(edge);

    expect(kernel.authority).toBe('KAG_TAXONOMY');
    expect(kernel.relationshipId).toBe(edge.hyperedgeId);
    expect(kernel.workspaceRevision).toBe(edge.workspaceRevision);
    expect(kernel.sourceRevision).toBe(edge.sourceRevision);
    expect(kernel.graphRevision).toBe(edge.graphRevision);
    expect(kernel.participants).toHaveLength(2);
  });

  it('keeps shared kernel fields aligned while retaining domain-scoped authority', () => {
    const hyperedge = createHyperedgeV1({
      ...base,
      predicate: 'ENTITY_CLASSIFIED_AS',
      participants: [
        { canonicalId: 'entity:file', role: 'subject' },
        { canonicalId: 'concept:retrieval', role: 'object' },
      ],
    });
    const featureRelationship = buildFeatureRelationship({
      relationship_id: 'rel:docs:qdrant',
      relationship_type: 'DOC_RELATES_CONCEPTS',
      participants: [
        { role: 'subject', entity_type: 'document', entity_id: 'doc:retrieval' },
        { role: 'object', entity_type: 'concept', entity_id: 'concept:qdrant' },
      ],
      source_ref: 'docs/retrieval.md',
      source_revision: 'sha256:' + 'a'.repeat(64),
      relationship_revision: 'rel-r1',
      producer_revision: 'producer-r1',
      evidence_refs: ['evidence:a'],
    });
    const kag = hyperedgeToRelationshipKernel(hyperedge);
    const fi = featureRelationshipToKernel(featureRelationship);

    expect(kag.schema).toBe(fi.schema);
    expect(kag.authority).toBe('KAG_TAXONOMY');
    expect(fi.authority).toBe('FEATURE_INTELLIGENCE');
    expect(kag.workspaceRevision).toBe(hyperedge.workspaceRevision);
    expect(fi.workspaceRevision).toBeNull();
    expect(kag.participants.every((participant) => participant.ordinal >= 0)).toBe(true);
    expect(fi.participants.every((participant) => participant.ordinal >= 0)).toBe(true);
  });
});
