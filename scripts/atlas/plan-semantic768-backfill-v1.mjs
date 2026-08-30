#!/usr/bin/env node
//
// NOTE (2026-08-30 correction): this script originally proposed a backfill/reembed of
// content_embedding_768, treating it as the canonical 768-dim column. That premise was wrong --
// live vector_dims(content_embedding::vector) verification showed ALL 55,169
// content_embedding rows are genuinely 768-dimensional already (halfvec(768) makes anything else
// physically impossible); embedding_dimension is a separate, independently-set metadata column
// that is simply stale for most of those rows. See root CLAUDE.md's Embedding Dimensions Policy
// section ("embedding_dimension metadata column is unreliable -- do not filter on it").
//
// This script now plans the ACTUAL fix: correcting the stale embedding_dimension metadata to
// match each row's real, structurally-guaranteed dimensionality. It proposes zero re-embedding,
// zero writes to content_embedding_768, and zero writes to content_embedding itself -- only a
// metadata correction on embedding_dimension, gated behind explicit approval.

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/embedding-dimension-metadata-correction-plan-v1.json');
const databaseUrl = process.env.ATLAS_DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total_rows,
      COUNT(*) FILTER (WHERE content_embedding IS NOT NULL)::int AS content_embedding_populated,
      COUNT(*) FILTER (
        WHERE content_embedding IS NOT NULL
          AND vector_dims(content_embedding::vector) = 768
      )::int AS content_embedding_verified_768,
      COUNT(*) FILTER (
        WHERE content_embedding IS NOT NULL
          AND vector_dims(content_embedding::vector) <> 768
      )::int AS content_embedding_verified_not_768,
      COUNT(*) FILTER (
        WHERE content_embedding IS NOT NULL
          AND embedding_dimension = 768
      )::int AS metadata_says_768,
      COUNT(*) FILTER (
        WHERE content_embedding IS NOT NULL
          AND (embedding_dimension IS DISTINCT FROM 768)
          AND vector_dims(content_embedding::vector) = 768
      )::int AS metadata_stale_should_be_768,
      COUNT(*) FILTER (WHERE content_embedding_768 IS NOT NULL)::int AS legacy_content_embedding_768_populated
    FROM codebase_chunk_index
  `);
  const counts = result.rows[0];
  const plan = {
    schema: 'atlas.embedding-dimension-metadata-correction-plan-v1',
    status: 'NON_PRODUCTION_METADATA_CORRECTION_PLANNED',
    canonicalAuthority: false,
    supersedes: 'atlas.semantic768-backfill-plan-v1 (2026-08-29, wrong premise, not executed)',
    contract: {
      canonicalColumn: 'content_embedding',
      canonicalColumnType: 'halfvec(768)',
      dimensionVerificationMethod: 'vector_dims(content_embedding::vector)',
      staleColumn: 'embedding_dimension',
      correctionAction: 'UPDATE codebase_chunk_index SET embedding_dimension = vector_dims(content_embedding::vector) WHERE content_embedding IS NOT NULL AND embedding_dimension IS DISTINCT FROM vector_dims(content_embedding::vector)',
      legacyColumnNote: 'content_embedding_768 is a separate, much smaller, non-canonical column -- not touched by this plan',
    },
    counts,
    actions: {
      correctStaleMetadata: counts.metadata_stale_should_be_768,
      noReembedding: true,
      noContentEmbedding768Writes: true,
    },
    databaseWrites: false,
    qdrantWrites: false,
    deletions: 0,
    approvalRequired: true,
    nextRequiredStep: 'Approve a bounded UPDATE of embedding_dimension only, driven by vector_dims(content_embedding::vector); do not re-embed and do not treat content_embedding_768 as canonical.',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(plan));
} finally {
  await pool.end();
}
