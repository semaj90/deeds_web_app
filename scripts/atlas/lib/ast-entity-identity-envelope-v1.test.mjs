import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAstEntityIdentityRowV1,
  buildAstEntityPrefillIdentityEnvelopeV1,
  buildAstEntityPrefillIdentityFieldsV1,
} from './ast-entity-identity-envelope-v1.mjs';

test('prefill keeps packet tree identity separate from declaration occurrence identity', () => {
  assert.deepEqual(buildAstEntityPrefillIdentityFieldsV1({
    packetTreeNodeId: 'packet-tree:1',
    occurrenceId: 'sha256:occurrence',
  }), {
    tree_node_occurrence_id: 'sha256:occurrence',
    packet_tree_node_id: 'packet-tree:1',
  });
  assert.throws(() => buildAstEntityPrefillIdentityFieldsV1({ packetTreeNodeId: 'packet-tree:1' }), /TREE_NODE_OCCURRENCE_ID_REQUIRED/);
});

test('prefill envelope strips ambiguous packet tree_node_id before emitting identity fields', () => {
  const row = buildAstEntityPrefillIdentityEnvelopeV1({
    packet_key: 'packet:1',
    tree_node_id: 'packet-tree:1',
  }, 'sha256:occurrence');

  assert.equal(row.packet_key, 'packet:1');
  assert.equal(row.packet_tree_node_id, 'packet-tree:1');
  assert.equal(row.tree_node_occurrence_id, 'sha256:occurrence');
  assert.equal('tree_node_id' in row, false);
});

test('identity enrichment does not overwrite occurrence identity or emit ambiguous tree_node_id', () => {
  const row = buildAstEntityIdentityRowV1({
    packet_key: 'packet:1',
    source_ref: 'src/a.ts',
    source_revision: 'sha256:source',
    tree_node_id: 'sha256:occurrence-legacy-alias',
    tree_node_occurrence_id: 'sha256:occurrence',
  }, {
    packet_key: 'packet:1',
    feature_id: 'feature:1',
    title_id: 'title:1',
    tree_node_id: 'packet-tree:1',
  });

  assert.equal(row.tree_node_occurrence_id, 'sha256:occurrence');
  assert.equal(row.packet_tree_node_id, 'packet-tree:1');
  assert.equal('tree_node_id' in row, false);
  assert.equal(row.source_revision, 'sha256:source');
});

test('unresolved enrichment preserves occurrence ID and leaves packet identity null', () => {
  const row = buildAstEntityIdentityRowV1({
    tree_node_occurrence_id: 'sha256:occurrence',
    source_revision: null,
  }, null);

  assert.equal(row.tree_node_occurrence_id, 'sha256:occurrence');
  assert.equal(row.packet_tree_node_id, null);
  assert.equal(row.identity_status, 'UNRESOLVED_CANDIDATE');
  assert.equal(row.source_revision, null);
});

test('enrichment never guesses that a legacy tree_node_id is an occurrence ID', () => {
  const row = buildAstEntityIdentityRowV1({ tree_node_id: 'ambiguous:legacy-id' }, null);

  assert.equal(row.tree_node_occurrence_id, null);
  assert.equal('tree_node_id' in row, false);
});
