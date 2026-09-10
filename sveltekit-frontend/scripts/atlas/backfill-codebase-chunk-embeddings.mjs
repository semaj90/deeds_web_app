#!/usr/bin/env node
/**
 * Compatibility guard for the retired full-corpus semantic writer.
 *
 * Historical versions of this command wrote public.codebase_chunk_index
 * .content_embedding_768 vector(768). That column is NOT the current canonical
 * semantic_768 owner. The canonical physical owner is:
 *
 *   public.codebase_chunk_index.content_embedding halfvec(768)
 *
 * The stricter revision-qualified writer is:
 *   scripts/atlas/backfill-graphify-file-embeddings-768.mjs
 *
 * This compatibility entry point is intentionally READ ONLY. It refuses
 * --apply so an old npm command cannot recreate a second semantic authority.
 */
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();
const APPLY = process.argv.includes('--apply');
if (APPLY) {
  console.error('LEGACY_CONTENT_EMBEDDING_768_WRITER_RETIRED');
  console.error('Canonical semantic_768 owner: codebase_chunk_index.content_embedding halfvec(768).');
  console.error('Use scripts/atlas/backfill-graphify-file-embeddings-768.mjs only after its explicit revision/authorization gates pass.');
  process.exit(2);
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
try {
  const result = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE content_embedding IS NOT NULL)::bigint AS canonical_semantic_768,
      COUNT(*) FILTER (WHERE content_embedding IS NULL AND embedding_eligible = true)::bigint AS canonical_eligible_missing,
      COUNT(*) FILTER (WHERE content_embedding_768 IS NOT NULL)::bigint AS legacy_alternate_768
    FROM public.codebase_chunk_index
  `);
  const type = await pool.query(`
    SELECT format_type(a.atttypid,a.atttypmod) AS declared_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='codebase_chunk_index'
      AND a.attname='content_embedding' AND a.attnum>0 AND NOT a.attisdropped
  `);
  console.log(JSON.stringify({
    schema: 'atlas.semantic-768-backfill-compatibility-guard.v1',
    readOnly: true,
    writesPerformed: false,
    status: type.rows[0]?.declared_type === 'halfvec(768)' ? 'LEGACY_WRITER_RETIRED_CANONICAL_OWNER_OBSERVED' : 'CANONICAL_OWNER_TYPE_MISMATCH',
    total: Number(result.rows[0].total),
    canonical: {
      representationId: 'semantic_768', column: 'content_embedding', physicalType: type.rows[0]?.declared_type ?? null,
      dimension: 768, rows: Number(result.rows[0].canonical_semantic_768), eligibleMissing: Number(result.rows[0].canonical_eligible_missing),
    },
    alternate: { column: 'content_embedding_768', role: 'LEGACY_ALTERNATE_NONCANONICAL', rows: Number(result.rows[0].legacy_alternate_768) },
    nextWriter: '../../../scripts/atlas/backfill-graphify-file-embeddings-768.mjs',
  }, null, 2));
} finally {
  await pool.end();
}
