import { describe, expect, it } from 'vitest';
import {
  ConceptDefinitionV1Schema,
  ConceptRecognitionV1Schema,
  TermObservationV1Schema,
  computeConceptDefinitionRevision,
  validateConceptIdUniqueness,
  validateDefinitionRevisionReproducible,
  validateNoAliasCollisions,
} from './concept-fabric-v1.js';

function makeConcept(overrides: Partial<Parameters<typeof ConceptDefinitionV1Schema.parse>[0]> = {}) {
  const base = {
    schema: 'atlas.concept-definition.v1' as const,
    conceptId: 'concept:domain:retrieval',
    canonicalLabel: 'retrieval',
    definition: 'Vector/lexical/hybrid candidate search over indexed packets.',
    conceptType: 'domain' as const,
    namespace: 'domain',
    aliases: ['search', 'rag'],
    schemaVersion: 1,
    sourceOwner: 'domain-taxonomy.ts::CANONICAL_DOMAINS',
    evidenceRefs: ['src/lib/server/atlas/domain-taxonomy.ts'],
    status: 'ACTIVE' as const,
    canonicalAuthority: true as const,
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    definitionRevision: computeConceptDefinitionRevision(merged),
  };
}

describe('ConceptDefinitionV1 — CONCEPT-SCHEMA-01 fixtures', () => {
  it('accepts a valid ACTIVE definition', () => {
    const concept = makeConcept();
    expect(() => ConceptDefinitionV1Schema.parse(concept)).not.toThrow();
  });

  it('rejects an ACTIVE definition with an empty definition string (CONCEPT_VALID_02)', () => {
    const concept = makeConcept({ definition: '' });
    const result = ConceptDefinitionV1Schema.safeParse(concept);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('CONCEPT_VALID_02'))).toBe(true);
    }
  });

  it('rejects an ACTIVE definition with no evidenceRefs (CONCEPT_VALID_07)', () => {
    const concept = makeConcept({ evidenceRefs: [] });
    const result = ConceptDefinitionV1Schema.safeParse(concept);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('CONCEPT_VALID_07'))).toBe(true);
    }
  });

  it('normalizes/rejects alias collisions with the canonical label', () => {
    const concept = makeConcept({ aliases: ['Retrieval'] }); // same as canonicalLabel, cased differently
    const result = ConceptDefinitionV1Schema.safeParse(concept);
    expect(result.success).toBe(false);
  });

  it('rejects duplicate aliases within a single definition (case-insensitive)', () => {
    const concept = makeConcept({ aliases: ['search', 'Search'] });
    const result = ConceptDefinitionV1Schema.safeParse(concept);
    expect(result.success).toBe(false);
  });

  it('rejects duplicate conceptId across a batch (CONCEPT_VALID_01)', () => {
    const a = makeConcept({ conceptId: 'concept:domain:retrieval' });
    const b = makeConcept({ conceptId: 'concept:domain:retrieval', canonicalLabel: 'retrieval-dup' });
    const issues = validateConceptIdUniqueness([
      ConceptDefinitionV1Schema.parse(a),
      ConceptDefinitionV1Schema.parse(b),
    ]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].code).toBe('CONCEPT_VALID_01');
  });

  it('flags an ambiguous alias claimed by two distinct concepts (CONCEPT_VALID_04)', () => {
    const a = ConceptDefinitionV1Schema.parse(
      makeConcept({ conceptId: 'concept:domain:retrieval', aliases: ['search'] }),
    );
    const b = ConceptDefinitionV1Schema.parse(
      makeConcept({
        conceptId: 'concept:domain:network',
        canonicalLabel: 'network',
        aliases: ['search'], // same alias, different concept -> collision
      }),
    );
    const issues = validateNoAliasCollisions([a, b]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].code).toBe('CONCEPT_VALID_04');
  });

  it('detects a definitionRevision that does not reproduce (CONCEPT_VALID_03)', () => {
    const concept = ConceptDefinitionV1Schema.parse(makeConcept());
    const tampered = { ...concept, definitionRevision: 'sha256:not-the-real-hash' };
    const issues = validateDefinitionRevisionReproducible(tampered);
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe('CONCEPT_VALID_03');
  });

  it('reproduces the same definitionRevision for the same inputs deterministically', () => {
    const concept = makeConcept();
    const revA = computeConceptDefinitionRevision(concept);
    const revB = computeConceptDefinitionRevision(concept);
    expect(revA).toBe(revB);
    expect(revA).toBe(concept.definitionRevision);
  });
});

