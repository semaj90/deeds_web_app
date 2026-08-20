import test from 'node:test';
import assert from 'node:assert/strict';

import {
  lowRankAssociationCandidateSchema,
  manifold4CoordinateSchema,
  manifold4RotationSchema,
  rotateManifold4,
} from '../dist/core/feature-matrix.js';

const identityQuaternion = [1, 0, 0, 0];

test('low-rank association candidates cannot declare canonical relationship creation', () => {
  assert.throws(() => lowRankAssociationCandidateSchema.parse({
    candidate_id: 'assoc:1',
    source_feature_id: 'feature:a',
    target_canonical_id: 'symbol:b',
    target_entity_type: 'symbol',
    method: 'svd',
    score: 0.9,
    matrix_snapshot_revision: 'matrix:r1',
    evidence_refs: [],
    evidence_inspection_required: true,
    canonical_relationship_created: true,
  }));
});

test('identity SO4 quaternion pair leaves manifold coordinates unchanged', () => {
  const point = manifold4CoordinateSchema.parse({
    canonical_id: 'feature:a',
    snapshot_revision: 'snapshot:r1',
    som_x: 0.2,
    som_y: -0.4,
    semantic_z: 0.7,
    activity_w: 0.1,
    derivation: 'som+ppr',
  });
  const rotation = manifold4RotationSchema.parse({
    rotation_id: 'rotation:identity',
    source_snapshot_revision: 'snapshot:r1',
    left_quaternion: identityQuaternion,
    right_quaternion: identityQuaternion,
    purpose: 'analysis',
    canonical_authority: false,
  });

  const rotated = rotateManifold4(point, rotation);
  assert.equal(rotated.som_x, point.som_x);
  assert.equal(rotated.som_y, point.som_y);
  assert.equal(rotated.semantic_z, point.semantic_z);
  assert.equal(rotated.activity_w, point.activity_w);
});

test('SO4 routing rotation preserves Euclidean norm', () => {
  const point = manifold4CoordinateSchema.parse({
    canonical_id: 'feature:a',
    snapshot_revision: 'snapshot:r1',
    som_x: 0.5,
    som_y: 0.25,
    semantic_z: -0.3,
    activity_w: 0.8,
    derivation: 'derived',
  });
  const s = Math.SQRT1_2;
  const rotation = manifold4RotationSchema.parse({
    rotation_id: 'rotation:test',
    source_snapshot_revision: 'snapshot:r1',
    left_quaternion: [s, s, 0, 0],
    right_quaternion: [s, 0, s, 0],
    purpose: 'routing',
    canonical_authority: false,
  });

  const rotated = rotateManifold4(point, rotation);
  const before = Math.hypot(point.som_x, point.som_y, point.semantic_z, point.activity_w);
  const after = Math.hypot(rotated.som_x, rotated.som_y, rotated.semantic_z, rotated.activity_w);
  assert.ok(Math.abs(before - after) < 1e-9);
});
