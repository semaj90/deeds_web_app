import { describe, expect, it } from 'vitest';
import {
  NarySemanticRelationV1Schema,
  SemanticFactV1Schema,
  planSemanticKnowledgeExecution,
  projectSemanticFactToNetworkX,
  projectSemanticFactToRdfQuad,
} from './semantic-graph-evidence.js';

const asserted = SemanticFactV1Schema.parse({
  schema: 'atlas.semantic-fact.v1',
  factId: 'fact-1',
  subjectCanonicalId: 'symbol:S331',
  predicateIri: 'urn:atlas:predicate:defines',
  object: { kind: 'CANONICAL_ID', canonicalId: 'file:F12' },
  sourceRef: 'src/lib/server/search.ts#L20-L44',
  treeNodeId: 'T8421',
  symbolVersionId: 'S331',
  packetKey: 'P992',
  workspaceRevision: '742',
  sourceRevision: '901',
  graphRevision: '338',
  ontologyRevision: 'onto-7',
  domainClass: 'retrieval',
  assertionKind: 'ASSERTED',
  inference: null,
  canonicalWritesAllowed: false,
  producerRevision: 'test',
});

describe('semantic graph evidence boundaries', () => {
  it('projects asserted evidence to an RDF named graph while preserving source and AST coordinates', () => {
    const quad = projectSemanticFactToRdfQuad(asserted);
    expect(quad.subjectIri).toContain('symbol_3AS331');
    expect(quad.namedGraphIri).toContain('742');
    expect(quad.namedGraphIri).toContain('901');
    expect(quad.sourceRef).toBe(asserted.sourceRef);
    expect(quad.treeNodeId).toBe('T8421');
    expect(quad.assertionKind).toBe('ASSERTED');
    expect(quad.canonicalWritesAllowed).toBe(false);
  });

  it('projects resource-valued facts to NetworkX edges without turning analytics into semantic truth', () => {
    const edge = projectSemanticFactToNetworkX(asserted);
    expect(edge.projectionKind).toBe('EDGE');
    if (edge.projectionKind === 'EDGE') {
      expect(edge.sourceNode).toBe('symbol:S331');
      expect(edge.targetNode).toBe('file:F12');
      expect(edge.attributes.sourceRef).toBe(asserted.sourceRef);
      expect(edge.attributes.treeNodeId).toBe('T8421');
      expect(edge.attributes.semanticTruth).toBe(false);
    }
  });

  it('keeps literal RDF properties as node attributes rather than inventing graph vertices', () => {
    const literal = SemanticFactV1Schema.parse({
      ...asserted,
      factId: 'fact-literal',
      predicateIri: 'urn:atlas:predicate:domain-class',
      object: { kind: 'LITERAL', lexicalValue: 'retrieval', datatypeIri: null, language: null },
    });
    const projection = projectSemanticFactToNetworkX(literal);
    expect(projection.projectionKind).toBe('NODE_ATTRIBUTE');
  });

  it('requires reasoner and premise provenance for every inferred fact', () => {
    expect(() => SemanticFactV1Schema.parse({
      ...asserted,
      factId: 'fact-inferred-bad',
      assertionKind: 'INFERRED',
      inference: null,
    })).toThrow();

    const inferred = SemanticFactV1Schema.parse({
      ...asserted,
      factId: 'fact-inferred-good',
      assertionKind: 'INFERRED',
      inference: {
        engine: 'OWLREADY2_HERMIT',
        profile: 'OWL_DL',
        premiseFactIds: ['fact-1'],
        reasonerRevision: 'hermit-fixture-1',
      },
    });
    expect(inferred.inference?.premiseFactIds).toEqual(['fact-1']);
    expect(inferred.canonicalWritesAllowed).toBe(false);
  });

  it('does not fabricate a tree_node_id when structural provenance is absent', () => {
    const noTree = SemanticFactV1Schema.parse({ ...asserted, factId: 'fact-no-tree', treeNodeId: null });
    const quad = projectSemanticFactToRdfQuad(noTree);
    expect(quad.treeNodeId).toBeNull();
  });

  it('preserves true n-ary degree and forbids silent pairwise flattening', () => {
    const relation = NarySemanticRelationV1Schema.parse({
      schema: 'atlas.nary-semantic-relation.v1',
      hyperedgeId: 'H-ternary-1',
      relationTypeIri: 'urn:atlas:relation:repair-evidence',
      relationshipDegree: 3,
      members: [
        { canonicalId: 'symbol:S331', role: 'subject', sourceRef: 'a#L1', treeNodeId: 'T1' },
        { canonicalId: 'test:T22', role: 'validator', sourceRef: 'b#L2', treeNodeId: 'T2' },
        { canonicalId: 'failure:E9', role: 'failure', sourceRef: 'c#L3', treeNodeId: null },
      ],
      workspaceRevision: '742',
      graphRevision: '338',
      rdfProjection: 'RELATION_NODE_WITH_ROLE_MEMBERS',
      pairwiseFlatteningAllowed: false,
      canonicalWritesAllowed: false,
      producerRevision: 'test',
    });
    expect(relation.relationshipDegree).toBe(3);
    expect(relation.pairwiseFlatteningAllowed).toBe(false);

    expect(() => NarySemanticRelationV1Schema.parse({ ...relation, relationshipDegree: 2 })).toThrow();
  });

  it('routes RDF, graph analytics, OWL-DL, and n-ary expansion to distinct engines', () => {
    const plan = planSemanticKnowledgeExecution({
      operations: [
        'PROVENANCE_DATASET',
        'SPARQL_QUERY',
        'GRAPH_PAGERANK',
        'GRAPH_SCC',
        'OWL_DL_CLASSIFICATION',
        'HYPERGRAPH_EXPANSION',
      ],
      gpuGraphAvailable: true,
      owlDlReasonerPreference: 'HERMIT',
      producerRevision: 'test',
    });

    expect(plan.stages.find((stage) => stage.operation === 'SPARQL_QUERY')?.engine).toBe('RDFLIB_DATASET');
    expect(plan.stages.find((stage) => stage.operation === 'GRAPH_PAGERANK')?.engine).toBe('CUGRAPH_GPU');
    expect(plan.stages.find((stage) => stage.operation === 'OWL_DL_CLASSIFICATION')?.engine).toBe('OWLREADY2_HERMIT');
    expect(plan.stages.find((stage) => stage.operation === 'HYPERGRAPH_EXPANSION')?.engine).toBe('ATLAS_HYPERGRAPH');
    expect(plan.stages.every((stage) => stage.canonicalFactCreationAllowed === false)).toBe(true);
    expect(plan.fabricateMissingTreeNodeId).toBe(false);
    expect(plan.hyperedgesRemainNary).toBe(true);
  });

  it('uses NetworkX as the graph reference when the GPU executor is unavailable', () => {
    const plan = planSemanticKnowledgeExecution({
      operations: ['GRAPH_PATHS', 'GRAPH_COMMUNITY'],
      gpuGraphAvailable: false,
      producerRevision: 'test',
    });
    expect(plan.stages.every((stage) => stage.engine === 'NETWORKX_REFERENCE')).toBe(true);
  });
});