describe('TermObservationV1 — CONCEPT-SCHEMA-01 fixtures', () => {
  it('accepts a valid AST structural observation, canonicalAuthority forced false', () => {
    const observation = {
      schema: 'atlas.term-observation.v1' as const,
      observationId: 'obs:ast:1',
      term: 'function',
      normalizedTerm: 'function',
      kind: 'ast_node_kind' as const,
      sourceRef: 'src/lib/server/atlas/domain-taxonomy.ts',
      sourceRevision: null, // genuinely unavailable — not fabricated
      evidenceRefs: ['ast-grep:call-site:12'],
      producer: 'ast-grep-observation-adapter',
      producerRevision: 'ast-grep-adapter-v1',
      confidence: 1,
      canonicalAuthority: false as const,
    };
    expect(() => TermObservationV1Schema.parse(observation)).not.toThrow();
  });

  it('accepts a valid NLP phrase observation with a real sourceRevision', () => {
    const observation = {
      schema: 'atlas.term-observation.v1' as const,
      observationId: 'obs:nlp:1',
      term: 'nearest vector search',
      normalizedTerm: 'nearest vector search',
      kind: 'phrase' as const,
      sourceRef: 'query:live-search-session-42',
      sourceRevision: 'sha256:deadbeef',
      evidenceRefs: ['embeddinggemma:query-embedding'],
      producer: 'miniforge-nlp-sidecar::classify',
      producerRevision: 'domain-classifier-nblr-v1-1788454983',
      confidence: 0.62,
      canonicalAuthority: false as const,
    };
    expect(() => TermObservationV1Schema.parse(observation)).not.toThrow();
  });

  it('rejects canonicalAuthority: true on a TermObservationV1 (structurally impossible)', () => {
    const observation = {
      schema: 'atlas.term-observation.v1' as const,
      observationId: 'obs:bad:1',
      term: 'x',
      normalizedTerm: 'x',
      kind: 'token' as const,
      sourceRef: 'x',
      sourceRevision: null,
      evidenceRefs: [],
      producer: 'x',
      producerRevision: 'x',
      confidence: 0.5,
      canonicalAuthority: true as any,
    };
    expect(() => TermObservationV1Schema.parse(observation)).toThrow();
  });
});

