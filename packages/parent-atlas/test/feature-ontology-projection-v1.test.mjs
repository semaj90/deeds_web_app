import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildFeatureDefinitionProjection,
  buildFeatureImplementationBinding,
  buildFeatureDependencyEdge,
} = await import('../dist/index.js');

const revision = `sha256:${'a'.repeat(64)}`;

test('projects one behavioral feature without replacing canonical feature identity', () => {
  const definition = buildFeatureDefinitionProjection({
    feature_id: 'auth.sessions',
    feature_key: 'auth.sessions',
    feature_label: 'Authentication Sessions',
    domain_id: 'identity',
    capability_id: 'identity.session-management',
    kind: 'SECURITY',
    description: 'Create, validate, and invalidate authenticated sessions.',
    surfaces: ['WEB', 'API'],
    dependencies: ['library:lucia', 'postgres:sessions'],
    feature_revision: revision,
    producer_revision: 'feature-ontology-projection:test',
    evidence_refs: ['packet:auth-sessions'],
  });

  assert.equal(definition.feature_id, 'auth.sessions');
  assert.deepEqual(definition.surfaces, ['WEB', 'API']);
  assert.equal(definition.canonical_authority, false);
});

test('binds multiple implementation units to the same feature with exact source identity', () => {
  const first = buildFeatureImplementationBinding({
    feature_id: 'auth.sessions',
    source_ref: 'sveltekit-frontend/src/lib/server/auth.ts#validateSession',
    source_revision: revision,
    symbol_version_id: 'symbol:validateSession:1',
    role: 'DOMAIN_LOGIC',
    evidence_refs: ['ast:validateSession', 'test:auth-session'],
    confidence: 0.98,
    binding_revision: 'feature-ontology-projection:test',
  });
  const second = buildFeatureImplementationBinding({
    feature_id: 'auth.sessions',
    source_ref: 'sveltekit-frontend/src/routes/api/auth/session/+server.ts',
    source_revision: revision,
    role: 'API',
    evidence_refs: ['route:auth-session'],
    confidence: 0.91,
    binding_revision: 'feature-ontology-projection:test',
  });

  assert.equal(first.feature_id, second.feature_id);
  assert.notEqual(first.source_ref, second.source_ref);
  assert.equal(first.canonical_authority, false);
});

test('models feature dependencies as typed derived edges, not feature identity', () => {
  const edge = buildFeatureDependencyEdge({
    from_feature_id: 'auth.sessions',
    relation: 'READS',
    to_entity_type: 'table',
    to_entity_id: 'postgres:sessions',
    source_ref: 'sveltekit-frontend/src/lib/server/auth.ts',
    source_revision: revision,
    evidence_refs: ['schema:sessions', 'ast:validateSession'],
    relationship_revision: 'feature-ontology-projection:test',
    producer_revision: 'feature-ontology-projection:test',
  });

  assert.equal(edge.to_entity_type, 'table');
  assert.equal(edge.to_entity_id, 'postgres:sessions');
  assert.equal(edge.canonical_authority, false);
});

test('rejects ungrounded implementation bindings and canonical promotion claims', () => {
  assert.throws(() => buildFeatureImplementationBinding({
    feature_id: 'auth.sessions',
    source_ref: 'sveltekit-frontend/src/lib/server/auth.ts',
    source_revision: revision,
    role: 'DOMAIN_LOGIC',
    evidence_refs: [],
    confidence: 0.9,
    binding_revision: 'feature-ontology-projection:test',
  }));
  assert.throws(() => buildFeatureDefinitionProjection({
    feature_id: 'auth.sessions',
    feature_key: 'auth.sessions',
    feature_label: 'Authentication Sessions',
    domain_id: 'identity',
    capability_id: 'identity.session-management',
    kind: 'SECURITY',
    description: 'Create sessions.',
    surfaces: ['WEB'],
    feature_revision: revision,
    producer_revision: 'feature-ontology-projection:test',
    canonical_authority: true,
  }));
});

