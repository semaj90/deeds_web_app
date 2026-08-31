import { describe, expect, it } from 'vitest';
import { buildObservationFeatureRegistry } from './observation-feature-compiler.js';
import { retrieveFeatureCandidatesV1 } from './feature-candidate-retrieval-v1.js';

const registry = buildObservationFeatureRegistry({
  registryRevision: 'feature-registry:test:v1',
  definitions: [
    { feature_id: 'ast.function_call', family: 'AST_BINARY', value_kind: 'BINARY', description: 'Function call syntax' },
    { feature_id: 'ontology.contract', family: 'ONTOLOGY_BINARY', value_kind: 'BINARY', description: 'Contract concept' },
    { feature_id: 'graph.pagerank', family: 'GRAPH_CONTINUOUS', value_kind: 'CONTINUOUS', description: 'Graph authority score' },
  ],
});

describe('feature-candidate-retrieval-v1', () => {
  it('returns exact and lexical candidates deterministically, capped at ten', () => {
    const a = retrieveFeatureCandidatesV1({ observationId: 'obs:1', queryText: 'ast.function_call', registry, retrievalRevision: 'retrieval:v1' });
    const b = retrieveFeatureCandidatesV1({ observationId: 'obs:1', queryText: 'ast.function_call', registry, retrievalRevision: 'retrieval:v1' });
    expect(a.candidates[0]).toMatchObject({ feature_id: 'ast.function_call', exact_match: true, lexical_score: 1 });
    expect(a.retrieval_checksum).toBe(b.retrieval_checksum);
    expect(a.canonical_authority).toBe(false);
  });

  it('does not invent a feature when the registry has no match', () => {
    const result = retrieveFeatureCandidatesV1({ observationId: 'obs:2', queryText: 'missing capability', registry, retrievalRevision: 'retrieval:v1', topK: 10 });
    expect(result.candidates).toEqual([]);
  });
});