describe('ConceptRecognitionV1 — CONCEPT-SCHEMA-01 fixtures', () => {
  it('accepts an exact-alias recognition reaching ADMITTED', () => {
    const recognition = {
      schema: 'atlas.concept-recognition.v1' as const,
      recognitionId: 'rec:1',
      observationId: 'obs:nlp:2',
      observedTerm: 'search',
      normalizedTerm: 'search',
      candidateConceptIds: ['concept:domain:retrieval'],
      selectedConceptId: 'concept:domain:retrieval',
      matchMethod: 'alias' as const,
      confidence: 0.98,
      lexicalScore: 1,
      semanticScore: null,
      structuralScore: null,
      domainScore: null,
      evidenceRefs: ['obs:nlp:2'],
      conceptRegistryRevision: 'registry:r1',
      resolverRevision: 'resolver:r1',
      status: 'ADMITTED' as const,
      canonicalAuthority: false as const,
    };
    expect(() => ConceptRecognitionV1Schema.parse(recognition)).not.toThrow();
  });

  it('forces status: PROPOSED for a semantic match, rejects ADMITTED (CONCEPT_VALID_10)', () => {
    const admittedSemantic = {
      schema: 'atlas.concept-recognition.v1' as const,
      recognitionId: 'rec:2',
      observationId: 'obs:nlp:3',
      observedTerm: 'nearest vector search',
      normalizedTerm: 'nearest vector search',
      candidateConceptIds: ['concept:domain:retrieval'],
      selectedConceptId: 'concept:domain:retrieval',
      matchMethod: 'semantic' as const,
      confidence: 0.94,
      lexicalScore: null,
      semanticScore: 0.94,
      structuralScore: null,
      domainScore: null,
      evidenceRefs: ['obs:nlp:3'],
      conceptRegistryRevision: 'registry:r1',
      resolverRevision: 'resolver:r1',
      status: 'ADMITTED' as const, // this is the exact failure mode being rejected
      canonicalAuthority: false as const,
    };
    expect(() => ConceptRecognitionV1Schema.parse(admittedSemantic)).toThrow();

    const proposedSemantic = { ...admittedSemantic, status: 'PROPOSED' as const };
    expect(() => ConceptRecognitionV1Schema.parse(proposedSemantic)).not.toThrow();
  });

  it('accepts an UNMAPPED recognition with no selectedConceptId', () => {
    const recognition = {
      schema: 'atlas.concept-recognition.v1' as const,
      recognitionId: 'rec:3',
      observationId: 'obs:nlp:4',
      observedTerm: 'mcp_agents',
      normalizedTerm: 'mcp_agents',
      candidateConceptIds: [],
      selectedConceptId: null,
      matchMethod: 'lexical' as const,
      confidence: 0,
      lexicalScore: 0,
      semanticScore: null,
      structuralScore: null,
      domainScore: null,
      evidenceRefs: [],
      conceptRegistryRevision: 'registry:r1',
      resolverRevision: 'resolver:r1',
      status: 'UNMAPPED' as const,
      canonicalAuthority: false as const,
    };
    expect(() => ConceptRecognitionV1Schema.parse(recognition)).not.toThrow();
  });

  it('rejects UNMAPPED with a selectedConceptId set (contradictory)', () => {
    const recognition = {
      schema: 'atlas.concept-recognition.v1' as const,
      recognitionId: 'rec:4',
      observationId: 'obs:nlp:5',
      observedTerm: 'x',
      normalizedTerm: 'x',
      candidateConceptIds: [],
      selectedConceptId: 'concept:domain:retrieval', // contradicts UNMAPPED
      matchMethod: 'lexical' as const,
      confidence: 0,
      lexicalScore: 0,
      semanticScore: null,
      structuralScore: null,
      domainScore: null,
      evidenceRefs: [],
      conceptRegistryRevision: 'registry:r1',
      resolverRevision: 'resolver:r1',
      status: 'UNMAPPED' as const,
      canonicalAuthority: false as const,
    };
    expect(() => ConceptRecognitionV1Schema.parse(recognition)).toThrow();
  });

  it('rejects an ADMITTED structural_mapping whose selectedConceptId is not in candidateConceptIds (CONCEPT_VALID_09)', () => {
    const recognition = {
      schema: 'atlas.concept-recognition.v1' as const,
      recognitionId: 'rec:5',
      observationId: 'obs:ast:2',
      observedTerm: 'function',
      normalizedTerm: 'function',
      candidateConceptIds: ['concept:program:function'],
      // Simulates the exact failure mode named by the operator: a raw tree-node id substituted
      // directly as concept identity instead of the real, registry-resolved concept.
      selectedConceptId: 'tree_node:src/lib/x.ts#L42',
      matchMethod: 'structural_mapping' as const,
      confidence: 1,
      lexicalScore: null,
      semanticScore: null,
      structuralScore: 1,
      domainScore: null,
      evidenceRefs: ['ast-grep:call-site:42'],
      conceptRegistryRevision: 'registry:r1',
      resolverRevision: 'resolver:r1',
      status: 'ADMITTED' as const,
      canonicalAuthority: false as const,
    };
    expect(() => ConceptRecognitionV1Schema.parse(recognition)).toThrow();
  });
});
