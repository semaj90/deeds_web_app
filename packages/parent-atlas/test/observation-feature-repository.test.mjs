import assert from 'node:assert/strict';
import test from 'node:test';

import { createObservationFeatureRepository } from '../dist/index.js';

const schema = { schema: 'PACKET_KEY_ORF_V1' };
const checksum = 'a'.repeat(64);

function row(workspaceRevision = '17') {
  return {
    schema: 'atlas.observation-feature-row.v1',
    candidate_id: 'candidate-1',
    row_ordinal: 0,
    source_ref: 'src/example.ts',
    source_revision: 'source-r1',
    workspace_revision: workspaceRevision,
    row_identity_checksum: checksum,
    registry_revision: 'registry-r1',
    ast_features: [],
    ontology_features: [],
    langextract_features: [],
    graph_features: [],
    cluster_features: [],
    context_features: [],
    qdrant_tags: [],
    observation_refs: ['observation-1'],
    canonical_authority: false,
  };
}

test('repository requires an explicit packet-key schema opt-in', () => {
  assert.throws(() => createObservationFeatureRepository({}), /SCHEMA_OPT_IN_REQUIRED/);
  assert.throws(() => createObservationFeatureRepository({}, { schema: 'LEGACY_CANDIDATE_VECTOR_V1' }), /SCHEMA_OPT_IN_REQUIRED/);
});

test('writer preserves opaque workspace revision strings exactly', async () => {
  let captured;
  let statement;
  const repository = createObservationFeatureRepository({
    query: async (sql, values) => {
      statement = sql;
      captured = values;
      return { rows: [] };
    },
  }, schema);

  await repository.upsertFeatureRow({
    row: row('workspace-r1'),
    packetKey: 'packet-1',
    featureRevision: 'features-r1',
  });
  assert.equal(captured[3], 'source-r1');
  assert.equal(captured[4], 'registry-r1');
  assert.equal(captured[6], 'workspace-r1');
  for (const column of [
    'source_revision',
    'registry_revision',
    'source_version_receipt_id',
    'workspace_revision',
    'representation_id',
    'representation_revision',
    'tree_node_id',
  ]) {
    assert.match(statement, new RegExp(`${column} = EXCLUDED\\.${column}`));
  }
});

test('candidate lookup rejects an empty explicit revision instead of dropping the filter', async () => {
  let calls = 0;
  const repository = createObservationFeatureRepository({ query: async () => { calls += 1; return { rows: [] }; } }, schema);

  await assert.rejects(repository.findCandidates({
    featureRevision: 'features-r1',
    workspaceRevision: '   ',
  }), /WORKSPACE_REVISION_REQUIRED/);
  assert.equal(calls, 0);
});

test('candidate lookup binds an opaque workspace revision exactly as text', async () => {
  let captured;
  const repository = createObservationFeatureRepository({
    query: async (_sql, values) => {
      captured = values;
      return { rows: [] };
    },
  }, schema);

  await repository.findCandidates({ featureRevision: 'features-r1', workspaceRevision: 'workspace-r1' });
  assert.equal(captured[1], 'workspace-r1');
});

test('semantic search remains owned by the canonical vector lane', async () => {
  const repository = createObservationFeatureRepository({ query: async () => ({ rows: [] }) }, schema);
  await assert.rejects(repository.exactSemanticSearch(), /OWNED_BY_CANONICAL_VECTOR_LANE/);
});
