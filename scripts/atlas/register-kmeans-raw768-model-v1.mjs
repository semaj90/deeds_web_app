#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ARTIFACT_PATH = path.join(REPO_ROOT, '.tmp/atlas/kmeans-raw768/mbk-euclidean-content-embedding-768-k256-raw-v1.json');
const REPORT_PATH = path.join(REPO_ROOT, 'docs/reports/kmeans-raw768-model-registration-v1.json');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const confirm = args.includes('--confirm-apply');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function centroidDigest(centroids) {
  const bytes = Buffer.alloc(centroids.length * 768 * 4);
  let offset = 0;
  for (const centroid of centroids) {
    for (const value of centroid) {
      bytes.writeFloatLE(Math.fround(value), offset);
      offset += 4;
    }
  }
  return digest(bytes);
}

function validateArtifact(rawBytes) {
  const data = JSON.parse(rawBytes.toString('utf8'));
  if (data.schema !== 'atlas.kmeans-raw768-model-artifact.v1') throw new Error('ARTIFACT_SCHEMA_INVALID');
  if (data.modelVersion !== 'mbk-euclidean-content-embedding-768-k256-column-v1') throw new Error('MODEL_VERSION_INVALID');
  if (data.k !== 256 || data.dim !== 768 || data.sourceColumn !== 'codebase_chunk_index.content_embedding_768') throw new Error('MODEL_CONTRACT_INVALID');
  if (data.modelRole !== 'EVALUATION_CANDIDATE' || data.isAssignmentActive !== false || data.canonicalAuthority !== false) throw new Error('CANDIDATE_MUST_REMAIN_INACTIVE');
  if (data.cohort?.sourceRevisionCoverage !== 'NOT_PROVEN' || data.cohort?.representationRevision !== null) throw new Error('PROVENANCE_STATE_MUST_BE_EXPLICIT');
  if (!Array.isArray(data.centroids) || data.centroids.length !== 256) throw new Error('CENTROID_COUNT_INVALID');
  for (const [row, centroid] of data.centroids.entries()) {
    if (!Array.isArray(centroid) || centroid.length !== 768 || centroid.some((item) => !Number.isFinite(item))) {
      throw new Error(`CENTROID_INVALID:${row}`);
    }
  }
  if (!Number.isFinite(data.inertia) || data.fitPredictReplay < 0.99) throw new Error('FIT_REPLAY_GATE_FAILED');
  if (centroidDigest(data.centroids) !== data.centroidChecksum) throw new Error('CENTROID_CHECKSUM_MISMATCH');
  if (digest(canonical(data.cohort)) !== data.cohortChecksum) throw new Error('COHORT_CHECKSUM_MISMATCH');
  return data;
}

