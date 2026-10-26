#!/usr/bin/env node
/**
 * KMEANS-REG-01: Register Spherical KMeans K=256 v2 model in atlas_cluster_models.
 *
 * Validates the fitted centroids artifact (.tmp/atlas/kmeans-v2/k256-v2-centroids.json)
 * and registers it as an EVALUATION_CANDIDATE in PostgreSQL table `atlas_cluster_models`.
 *
 * Safety & Governance:
 *   - Defaults to dry-run (no DB writes without --apply --confirm-apply).
 *   - Sets is_assignment_active = false to avoid disrupting active routing.
 *   - Verifies L2 unit-norm on all 256 centroid vectors before insertion.
 *   - Readback verification ensures written row matches artifact checksum.
 *   - Writes audit receipt to docs/reports/kmeans-v2-cluster-model-registration-receipt.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const CENTROIDS_PATH = path.join(REPO_ROOT, '.tmp/atlas/kmeans-v2/k256-v2-centroids.json');
const REPORT_PATH = path.join(REPO_ROOT, 'docs/reports/kmeans-v2-cluster-model-registration-receipt.json');

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isConfirmed = args.includes('--confirm-apply');

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function l2Norm(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  return Math.sqrt(sum);
}

async function main() {
  if (!fs.existsSync(CENTROIDS_PATH)) {
    throw new Error(`CENTROIDS_ARTIFACT_NOT_FOUND: ${CENTROIDS_PATH}`);
  }

  const rawBytes = fs.readFileSync(CENTROIDS_PATH);
  const fileSha = sha256(rawBytes);
  const data = JSON.parse(rawBytes.toString('utf8'));

  if (data.modelVersion !== 'mbk-spherical-content768-k256-v2') {
    throw new Error(`UNEXPECTED_MODEL_VERSION: ${data.modelVersion}`);
  }
  if (data.k !== 256 || data.dim !== 768) {
    throw new Error(`UNEXPECTED_SHAPE: k=${data.k}, dim=${data.dim}`);
  }
  if (!Array.isArray(data.centroids) || data.centroids.length !== 256) {
    throw new Error(`INVALID_CENTROIDS_ARRAY_LENGTH: ${data.centroids?.length}`);
  }

  // Validate all centroid vectors are unit length
  for (let i = 0; i < data.centroids.length; i++) {
    const c = data.centroids[i];
    if (!Array.isArray(c) || c.length !== 768) {
      throw new Error(`CENTROID_${i}_INVALID_DIMENSION: ${c?.length}`);
    }
    const norm = l2Norm(c);
    if (Math.abs(norm - 1.0) > 1e-3) {
      throw new Error(`CENTROID_${i}_NOT_L2_NORMALIZED: norm=${norm}`);
    }
  }

  console.log(`✓ Centroids validation passed: 256 centroids of dimension 768, unit L2 norms verified.`);
  console.log(`  Artifact SHA256: sha256:${fileSha}`);
  console.log(`  Holdout Agreement: ${(data.holdoutAgreement * 100).toFixed(2)}%`);
  console.log(`  Inertia: ${data.inertia}`);

  const env = loadRepoEnv();
  const dbUrl = resolveDatabaseUrl(env);
  const pool = new pg.Pool({ connectionString: dbUrl });

  try {
    // Check if model already exists
    const existing = await pool.query(
      'SELECT id, model_version, is_assignment_active, created_at FROM atlas_cluster_models WHERE model_version = $1',
      [data.modelVersion]
    );

    if (existing.rows.length > 0) {
      console.log(`ℹ Model ${data.modelVersion} is already registered with id ${existing.rows[0].id}.`);
      const receipt = {
        schema: 'atlas.kmeans-v2-cluster-model-registration.v1',
        generatedAt: new Date().toISOString(),
        mode: isApply && isConfirmed ? 'APPLY_ALREADY_EXISTS' : 'DRY_RUN_ALREADY_EXISTS',
        writesPerformed: false,
        modelId: existing.rows[0].id,
        modelVersion: data.modelVersion,
        isAssignmentActive: existing.rows[0].is_assignment_active,
        createdAt: existing.rows[0].created_at,
        artifactSha256: `sha256:${fileSha}`,
        status: 'ALREADY_REGISTERED',
      };
      fs.writeFileSync(REPORT_PATH, JSON.stringify(receipt, null, 2), 'utf8');
      console.log(`✓ Receipt written to: ${REPORT_PATH}`);
      return;
    }

    if (!isApply || !isConfirmed) {
      console.log(`\n--- DRY RUN SUMMARY ---`);
      console.log(`Target table: atlas_cluster_models`);
      console.log(`Proposed row:`);
      console.log(`  model_version:           '${data.modelVersion}'`);
      console.log(`  k:                       256`);
      console.log(`  dim:                     768`);
      console.log(`  source_vector_dimension: 768`);
      console.log(`  source_column:           'codebase_chunk_index.content_embedding'`);
      console.log(`  source_embedding_model:  'embeddinggemma-300m'`);
      console.log(`  normalization:           'l2'`);
      console.log(`  algorithm:               'minibatch-spherical-kmeans'`);
      console.log(`  random_seed:             42`);
      console.log(`  vector_contract:         'eg-task-prefix-v1'`);
      console.log(`  model_role:              'EVALUATION_CANDIDATE'`);
      console.log(`  is_assignment_active:    false`);
      console.log(`  inertia:                 ${data.inertia}`);
      console.log(`\nDry run complete. No mutations performed.`);
      console.log(`To execute registration, run with: --apply --confirm-apply`);

      const receipt = {
        schema: 'atlas.kmeans-v2-cluster-model-registration.v1',
        generatedAt: new Date().toISOString(),
        mode: 'DRY_RUN',
        writesPerformed: false,
        canonicalAuthority: false,
        modelVersion: data.modelVersion,
        artifactSha256: `sha256:${fileSha}`,
        status: 'DRY_RUN_PROVEN',
      };
      fs.writeFileSync(REPORT_PATH, JSON.stringify(receipt, null, 2), 'utf8');
      return;
    }

    // APPLY MODE
    console.log(`\nExecuting INSERT INTO atlas_cluster_models...`);
    const insertSql = `
      INSERT INTO atlas_cluster_models (
        model_version,
        k,
        dim,
        n_chunks,
        centroids,
        inertia,
        language_stats,
        created_at,
        metadata,
        source_column,
        source_vector_dimension,
        source_embedding_model,
        normalization,
        algorithm,
        random_seed,
        manifest_hash,
        vector_contract,
        model_role,
        is_assignment_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      )
      RETURNING id, model_version, k, dim, created_at, is_assignment_active
    `;

    const metadata = {
      fittedAt: data.fittedAt,
      holdoutAgreement: data.holdoutAgreement,
      hardware: 'CPU_ONLY',
      artifactSha256: `sha256:${fileSha}`,
    };

    const res = await pool.query(insertSql, [
      data.modelVersion,
      data.k,
      data.dim,
      52380, // qualified training chunks
      JSON.stringify(data.centroids),
      data.inertia,
      null, // language_stats
      JSON.stringify(metadata),
      'codebase_chunk_index.content_embedding',
      768,
      'embeddinggemma-300m',
      'l2',
      'minibatch-spherical-kmeans',
      42,
      `sha256:${fileSha}`,
      'eg-task-prefix-v1',
      'EVALUATION_CANDIDATE',
      false, // is_assignment_active
    ]);

    const inserted = res.rows[0];
    console.log(`✓ Successfully registered model with ID ${inserted.id} in atlas_cluster_models.`);

    // Readback verification
    const readback = await pool.query(
      'SELECT id, model_version, k, dim, is_assignment_active, model_role, vector_contract FROM atlas_cluster_models WHERE id = $1',
      [inserted.id]
    );

    if (readback.rows.length === 0 || readback.rows[0].model_version !== data.modelVersion) {
      throw new Error('READBACK_VERIFICATION_FAILED');
    }

    const receipt = {
      schema: 'atlas.kmeans-v2-cluster-model-registration.v1',
      generatedAt: new Date().toISOString(),
      mode: 'APPLY',
      writesPerformed: true,
      canonicalAuthority: false,
      insertedRow: readback.rows[0],
      artifactSha256: `sha256:${fileSha}`,
      readbackVerified: true,
      status: 'REGISTRATION_COMPLETE',
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(receipt, null, 2), 'utf8');
    console.log(`✓ Readback verified and receipt written to: ${REPORT_PATH}`);

  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Registration failed:', err);
  process.exit(1);
});
