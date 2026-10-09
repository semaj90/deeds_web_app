import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildObservationFeatureRegistry,
  observationFeatureChecksum,
} from '../../../packages/parent-atlas/src/core/observation-feature-compiler.ts';
import { ORF_AST_FEATURE_DEFINITION_PROPOSAL_V1 as candidates } from './orf-ast-feature-definition-proposal-v1.mjs';

function buildCandidateRegistry(descriptionOverride?: string) {
  const definitions = candidates.map(({ feature_id, family, value_kind, description, evidence_requirements, missing_value_policy }, index) => ({
    feature_id,
    family,
    value_kind,
    description: index === 0 && descriptionOverride ? descriptionOverride : description,
    evidence_requirements,
    missing_value_policy,
  }));
  return buildObservationFeatureRegistry({
    registryRevision: `proposal:sha256:${observationFeatureChecksum(definitions)}`,
    definitions,
  });
}

test('uses the existing builder to derive dense, deterministic proposal ordinals/checksum', () => {
  const first = buildCandidateRegistry();
  const reordered = buildObservationFeatureRegistry({
    registryRevision: first.registry_revision,
    definitions: [...candidates].reverse().map(({ feature_id, family, value_kind, description, evidence_requirements, missing_value_policy }) => ({ feature_id, family, value_kind, description, evidence_requirements, missing_value_policy })),
  });
  assert.deepEqual(reordered, first);
  assert.deepEqual(first.definitions.map((definition) => definition.ordinal), [0, 1, 2, 3, 4]);
  assert.equal(first.definitions.length, 5);
  assert.equal(first.registry_checksum, observationFeatureChecksum({ registry_revision: first.registry_revision, definitions: first.definitions }));
});

test('a semantic definition change changes both proposed revision and checksum', () => {
  const original = buildCandidateRegistry();
  const changed = buildCandidateRegistry('REVIEW REQUIRED: changed semantics');
  assert.notEqual(changed.registry_revision, original.registry_revision);
  assert.notEqual(changed.registry_checksum, original.registry_checksum);
});

test('evidence requirements and missing-value policy are checksum-bound', () => {
  const original = buildCandidateRegistry();
  const definitions = candidates.map(({ feature_id, family, value_kind, description, evidence_requirements, missing_value_policy }) => ({
    feature_id,
    family,
    value_kind,
    description,
    evidence_requirements: feature_id === 'ast.class_decl' ? [...evidence_requirements, 'GRAPH_REVISION' as const] : evidence_requirements,
    missing_value_policy,
  }));
  const changed = buildObservationFeatureRegistry({ registryRevision: 'proposal:metadata-change', definitions });
  assert.notEqual(changed.registry_checksum, original.registry_checksum);
  assert.deepEqual(changed.definitions[0].evidence_requirements, ['OBSERVATION_ID', 'SOURCE_REF', 'SOURCE_REVISION', 'BYTE_SPAN', 'PRODUCER_REVISION', 'EVIDENCE_CHECKSUM', 'GRAPH_REVISION']);
  assert.equal(changed.definitions[0].missing_value_policy, 'UNAVAILABLE_NOT_ZERO');
});
