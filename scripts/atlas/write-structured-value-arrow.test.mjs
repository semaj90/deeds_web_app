import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStructuredValueArrowTable,
  nestedSchemaReceipt,
  serializeStructuredValueArrowFile,
} from './write-structured-value-arrow.mjs';

const SHA = 'a'.repeat(64);

function provenance(nodeType, start, end) {
  return {
    source_ref: 'src/example.ts', source_revision: 'src-r1', workspace_revision: 'ws-r1', language: 'typescript',
    parser_name: 'NODE_TREE_SITTER', parser_revision: '0.25.1', grammar_revision: 'g1', node_type: nodeType,
    start_byte: start, end_byte: end, source_span_checksum: SHA, tree_node_id: null, upstream_node_id: null,
    upstream_chunk_id: null, identity_status: 'SPAN_ONLY', ast_path_json: '[]',
  };
}

function rows() {
  return [
    {
      value_ordinal: 0,
      value_id: 'v0',
      kind: 'OBJECT',
      source_text: '{items:[1]}',
      null_value: false,
      boolean_value: null,
      number_value: null,
      string_value: null,
      expression_node_type: null,
      provenance: provenance('object', 0, 11),
      members: [],
      entries: [{
        ordinal: 0, entry_kind: 'PROPERTY', key_text: 'items', key_node_type: 'property_identifier', computed: false, spread: false,
        child_value_ordinal: 1, entry_source_span_checksum: SHA,
      }],
    },
    {
      value_ordinal: 1,
      value_id: 'v1',
      kind: 'ARRAY',
      source_text: '[1]',
      null_value: false,
      boolean_value: null,
      number_value: null,
      string_value: null,
      expression_node_type: null,
      provenance: provenance('array', 7, 10),
      members: [{ ordinal: 0, role: 'ELEMENT', field_name: null, child_value_ordinal: 2 }],
      entries: [],
    },
    {
      value_ordinal: 2,
      value_id: 'v2',
      kind: 'NUMBER',
      source_text: '1',
      null_value: false,
      boolean_value: null,
      number_value: 1,
      string_value: null,
      expression_node_type: null,
      provenance: provenance('number', 8, 9),
      members: [],
      entries: [],
    },
  ];
}

test('Arrow physical schema uses Struct provenance and List<Struct> child references', () => {
  const table = buildStructuredValueArrowTable(rows());
  const receipt = nestedSchemaReceipt(table);
  assert.equal(receipt.nested_columns.provenance_struct, true);
  assert.equal(receipt.nested_columns.members_list_struct, true);
  assert.equal(receipt.nested_columns.entries_list_struct, true);
});

test('serializes file IPC and roundtrips row count', () => {
  const result = serializeStructuredValueArrowFile(rows());
  assert.ok(result.bytes.byteLength > 0);
  assert.equal(result.receipt.ipc_format, 'ARROW_IPC_FILE');
  assert.equal(result.receipt.row_count, 3);
  assert.equal(result.receipt.roundtrip_row_count, 3);
  assert.match(result.receipt.ipc_file_checksum, /^[a-f0-9]{64}$/);
});
