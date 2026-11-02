import test from 'node:test';
import assert from 'node:assert/strict';
import {
  migrationOwnerAuditHasBlockerV1,
  summarizeMigrationOwnerResultsV1,
} from './migration-owner-audit-summary-v1.mjs';

test('summary reports sidecar-unapplied owners with exact classification spelling', () => {
  const results = [
    { id: 'planned_sidecar', classification: 'SIDECAR_UNAPPLIED' },
    { id: 'missing_registry', classification: 'JOURNALED_OBJECT_ABSENT' },
    { id: 'aligned', classification: 'LIVE_SHAPE_ALIGNED' },
    { id: 'glyph_shape_drift', classification: 'LIVE_SHAPE_MISMATCH' },
  ];

  assert.deepEqual(summarizeMigrationOwnerResultsV1(results), {
    missingManifestRegistration: [],
    sidecarUnapplied: ['planned_sidecar'],
    journaledObjectAbsent: ['missing_registry'],
    liveShapeAligned: ['aligned'],
    liveShapeDrift: ['glyph_shape_drift'],
    superseded: [],
  });
  assert.equal(migrationOwnerAuditHasBlockerV1(results), true);
});

test('live shape drift blocks owner audit even when the table exists', () => {
  const results = [{ id: 'glyph_shape_drift', classification: 'LIVE_SHAPE_MISMATCH' }];
  assert.deepEqual(summarizeMigrationOwnerResultsV1(results).liveShapeDrift, ['glyph_shape_drift']);
  assert.equal(migrationOwnerAuditHasBlockerV1(results), true);
});

test('planned sidecar state is reported but does not independently fail the owner audit', () => {
  const results = [{ id: 'planned_sidecar', classification: 'SIDECAR_UNAPPLIED' }];
  assert.deepEqual(summarizeMigrationOwnerResultsV1(results).sidecarUnapplied, ['planned_sidecar']);
  assert.equal(migrationOwnerAuditHasBlockerV1(results), false);
});
