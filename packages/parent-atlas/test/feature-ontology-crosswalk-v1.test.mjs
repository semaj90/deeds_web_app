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
  assert.equal(result.implementations[0].bindingStatus, 'UNVERIFIED_SOURCE_REVISION');
  assert.ok(result.implementations.some((item) => item.role === 'TEST'));
  assert.deepEqual(result.dependencies, []);
});

test('revision-qualified source bindings are retained when supplied', () => {
  const result = deriveFeatureOntologyCrosswalkRows([{ ...base, source_revision: `sha256:${'b'.repeat(64)}` }]);
  assert.equal(result.records[0].implementations.every((item) => item.sourceRevision?.startsWith('sha256:')), true);
  assert.equal(result.records[0].classification.status, 'CLASSIFIED');
});

test('unknown feature vocabulary remains unverified instead of receiving a guessed domain', () => {
  const result = deriveFeatureOntologyCrosswalk({ feature_key: 'misc.unknown', title: 'Miscellaneous', source_refs: [] });
  assert.equal(result.domainKey, null);
  assert.equal(result.capabilityKey, null);
  assert.equal(result.classification.status, 'UNVERIFIED');
});
