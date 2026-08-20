import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  buildStructuredValueArrowSnapshot,
  validateStructuredValueArrowRows,
} from '../dist/core/structured-value-arrow.js';

const SHA = createHash('sha256').update('value').digest('hex');

function provenance(node_type, start_byte, end_byte, path = []) {
  return {
    schema: 'atlas.tree-sitter-ast-provenance.v1',
    source_ref: 'src/example.ts',
    source_revision: 'src-r1',
    workspace_revision: 'ws-r1',
    language: 'typescript',
    parser_name: 'NODE_TREE_SITTER',
    parser_revision: '0.25.1',
    grammar_revision: 'grammar-r1',
    node_type,
    start_byte,
    end_byte,
    start_row: 0,
    start_column_bytes: start_byte,
    end_row: 0,
    end_column_bytes: end_byte,
    ast_path: path,
    source_span_checksum: SHA,
    tree_node_id: null,
    upstream_node_id: null,
    upstream_chunk_id: null,
    native_identity_span_checksum: null,
    identity_status: 'SPAN_ONLY',
    canonical_authority: false,
  };
}

test('flattens nested values into dense ordinals while keeping ordered child refs', () => {
  const child = {
    value_id: 'value:child',
    kind: 'NUMBER',
    source_text: '1',
    provenance: provenance('number', 4, 5, [{ named_child_index: 0, field_name: 'value', node_type: 'number' }]),
    canonical_authority: false,
    value: 1,
  };
  const root = {
    value_id: 'value:root',
    kind: 'OBJECT',
    source_text: '{a:1}',
    provenance: provenance('object', 0, 5),
    canonical_authority: false,
    entries: [{
      ordinal: 0,
      entry_kind: 'PROPERTY',
      key_text: 'a',
      key_node_type: 'property_identifier',
      computed: false,
      spread: false,
      provenance: provenance('pair', 1, 4),
      value: child,
    }],
  };

  const { snapshot, rows } = buildStructuredValueArrowSnapshot({
    snapshot_id: 'sv:1',
    snapshot_revision: 'sv-r1',
    source_snapshot_revision: 'src-r1',
    arrow_js_revision: '21.1.0',
    arrow_schema_revision: 'sv-arrow-r1',
    root,
    producer_revision: 'producer-r1',
  });

  assert.equal(snapshot.row_count, 2);
  assert.equal(snapshot.root_value_ordinal, 0);
  assert.deepEqual(rows.map((row) => row.value_ordinal), [0, 1]);
  assert.equal(rows[0].entries[0].child_value_ordinal, 1);
  assert.equal(snapshot.ordinal_is_canonical, false);
  assert.match(snapshot.row_identity_checksum, /^[a-f0-9]{64}$/);
  assert.match(snapshot.structure_checksum, /^[a-f0-9]{64}$/);
  assert.deepEqual(validateStructuredValueArrowRows(rows, 0), rows);
});

test('rejects out-of-range child ordinal', () => {
  const row = {
    value_ordinal: 0,
    value_id: 'v0',
    kind: 'ARRAY',
    source_text: '[]',
    null_value: false,
    boolean_value: null,
    number_value: null,
    string_value: null,
    expression_node_type: null,
    provenance: {
      source_ref: 'src/example.ts', source_revision: 'r1', workspace_revision: 'w1', language: 'typescript',
      parser_name: 'NODE_TREE_SITTER', parser_revision: '0.25.1', grammar_revision: 'g1', node_type: 'array',
      start_byte: 0, end_byte: 2, source_span_checksum: SHA, tree_node_id: null, upstream_node_id: null, upstream_chunk_id: null,
      identity_status: 'SPAN_ONLY', ast_path_json: '[]',
    },
    members: [{ ordinal: 0, role: 'ELEMENT', field_name: null, child_value_ordinal: 4 }],
    entries: [],
  };
  assert.throws(() => validateStructuredValueArrowRows([row], 0), /MEMBER_REF_OUT_OF_RANGE/);
});
