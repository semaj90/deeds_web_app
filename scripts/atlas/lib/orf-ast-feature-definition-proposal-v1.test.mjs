import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1 as definitions,
  buildOrfAstFeatureRegistryProposalEnvelopeV1,
} from './orf-ast-feature-definition-proposal-v1.mjs';
import {
  mapAstGrepDeclarationToOrfKindV1,
  ORF_AST_KIND_CROSSWALK_V1,
  ORF_AST_PREFILL_NODE_KIND_TO_SYMBOL_KIND_V1,
  ORF_AST_PREFILL_UNMAPPED_NODE_KINDS_V1,
} from './orf-ast-kind-crosswalk-v1.mjs';

test('proposes exactly the five census AST kinds with explicit mappings', () => {
  const outputs = new Set(definitions.map((definition) => definition.feature_id.slice('ast.'.length).toUpperCase()));
  assert.deepEqual([...outputs].sort(), ['CLASS_DECL', 'FUNCTION_DECL', 'INTERFACE_DECL', 'TYPE_ALIAS', 'VARIABLE_DECL']);
  for (const definition of definitions) {
    for (const producerKind of definition.producer_mapping) {
      assert.equal(`ast.${mapAstGrepDeclarationToOrfKindV1(producerKind).toLowerCase()}`, definition.feature_id);
      assert.ok(!['class', 'function', 'interface', 'type', 'variable', 'constant', 'method'].includes(producerKind));
    }
  }
  assert.equal(definitions.find((definition) => definition.feature_id === 'ast.function_decl').producer_mapping.join(','), 'function_declaration,generator_function_declaration,method_definition');
  assert.equal(definitions.find((definition) => definition.feature_id === 'ast.variable_decl').producer_mapping.join(','), 'variable_declarator');
  assert.deepEqual(definitions.find((definition) => definition.feature_id === 'ast.variable_decl').symbol_kind_hints, ['variable']);
  assert.match(definitions.find((definition) => definition.feature_id === 'ast.variable_decl').description, /variable binding/);
});

test('root prefill node vocabulary is completely mapped or explicitly fail-closed', () => {
  const mappedKinds = new Set(definitions.flatMap((definition) => definition.producer_mapping));
  const unmappedKinds = new Set(ORF_AST_PREFILL_UNMAPPED_NODE_KINDS_V1);
  const rootKinds = Object.keys(ORF_AST_PREFILL_NODE_KIND_TO_SYMBOL_KIND_V1);
  for (const nodeKind of rootKinds) {
    assert.equal(mappedKinds.has(nodeKind) || unmappedKinds.has(nodeKind), true, `unclassified root AST kind: ${nodeKind}`);
    if (mappedKinds.has(nodeKind)) assert.ok(ORF_AST_KIND_CROSSWALK_V1[nodeKind], `missing feature mapping: ${nodeKind}`);
    if (unmappedKinds.has(nodeKind)) assert.equal(ORF_AST_KIND_CROSSWALK_V1[nodeKind], undefined);
  }
  for (const nodeKind of mappedKinds) assert.ok(rootKinds.includes(nodeKind), `proposal kind not emitted by root prefill: ${nodeKind}`);
});

test('proposal cannot be consumed as an approved runtime registry', () => {
  const envelope = buildOrfAstFeatureRegistryProposalEnvelopeV1({ registry_revision: 'proposal:fixture', registry_checksum: '0'.repeat(64), definitions: [] });
  assert.equal(envelope.status, 'PROPOSAL_ONLY_REQUIRES_REVIEW');
  assert.equal(envelope.runtime_eligible, false);
  assert.equal(envelope.reviewer_id, null);
  assert.equal(envelope.review_receipt, null);
  assert.equal(envelope.canonical_authority, false);
  assert.ok(envelope.ast_grep_mappings.every((mapping) => mapping.review_state === 'REVIEW_REQUIRED'));
  assert.ok(envelope.symbol_kind_hints.every((mapping) => mapping.review_state === 'REVIEW_REQUIRED'));
  assert.equal(envelope.ast_grep_mappings.some((mapping) => mapping.ast_kinds.includes('variable')), false);
  assert.match(envelope.proposal_revision, /^proposal:sha256:[a-f0-9]{64}$/);
  assert.equal(envelope.proposal_checksum, envelope.proposal_revision.slice('proposal:sha256:'.length));
  assert.equal(envelope.canonical_authority, false);
  assert.equal(envelope.runtime_eligible, false);
});

test('proposal checksum binds AST mappings independently from the feature registry checksum', () => {
  const registry = { registry_revision: 'proposal:fixture', registry_checksum: 'a'.repeat(64), definitions: [] };
  const baseline = buildOrfAstFeatureRegistryProposalEnvelopeV1(registry);
  const changedDefinitions = definitions.map((definition, index) => index === 0
    ? { ...definition, producer_mapping: ['different_ast_node'], symbol_kind_hints: ['different_symbol_kind'] }
    : definition);
  const changed = buildOrfAstFeatureRegistryProposalEnvelopeV1(registry, changedDefinitions);
  assert.equal(changed.registry.registry_checksum, baseline.registry.registry_checksum);
  assert.notEqual(changed.proposal_checksum, baseline.proposal_checksum);
});
