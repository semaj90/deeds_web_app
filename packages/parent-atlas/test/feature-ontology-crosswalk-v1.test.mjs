import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveFeatureOntologyCrosswalk, deriveFeatureOntologyCrosswalkRows } from '../../../scripts/atlas/lib/feature-ontology-crosswalk-v1.mjs';

const base = {
  feature_key: 'auth.sessions',
  title: 'Authentication Sessions',
  description: 'Session lifecycle for authenticated users.',
  status: 'implemented',
  source_refs: ['src/lib/server/auth.ts', 'src/routes/api/auth/session/+server.ts'],
  code_refs: ['src/lib/server/auth.ts#validateSession'],
  test_refs: ['tests/auth-session.spec.ts'],
  tags: ['identity', 'lucia'],
  cluster_id: 4,
  trust_tier: 'verified',
};

test('crosswalk classifies a feature without treating source paths as feature identity', () => {
  const first = deriveFeatureOntologyCrosswalk(base);
  const second = deriveFeatureOntologyCrosswalk(base);
  assert.deepEqual(first, second);
  assert.equal(first.featureKey, 'auth.sessions');
  assert.equal(first.featureId, null);
  assert.equal(first.domainKey, 'identity');
  assert.equal(first.capabilityKey, 'identity.authentication');
  assert.equal(first.classification.kind, 'SECURITY');
  assert.deepEqual(first.classification.surfaces, ['API', 'WEB']);
  assert.equal(first.canonicalAuthority, false);
});

test('crosswalk preserves many-to-many implementation evidence and marks missing revisions', () => {
  const result = deriveFeatureOntologyCrosswalk(base);
  assert.equal(result.implementations.length, 4);
  assert.equal(result.implementations[0].bindingStatus, 'UNVERIFIED_SOURCE_BINDING');
  assert.ok(result.implementations.some((item) => item.role === 'TEST'));
  assert.deepEqual(result.dependencies, []);
});

test('feature-level revisions do not qualify unrelated implementation paths', () => {
  const result = deriveFeatureOntologyCrosswalkRows([{ ...base, source_revision: `sha256:${'b'.repeat(64)}` }]);
  assert.equal(result.records[0].implementations.every((item) => item.sourceRevision === null), true);
  assert.equal(result.records[0].implementations.every((item) => item.bindingStatus === 'UNVERIFIED_SOURCE_BINDING'), true);
  assert.equal(result.records[0].classification.status, 'CLASSIFIED');
});

test('only exact source and workspace binding readbacks qualify implementations', () => {
  const sourceRevision = `sha256:${'c'.repeat(64)}`;
  const workspaceRevision = `sha256:${'d'.repeat(64)}`;
  const result = deriveFeatureOntologyCrosswalk(base, {
    workspaceRevision,
    sourceBindings: [{
      canonical_source_ref: 'src/lib/server/auth.ts',
      source_revision: sourceRevision,
      workspace_revision: workspaceRevision,
      content_digest: sourceRevision,
      binding_checksum: `sha256:${'e'.repeat(64)}`,
    }],
  });
  const matched = result.implementations.find((item) => item.sourceRef === 'src/lib/server/auth.ts');
  const unmatched = result.implementations.find((item) => item.sourceRef === 'src/routes/api/auth/session/+server.ts');
  assert.equal(matched.sourceRevision, sourceRevision);
  assert.equal(matched.workspaceRevision, workspaceRevision);
  assert.equal(matched.bindingStatus, 'SOURCE_BINDING_MATCHED');
  assert.equal(unmatched.sourceRevision, null);
  assert.equal(unmatched.bindingStatus, 'UNVERIFIED_SOURCE_BINDING');
});

test('bindings from another workspace cannot qualify an implementation', () => {
  const result = deriveFeatureOntologyCrosswalk(base, {
    workspaceRevision: `sha256:${'d'.repeat(64)}`,
    sourceBindings: [{
      canonical_source_ref: 'src/lib/server/auth.ts',
      source_revision: `sha256:${'c'.repeat(64)}`,
      workspace_revision: `sha256:${'f'.repeat(64)}`,
      content_digest: `sha256:${'c'.repeat(64)}`,
      binding_checksum: `sha256:${'e'.repeat(64)}`,
    }],
  });
  assert.equal(result.implementations.find((item) => item.sourceRef === 'src/lib/server/auth.ts').bindingStatus, 'UNVERIFIED_SOURCE_BINDING');
});

test('unknown feature vocabulary remains unverified instead of receiving a guessed domain', () => {
  const result = deriveFeatureOntologyCrosswalk({ feature_key: 'misc.unknown', title: 'Miscellaneous', source_refs: [] });
  assert.equal(result.domainKey, null);
  assert.equal(result.capabilityKey, null);
  assert.equal(result.classification.status, 'UNVERIFIED');
});
