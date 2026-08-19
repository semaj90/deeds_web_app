import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  TreeSitterStructuredValueAdapter,
  attachTsMorphSemanticEnrichment,
  consiliencyParityReceiptSchema,
  okfStructuredValueDomainProjectionSchema,
} from '../dist/core/structured-value-ast.js';

function sha(text) {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function byteRange(source, fragment, from = 0) {
  const charStart = source.indexOf(fragment, from);
  if (charStart < 0) throw new Error(`fragment not found: ${fragment}`);
  return {
    start: Buffer.byteLength(source.slice(0, charStart), 'utf8'),
    end: Buffer.byteLength(source.slice(0, charStart + fragment.length), 'utf8'),
  };
}

function node(type, source, fragment, children = [], fields = []) {
  const range = byteRange(source, fragment);
  return {
    type,
    startIndex: range.start,
    endIndex: range.end,
    startPosition: { row: 0, column: range.start },
    endPosition: { row: 0, column: range.end },
    namedChildCount: children.length,
    namedChild(index) { return children[index] ?? null; },
    fieldNameForNamedChild(index) { return fields[index] ?? null; },
    childForFieldName(name) {
      const index = fields.indexOf(name);
      return index >= 0 ? children[index] : null;
    },
  };
}

function adapter(source, native = undefined) {
  return new TreeSitterStructuredValueAdapter({
    source_ref: 'src/example.ts',
    source_revision: 'src-r1',
    workspace_revision: 'ws-r1',
    language: 'typescript',
    parser_revision: 'tree-sitter-0.25.1',
    grammar_revision: 'grammar-r1',
    resolve_native_identity: native,
  });
}

test('preserves argument order and source spans without inventing tree identity', () => {
  const source = 'fn(a, 2, ...rest)';
  const a = node('identifier', source, 'a');
  const two = node('number', source, '2');
  const restId = node('identifier', source, 'rest');
  const spread = node('spread_element', source, '...rest', [restId]);
  const args = node('arguments', source, '(a, 2, ...rest)', [a, two, spread]);
  const value = adapter(source).adapt(args, source);

  assert.equal(value.kind, 'ARGUMENT_LIST');
  assert.deepEqual(value.members.map((member) => member.ordinal), [0, 1, 2]);
  assert.deepEqual(value.members.map((member) => member.role), ['ARGUMENT', 'ARGUMENT', 'SPREAD']);
  assert.equal(value.provenance.tree_node_id, null);
  assert.equal(value.provenance.identity_status, 'SPAN_ONLY');
});

test('preserves object property, computed key and spread ordinals', () => {
  const source = '{ a: 1, [key]: value, ...rest }';
  const keyA = node('property_identifier', source, 'a');
  const one = node('number', source, '1');
  const pairA = node('pair', source, 'a: 1', [keyA, one], ['key', 'value']);
  const computedKey = node('computed_property_name', source, '[key]');
  const valueId = node('identifier', source, 'value');
  const pairComputed = node('pair', source, '[key]: value', [computedKey, valueId], ['key', 'value']);
  const restId = node('identifier', source, 'rest');
  const spread = node('spread_element', source, '...rest', [restId]);
  const object = node('object', source, source, [pairA, pairComputed, spread]);
  const value = adapter(source).adapt(object, source);

  assert.equal(value.kind, 'OBJECT');
  assert.deepEqual(value.entries.map((entry) => entry.ordinal), [0, 1, 2]);
  assert.deepEqual(value.entries.map((entry) => entry.entry_kind), ['PROPERTY', 'COMPUTED', 'SPREAD']);
  assert.equal(value.entries[1].computed, true);
  assert.equal(value.entries[2].spread, true);
});

test('native structural identity may attach only to an exact span checksum', () => {
  const source = '[1]';
  const one = node('number', source, '1');
  const array = node('array', source, source, [one]);
  const rangeText = Buffer.from(source, 'utf8').subarray(array.startIndex, array.endIndex).toString('utf8');
  const good = adapter(source, (candidate) => candidate === array ? {
    tree_node_id: 'tree:1',
    upstream_node_id: 'cons-node:1',
    upstream_chunk_id: 'cons-chunk:1',
    start_byte: candidate.startIndex,
    end_byte: candidate.endIndex,
    source_span_checksum: sha(rangeText),
    parity_proven: false,
  } : null).adapt(array, source);
  assert.equal(good.provenance.identity_status, 'NATIVE_UPSTREAM');
  assert.equal(good.provenance.tree_node_id, 'tree:1');

  assert.throws(() => adapter(source, (candidate) => candidate === array ? {
    tree_node_id: 'tree:bad',
    start_byte: candidate.startIndex,
    end_byte: candidate.endIndex,
    source_span_checksum: 'a'.repeat(64),
  } : null).adapt(array, source), /NATIVE_ID_SPAN_MISMATCH/);
});

test('ts-morph semantic overlay rejects any Tree-sitter span identity drift', () => {
  const source = 'fn(1)';
  const one = node('number', source, '1');
  const value = adapter(source).adapt(one, source);
  const semantic = {
    schema: 'atlas.ts-morph-semantic-enrichment.v1',
    enrichment_id: 'enrich:1',
    source_ref: value.provenance.source_ref,
    source_revision: value.provenance.source_revision,
    workspace_revision: value.provenance.workspace_revision,
    start_byte: value.provenance.start_byte,
    end_byte: value.provenance.end_byte + 1,
    source_span_checksum: value.provenance.source_span_checksum,
    tree_node_id: value.provenance.tree_node_id,
    node_kind: 'NumericLiteral',
    ts_morph_revision: '27',
    typescript_revision: '7-dev',
    project_revision: 'project-r1',
    tsconfig_ref: 'tsconfig.json',
    inferred_type_text: '1',
    apparent_type_text: 'Number',
    symbol_name: null,
    declaration_refs: [],
    reference_refs: [],
    resolved_signature: null,
    exact_span_match: true,
    canonical_authority: false,
  };
  assert.throws(() => attachTsMorphSemanticEnrichment({ value, semantic, status: 'ENRICHED' }), /exact Tree-sitter source\/span/);
});

test('Consiliency parity receipt cannot authorize local minting of Consiliency IDs', () => {
  const receipt = consiliencyParityReceiptSchema.parse({
    receipt_id: 'parity:1',
    source_ref: 'src/example.ts',
    source_revision: 'r1',
    node_tree_sitter_revision: '0.25.1',
    consiliency_revision: '4.0.0',
    compared_node_count: 2,
    span_match_count: 2,
    node_type_match_count: 2,
    ordered_child_match_count: 2,
    upstream_id_match_count: 2,
    status: 'ID_PARITY',
    node_path_can_mint_consiliency_ids: false,
    producer_revision: 'p1',
  });
  assert.equal(receipt.node_path_can_mint_consiliency_ids, false);
});

test('.okf projection freezes authority boundaries', () => {
  const valid = okfStructuredValueDomainProjectionSchema.parse({
    domain_id: 'atlas.structured-value',
    domain_revision: 'r1',
    status: 'active',
    ontology_authority: '.okf',
    behavioral_authority: 'openspec',
    canonical_runtime_store: 'postgresql18',
    syntax_owner: 'tree-sitter',
    typescript_semantic_enricher: 'ts-morph',
    upstream_chunk_identity_owner: 'treesitter-chunker',
    arrow_projection_is_canonical: false,
    ts_morph_enrichment_is_canonical: false,
    node_tree_sitter_can_mint_consiliency_ids: false,
    source_refs: ['openspec/changes/atlas-feature-intelligence/structured-value-tasks.md'],
  });
  assert.equal(valid.arrow_projection_is_canonical, false);
  assert.throws(() => okfStructuredValueDomainProjectionSchema.parse({ ...valid, arrow_projection_is_canonical: true }));
});
