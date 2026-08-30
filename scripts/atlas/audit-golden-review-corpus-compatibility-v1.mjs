#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/golden-review-corpus-compatibility-v1.json');
const databaseUrl = process.env.ATLAS_DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const expected = { embeddingModel: 'embeddinggemma:latest', embeddingDimension: 768, collection: 'codebase_chunks_768' };
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const result = await pool.query(`
    SELECT corpus_version, git_commit, postgres_chunk_count, qdrant_collection,
           qdrant_point_count, embedding_model, embedding_dimension,
           embedding_model_version, query_set_hash, judgment_set_hash
    FROM evaluation_corpora ORDER BY created_at DESC
  `);
  const compatible = result.rows.filter((row) =>
    row.embedding_model === expected.embeddingModel &&
    row.embedding_dimension === expected.embeddingDimension &&
    row.qdrant_collection === expected.collection &&
    row.judgment_set_hash !== 'pending'
  );
  const report = {
    schema: 'atlas.golden-review-corpus-compatibility-v1',
    status: compatible.length ? 'COMPATIBLE_CORPUS_FOUND' : 'COMPATIBLE_CORPUS_MISSING',
    canonicalAuthority: false,
    expected,
    manifestsFound: result.rowCount,
    compatibleManifestCount: compatible.length,
    manifests: result.rows,
    databaseWrites: false,
    importAllowed: false,
    nextRequiredStep: 'Create an approved 768-dimensional corpus manifest with current query/judgment checksums before judgment import.',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, manifests: undefined }));
} finally {
  await pool.end();
}