async function main() {
  if (!fs.existsSync(ARTIFACT_PATH)) throw new Error(`MODEL_ARTIFACT_MISSING:${ARTIFACT_PATH}`);
  const artifactBytes = fs.readFileSync(ARTIFACT_PATH);
  const artifact = validateArtifact(artifactBytes);
  const artifactFileChecksum = digest(artifactBytes);
  const env = loadRepoEnv();
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2 });
  let receipt;

  try {
    if (!apply || !confirm) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN READ ONLY');
        const existing = await client.query(
          'SELECT id, model_version, k, dim, n_chunks, centroids, inertia, metadata, source_column, source_vector_dimension, source_embedding_model, normalization, algorithm, random_seed, manifest_hash, vector_contract, model_role, is_assignment_active FROM atlas_cluster_models WHERE model_version = $1',
          [artifact.modelVersion],
        );
        await client.query('COMMIT');
        if (existing.rowCount) {
          verifyReadback(existing.rows[0], artifact);
          receipt = {
            schema: 'atlas.kmeans-raw768-model-registration.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY_EXISTING_VERIFICATION',
            writesPerformed: false, canonicalAuthority: false, modelId: existing.rows[0].id, modelVersion: artifact.modelVersion,
            artifactFileChecksum, cohortChecksum: artifact.cohortChecksum, centroidChecksum: artifact.centroidChecksum,
            centroidsReadBack: 256, dimensionsReadBack: 768, trainingCount: artifact.trainingCount,
            sourceRevisionCoverage: artifact.cohort.sourceRevisionCoverage,
            modelRole: artifact.modelRole, isAssignmentActive: false, status: 'EXISTING_CANDIDATE_VERIFIED',
          };
        } else {
          receipt = {
            schema: 'atlas.kmeans-raw768-model-registration.v1', generatedAt: new Date().toISOString(), mode: 'DRY_RUN',
            writesPerformed: false, canonicalAuthority: false, modelVersion: artifact.modelVersion,
            artifactFileChecksum, cohortChecksum: artifact.cohortChecksum, centroidChecksum: artifact.centroidChecksum,
            trainingCount: artifact.trainingCount, sourceRevisionCoverage: artifact.cohort.sourceRevisionCoverage,
            modelRole: artifact.modelRole, isAssignmentActive: false, status: 'DRY_RUN_VALIDATED',
          };
        }
      } finally {
        client.release();
      }
    } else {
      const client = await pool.connect();
      let inserted;
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL statement_timeout = 15000');
        await client.query('SET LOCAL lock_timeout = 3000');
        const existing = await client.query('SELECT id FROM atlas_cluster_models WHERE model_version = $1 FOR UPDATE', [artifact.modelVersion]);
        if (existing.rowCount) throw new Error('MODEL_VERSION_ALREADY_EXISTS; IMMUTABLE_INSERT_REFUSED');
        const metadata = {
          schema: 'atlas.kmeans-raw768-model-metadata.v1',
          artifactFileChecksum,
          centroidChecksum: artifact.centroidChecksum,
          cohortChecksum: artifact.cohortChecksum,
          cohort: artifact.cohort,
          trainingCount: artifact.trainingCount,
          holdoutCount: artifact.holdoutCount,
          parameters: { batchSize: artifact.batchSize, nInit: artifact.nInit, maxIter: artifact.maxIter, distanceMetric: artifact.distanceMetric },
          fitPredictReplay: artifact.fitPredictReplay,
          provenanceStatus: 'NOT_PROVEN_SOURCE_REVISIONS; EXPERIMENTAL_COLUMN_COHORT_ONLY',
          routingEnabled: false,
        };
        const result = await client.query(`
          INSERT INTO atlas_cluster_models (
            model_version, k, dim, n_chunks, centroids, inertia, metadata,
            source_column, source_vector_dimension, source_embedding_model,
            normalization, algorithm, random_seed, manifest_hash, vector_contract,
            model_role, is_assignment_active
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, false)
          RETURNING id
        `, [
          artifact.modelVersion, artifact.k, artifact.dim, artifact.trainingCount,
          JSON.stringify(artifact.centroids), artifact.inertia, JSON.stringify(metadata),
          artifact.sourceColumn, artifact.dim, artifact.sourceEmbeddingModel,
          'l2_input_euclidean_centroids_un-normalized', artifact.algorithm, artifact.randomSeed,
          artifact.cohortChecksum, artifact.vectorContract, artifact.modelRole,
        ]);
        inserted = result.rows[0];
        const inTransaction = await client.query(`
          SELECT model_version, k, dim, n_chunks, centroids, inertia, metadata,
                 source_column, normalization, algorithm, random_seed, manifest_hash,
                 vector_contract, model_role, is_assignment_active
          FROM atlas_cluster_models WHERE id = $1
        `, [inserted.id]);
        verifyReadback(inTransaction.rows[0], artifact);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      const independent = await pool.query(`
        SELECT id, model_version, k, dim, n_chunks, centroids, inertia, metadata,
               source_column, normalization, algorithm, random_seed, manifest_hash,
               vector_contract, model_role, is_assignment_active
        FROM atlas_cluster_models WHERE model_version = $1
      `, [artifact.modelVersion]);
      if (independent.rowCount !== 1) throw new Error('INDEPENDENT_READBACK_ROW_COUNT_MISMATCH');
      verifyReadback(independent.rows[0], artifact);
      inserted = { ...independent.rows[0], id: independent.rows[0].id };
      receipt = {
        schema: 'atlas.kmeans-raw768-model-registration.v1', generatedAt: new Date().toISOString(), mode: 'APPLY',
        writesPerformed: true, canonicalAuthority: false, insertedRow: { id: inserted.id, modelVersion: inserted.model_version },
        artifactFileChecksum,
        cohortChecksum: artifact.cohortChecksum, centroidChecksum: artifact.centroidChecksum,
        centroidsReadBack: 256, dimensionsReadBack: 768, independentReadbackVerified: true,
        sourceRevisionCoverage: artifact.cohort.sourceRevisionCoverage, modelRole: artifact.modelRole,
        isAssignmentActive: inserted.is_assignment_active, status: 'INACTIVE_CANDIDATE_REGISTERED',
      };
    }
  } finally {
    await pool.end();
  }

  receipt.receiptChecksum = digest(canonical(receipt));
  fs.writeFileSync(REPORT_PATH, JSON.stringify(receipt, null, 2), 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
}

function verifyReadback(row, artifact) {
  const metadata = typeof row?.metadata === 'string' ? JSON.parse(row.metadata) : row?.metadata;
  if (!row || row.model_version !== artifact.modelVersion || row.k !== 256 || row.dim !== 768 ||
      Number(row.n_chunks) !== artifact.trainingCount || row.source_column !== artifact.sourceColumn ||
      row.source_vector_dimension !== artifact.dim || row.source_embedding_model !== artifact.sourceEmbeddingModel ||
      row.normalization !== 'l2_input_euclidean_centroids_un-normalized' || row.algorithm !== artifact.algorithm ||
      row.random_seed !== artifact.randomSeed || row.vector_contract !== artifact.vectorContract ||
      row.model_role !== 'EVALUATION_CANDIDATE' || row.is_assignment_active !== false ||
      row.manifest_hash !== artifact.cohortChecksum || metadata?.cohortChecksum !== artifact.cohortChecksum ||
      metadata?.centroidChecksum !== artifact.centroidChecksum || metadata?.trainingCount !== artifact.trainingCount ||
      metadata?.routingEnabled !== false || metadata?.provenanceStatus !== 'NOT_PROVEN_SOURCE_REVISIONS; EXPERIMENTAL_COLUMN_COHORT_ONLY') {
    throw new Error('MODEL_METADATA_READBACK_MISMATCH');
  }
  const centroids = typeof row.centroids === 'string' ? JSON.parse(row.centroids) : row.centroids;
  if (!Array.isArray(centroids) || centroids.length !== artifact.centroids.length || centroidDigest(centroids) !== artifact.centroidChecksum) {
    throw new Error('MODEL_CENTROID_READBACK_CHECKSUM_MISMATCH');
  }
  for (const centroid of centroids) {
    if (!Array.isArray(centroid) || centroid.length !== 768 || centroid.some((value) => !Number.isFinite(Number(value)))) {
      throw new Error('MODEL_CENTROID_READBACK_INVALID');
    }
  }
}

export { centroidDigest, validateArtifact, verifyReadback };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
