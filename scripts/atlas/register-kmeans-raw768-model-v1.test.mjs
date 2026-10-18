import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { centroidDigest, validateArtifact, verifyReadback } from './register-kmeans-raw768-model-v1.mjs';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function artifactFixture() {
  const centroids = Array.from({ length: 256 }, () => Array(768).fill(0));
  const cohort = {
    matrixSha256: 'sha256:' + '1'.repeat(64),
    orderedIdsSha256: 'sha256:' + '2'.repeat(64),
    trainingIdsSha256: 'sha256:' + '3'.repeat(64),
    workspaceRevision: null,
    sourceRevisionCoverage: 'NOT_PROVEN',
    representationRevision: null,
    recipeQualification: 'COLUMN_ONLY; per-row embedding recipe and source revisions are not proven',
  };
  return {
    schema: 'atlas.kmeans-raw768-model-artifact.v1',
    modelVersion: 'mbk-euclidean-content-embedding-768-k256-column-v1',
    k: 256,
    dim: 768,
    nChunks: 100,
    trainingCount: 90,
    holdoutCount: 10,
    sourceColumn: 'codebase_chunk_index.content_embedding_768',
    sourceEmbeddingModel: 'UNVERIFIED_COLUMN_COHORT',
    vectorContract: 'content_embedding_768-column-cohort-v1',
    batchSize: 4096,
    nInit: 3,
    maxIter: 100,
    randomSeed: 42,
    algorithm: 'MiniBatchKMeans',
    distanceMetric: 'euclidean',
    inertia: 10,
    fitPredictReplay: 1,
    cohort,
    cohortChecksum: digest(canonical(cohort)),
    centroids,
    centroidChecksum: centroidDigest(centroids),
    canonicalAuthority: false,
    modelRole: 'EVALUATION_CANDIDATE',
    isAssignmentActive: false,
  };
}

test('validates a frozen inactive candidate and exact float32 centroid checksum', () => {
  const fixture = artifactFixture();
  const parsed = validateArtifact(Buffer.from(JSON.stringify(fixture)));
  assert.equal(parsed.modelVersion, fixture.modelVersion);
  assert.equal(parsed.centroids.length, 256);
});

test('rejects active or source-lineage-qualified claims not present in the cohort', () => {
  const fixture = artifactFixture();
  fixture.isAssignmentActive = true;
  assert.throws(() => validateArtifact(Buffer.from(JSON.stringify(fixture))), /CANDIDATE_MUST_REMAIN_INACTIVE/);
});

test('rejects altered centroid values and readback metadata', () => {
  const fixture = artifactFixture();
  fixture.centroids[0][0] = 0.5;
  assert.throws(() => validateArtifact(Buffer.from(JSON.stringify(fixture))), /CENTROID_CHECKSUM_MISMATCH/);

  const clean = artifactFixture();
  assert.throws(() => verifyReadback({
    model_version: clean.modelVersion,
    k: 256,
    dim: 768,
    n_chunks: clean.trainingCount,
    centroids: clean.centroids,
    source_column: clean.sourceColumn,
    vector_contract: clean.vectorContract,
    model_role: 'EVALUATION_CANDIDATE',
    is_assignment_active: false,
    manifest_hash: 'sha256:' + 'f'.repeat(64),
  }, clean), /MODEL_METADATA_READBACK_MISMATCH/);
});
