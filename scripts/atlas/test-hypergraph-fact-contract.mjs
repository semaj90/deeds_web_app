import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHypergraphFactV1,
  projectFactToNeo4j,
  factToSemanticFactsRow,
  HYPERGRAPH_FACT_SCHEMA_V1,
} from '../../sveltekit-frontend/src/lib/server/atlas/contracts/hypergraph-fact-v1.js';

test('createHypergraphFactV1 generates deterministic identity and validates schema', () => {
  const fact = createHypergraphFactV1({
    predicate: 'DEFINES_FUNCTION',
    participants: [
      { entityId: 'src/lib/auth.ts', role: 'SOURCE_MODULE', entityKind: 'FILE' },
      { entityId: 'fn_validateUserSession', role: 'FUNCTION_SYMBOL', entityKind: 'CONCEPT' },
    ],
    evidence: [
      {
        evidenceId: 'ev:line12-24',
        sourceRef: 'src/lib/auth.ts',
        contentHash: 'a'.repeat(64),
        lineRange: [12, 24],
      },
    ],
    workspaceRevision: 'ws:commit1',
    graphRevision: 'graph:snapshot1',
    sourceRevision: 'src:rev1',
    producerRevision: 'test-runner-v1',
    domainClass: 'AUTHENTICATION',
    confidenceScore: 0.95,
  });

  assert.equal(fact.schema, HYPERGRAPH_FACT_SCHEMA_V1);
  assert.equal(fact.predicate, 'DEFINES_FUNCTION');
  assert.equal(fact.participants.length, 2);
  assert.equal(fact.factId.startsWith('fact_'), true);
  assert.equal(fact.checksum.length, 64);
  assert.equal(fact.confidenceScore, 0.95);

  const neo4jProj = projectFactToNeo4j(fact);
  assert.equal(neo4jProj.factNode.labels[0], 'HypergraphFact');
  assert.equal(neo4jProj.factNode.labels[1], 'DEFINES_FUNCTION');
  assert.equal(neo4jProj.relationships.length, 2);
  assert.equal(neo4jProj.relationships[0].type, 'INCIDENT_IN');

  const pgRow = factToSemanticFactsRow(fact);
  assert.equal(pgRow.packetKey, fact.factId);
  assert.equal(pgRow.domainClass, 'AUTHENTICATION');
  assert.equal(pgRow.similarityConfidence, 0.95);
});
