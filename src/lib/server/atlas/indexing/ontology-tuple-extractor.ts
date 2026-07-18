import type { FeatureEnvelope } from '../contracts/feature-envelope';

export type OntologyTuple = {
  subject: string;
  predicate: string;
  object: string;
  evidence: string;
};

export function extractOntologyTuples(envelope: FeatureEnvelope): OntologyTuple[] {
  const tuples: OntologyTuple[] = [];
  if (envelope.feature_id) {
    tuples.push({ subject: envelope.feature_id, predicate: 'IN_DOMAIN', object: envelope.domain_class ?? 'unknown', evidence: 'feature-envelope' });
  }
  if (envelope.tree_node_id) {
    tuples.push({ subject: envelope.feature_id, predicate: 'HAS_TREE_NODE', object: envelope.tree_node_id, evidence: 'feature-envelope' });
  }
  if (envelope.used_concepts.length > 0) {
    for (const concept of envelope.used_concepts) {
      tuples.push({ subject: envelope.feature_id, predicate: 'USES_CONCEPT', object: concept, evidence: 'used_concepts' });
    }
  }
  return tuples;
}

