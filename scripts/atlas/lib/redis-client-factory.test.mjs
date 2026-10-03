import assert from 'node:assert/strict';
import test from 'node:test';
import { VECTOR_LANE_REGISTRY } from './redis-client-factory.mjs';

test('semantic_768 is the only canonical vector representation in the registry', () => {
  const canonical = Object.values(VECTOR_LANE_REGISTRY).filter((entry) => entry.authoritative === true);
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].representationId, 'semantic_768');
  assert.equal(canonical[0].dimensions, 768);
  assert.equal(VECTOR_LANE_REGISTRY.DENSE_384_COMPACT, undefined);
});

test('MRL views are named derived projections and not independent canonical lanes', () => {
  const expected = [
    ['MRL_512', 'semantic_mrl_512', 512],
    ['MRL_256', 'semantic_mrl_256', 256],
    ['MRL_128', 'semantic_mrl_128', 128],
  ];
  for (const [key, representationId, dimensions] of expected) {
    const entry = VECTOR_LANE_REGISTRY[key];
    assert.equal(entry.representationId, representationId);
    assert.equal(entry.dimensions, dimensions);
    assert.equal(entry.authoritative, false);
    assert.equal(entry.derivedFrom, 'DENSE_768');
    assert.equal(entry.projectionMethod, 'PREFIX_TRUNCATE_L2_RENORMALIZE');
  }
});

test('learned latent views remain distinct from same-width MRL projections', () => {
  for (const [key, representationId, dimensions] of [
    ['LATENT_256', 'latent_256', 256],
    ['LATENT_128', 'latent_128', 128],
    ['LATENT_64', 'latent_64', 64],
  ]) {
    const entry = VECTOR_LANE_REGISTRY[key];
    assert.equal(entry.representationId, representationId);
    assert.equal(entry.dimensions, dimensions);
    assert.equal(entry.authoritative, false);
    assert.equal(entry.derivedFrom, 'DENSE_768');
    assert.equal(entry.modelVersion, 'CHECKPOINT_REVISION_REQUIRED');
  }
  assert.notEqual(VECTOR_LANE_REGISTRY.MRL_256.representationId, VECTOR_LANE_REGISTRY.LATENT_256.representationId);
  assert.notEqual(VECTOR_LANE_REGISTRY.MRL_128.representationId, VECTOR_LANE_REGISTRY.LATENT_128.representationId);
});
