import assert from 'node:assert/strict';
import { test } from 'node:test';

const { synthesizeOntologyHyperedge } = await import('../dist/index.js');

const base = {
  tuple: {
    tuple_id: 'tuple:1',
    predicate: 'USES_FOR',
    predicate_lemma: 'use',
    participants: [
      { role: 'actor', text: 'agent', normalized_text: 'agent', ontology_class: 'CONCEPT' },
      { role: 'tool', text: 'Qdrant', normalized_text: 'qdrant', ontology_class: 'TOOL' },
      { role: 'target', text: 'retrieval', normalized_text: 'retrieval', ontology_class: 'RETRIEVAL' },
    ],
    degree: 3,
    extraction_method: 'LANGEXTRACT_GROUNDED',
    evidence_span_refs: ['span:1'],
    confidence: 0.9,
  },
  participant_entity_ids: ['concept:agent', 'technology:qdrant', 'concept:retrieval'],
  source_ref: 'docs/retrieval.md',
  source_revision: 'repo:abc123',
  ontology_revision: 'ontology:v1',
  producer_revision: 'langextract:v1',
};

test('grounded ternary tuple synthesizes one deterministic hyperedge', () => {
  const first = synthesizeOntologyHyperedge(base);
  const shuffled = synthesizeOntologyHyperedge({
    ...base,
    tuple: { ...base.tuple, participants: [...base.tuple.participants].reverse() },
    participant_entity_ids: [...base.participant_entity_ids].reverse(),
  });

  assert.equal(first.status, 'ELIGIBLE');
  assert.equal(first.hyperedge.participant_count, 3);
  assert.equal(first.hyperedge.relationship_degree_kind, 'ternary');
  assert.equal(first.hyperedge.evidence_refs[0], 'span:1');
  assert.equal(shuffled.status, 'ELIGIBLE');
  assert.equal(shuffled.hyperedge.relationship_id, first.hyperedge.relationship_id);
});

test('ungrounded or incomplete tuples are rejected with typed reasons', () => {
  const result = synthesizeOntologyHyperedge({
    ...base,
    participant_entity_ids: [],
    evidence_state: 'DEGRADED',
    lifecycle: 'SUPERSEDED',
  });

  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasons, ['SUPERSEDED', 'DEGRADED_EVIDENCE', 'MISSING_PARTICIPANT_ID']);
});
