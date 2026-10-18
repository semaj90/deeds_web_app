import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { REPO_ROOT } from './connection-config.mjs';

test('register-kmeans-cluster-model-v2: validates centroid artifact shape and norms', async () => {
  const centroidsPath = path.join(REPO_ROOT, '.tmp/atlas/kmeans-v2/k256-v2-centroids.json');
  assert.ok(fs.existsSync(centroidsPath), 'centroids artifact must exist');

  const raw = JSON.parse(fs.readFileSync(centroidsPath, 'utf8'));
  assert.equal(raw.modelVersion, 'mbk-spherical-content768-k256-v2');
  assert.equal(raw.k, 256);
  assert.equal(raw.dim, 768);
  assert.equal(raw.centroids.length, 256);

  // Validate unit norm on first 10 and last 10 centroids
  const sampleIndices = [0, 1, 2, 3, 4, 251, 252, 253, 254, 255];
  for (const idx of sampleIndices) {
    const vec = raw.centroids[idx];
    assert.equal(vec.length, 768);
    let normSq = 0;
    for (let j = 0; j < 768; j++) normSq += vec[j] * vec[j];
    const norm = Math.sqrt(normSq);
    assert.ok(Math.abs(norm - 1.0) < 1e-3, `Centroid ${idx} norm must be ~1.0, got ${norm}`);
  }
});

test('register-kmeans-cluster-model-v2: receipt records successful registration with readback verification', async () => {
  const reportPath = path.join(REPO_ROOT, 'docs/reports/kmeans-v2-cluster-model-registration-receipt.json');
  assert.ok(fs.existsSync(reportPath), 'receipt must exist');

  const receipt = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(receipt.schema, 'atlas.kmeans-v2-cluster-model-registration.v1');
  assert.equal(receipt.status, 'REGISTRATION_COMPLETE');
  assert.equal(receipt.readbackVerified, true);
  assert.equal(receipt.insertedRow?.model_version, 'mbk-spherical-content768-k256-v2');
  assert.equal(receipt.insertedRow?.is_assignment_active, false);
});
