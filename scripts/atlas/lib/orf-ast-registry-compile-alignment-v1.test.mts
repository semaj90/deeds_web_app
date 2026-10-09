import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildObservationFeatureRegistry,
  compileObservationFeatures,
  observationFeatureChecksum,
} from '../../../packages/parent-atlas/src/core/observation-feature-compiler.ts';
import { ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1 } from './orf-ast-feature-definition-proposal-v1.mjs';

const sourceRevision = `sha256:${'a'.repeat(64)}`;

const examples = [
  ['CLASS_DECL', 'ast.class_decl'],
  ['FUNCTION_DECL', 'ast.function_decl'],
  ['INTERFACE_DECL', 'ast.interface_decl'],
  ['TYPE_ALIAS', 'ast.type_alias'],
  ['VARIABLE_DECL', 'ast.variable_decl'],
] as const;

test('proposal AST IDs compile to the exact proposed feature IDs without runtime approval', () => {
  const definitions = ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1.map(({ feature_id, family, value_kind, description, evidence_requirements, missing_value_policy }) => ({
    feature_id,
    family,
    value_kind,
    description,
    evidence_requirements,
    missing_value_policy,
  }));
  const registry = buildObservationFeatureRegistry({
    registryRevision: 'proposal-only:compile-alignment',
    definitions,
  });

  for (const [observationKind, expectedFeatureId] of examples) {
    const row = compileObservationFeatures({
      candidateId: 'proposal-only:candidate',
      rowOrdinal: 0,
      sourceRef: 'src/example.ts',
      sourceRevision,
      workspaceRevision: 'proposal-only:workspace',
      rowIdentityChecksum: observationFeatureChecksum({ observationKind, sourceRevision }),
      registry,
      astObservations: [{
        schema: 'atlas.ast-grep-observation.v1',
        observation_id: `proposal-only:${observationKind}`,
        rule_id: `fixture:${observationKind}`,
        source_ref: 'src/example.ts',
        source_revision: sourceRevision,
        byte_start: 0,
        byte_end: 1,
        matched_text_hash: 'b'.repeat(64),
        captures: { name: 'x' },
        observation_kind: observationKind,
        confidence: 1,
        extractor_revision: 'fixture:ast-grep-v1',
        canonical_authority: false,
      }],
    });

    assert.equal(row.ast_features.length, 1);
    assert.equal(row.ast_features[0].feature_id, expectedFeatureId);
    assert.equal(row.ast_features[0].feature_ordinal, registry.definitions.find((definition) => definition.feature_id === expectedFeatureId)?.ordinal);
    assert.equal(row.canonical_authority, false);
  }

  assert.ok(ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1.every((definition) => definition.review_state === 'REVIEW_REQUIRED'));
});
