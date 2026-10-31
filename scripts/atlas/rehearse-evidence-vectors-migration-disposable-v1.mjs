#!/usr/bin/env node
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function main() {
  const repoEnv = loadRepoEnv();
  const baseAdminUrl = resolveDatabaseUrl({ ...repoEnv, DB_NAME: 'postgres', POSTGRES_DB: 'postgres' });
  const adminSql = postgres(baseAdminUrl, { max: 1 });

  const scratchDbName = `evidence_rehearsal_scratch_${Date.now()}`;
  console.log(`[Rehearsal] Creating disposable scratch database: ${scratchDbName}`);
  await adminSql.unsafe(`CREATE DATABASE ${scratchDbName};`);

  const scratchUrl = resolveDatabaseUrl({ ...repoEnv, DB_NAME: scratchDbName, POSTGRES_DB: scratchDbName });
  const scratchSql = postgres(scratchUrl, { max: 1 });

  const receipt = {
    schema: 'atlas.evidence-vectors-migration-rehearsal.v1',
    timestamp: new Date().toISOString(),
    scratchDatabase: scratchDbName,
    checks: {},
  };

  try {
    // 1. Enable pgvector
    await scratchSql`CREATE EXTENSION IF NOT EXISTS vector;`;
    receipt.checks.pgvector_extension = 'ENABLED';

    // 2. Setup legacy vector(384) table state
    await scratchSql.unsafe(`
      DROP TABLE IF EXISTS public.evidence_vectors CASCADE;
      CREATE TABLE public.evidence_vectors (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        evidence_id uuid NOT NULL,
        embedding vector(384) NOT NULL,
        embedding_type varchar(50) NOT NULL,
        source_field varchar(100) NOT NULL,
        model varchar(100) NOT NULL DEFAULT 'nomic-embed-text',
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );
      CREATE INDEX evidence_vectors_hnsw_idx ON public.evidence_vectors USING hnsw (embedding vector_cosine_ops);
    `);
    receipt.checks.legacy_table_created = 'vector(384)';

    // 3. Test empty-table guard by inserting 1 dummy row
    const dummy384 = `[${new Array(384).fill(0.01).join(',')}]`;
    await scratchSql`
      INSERT INTO public.evidence_vectors (evidence_id, embedding, embedding_type, source_field)
      VALUES (gen_random_uuid(), ${dummy384}::vector, 'legacy_type', 'legacy_field');
    `;

    const migrationDdl = fs.readFileSync(
      path.join(ROOT, 'sveltekit-frontend/drizzle/manual/20261029_evidence_vectors_semantic_768.sql'),
      'utf8'
    );

    let guardCaught = false;
    try {
      await scratchSql.unsafe(migrationDdl);
    } catch (err) {
      await scratchSql.unsafe('ROLLBACK;');
      if (err.message.includes('Refusing to replace legacy embedding column')) {
        guardCaught = true;
      } else {
        throw err;
      }
    }
    if (!guardCaught) throw new Error('EMPTY_TABLE_GUARD_FAILED: migration ran despite existing row!');
    receipt.checks.empty_table_guard = 'PASSED_REFUSED_NON_EMPTY';

    // 4. Truncate table and run migration
    await scratchSql`TRUNCATE TABLE public.evidence_vectors;`;
    await scratchSql.unsafe(migrationDdl);
    receipt.checks.migration_execution = 'SUCCESS';

    // 5. Introspect schema
    const atts = await scratchSql`
      SELECT attribute.attname, format_type(attribute.atttypid, attribute.atttypmod) as full_type,
             attribute.attnotnull as is_not_null
      FROM pg_attribute attribute
      JOIN pg_class c ON c.oid = attribute.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'evidence_vectors' AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    `;
    const colMap = Object.fromEntries(atts.map(a => [a.attname, a]));
    if (colMap.embedding?.full_type !== 'vector(768)') throw new Error(`EMBEDDING_NOT_VECTOR_768: ${colMap.embedding?.full_type}`);
    if (!colMap.chunk_index?.is_not_null) throw new Error('CHUNK_INDEX_NOT_NULL_MISSING');
    if (!colMap.source_revision?.is_not_null) throw new Error('SOURCE_REVISION_NOT_NULL_MISSING');
    receipt.checks.schema_introspection = {
      embedding: colMap.embedding.full_type,
      chunk_index: colMap.chunk_index.full_type,
      source_revision: colMap.source_revision.full_type,
      constraints_checked: true,
    };

    // 6. Test valid 768-D insert
    const testEvidenceId = '11111111-1111-4111-8111-111111111111';
    const testRevision = `sha256:${'a'.repeat(64)}`;
    const valid768 = `[${new Array(768).fill(0.01).join(',')}]`;

    await scratchSql`
      INSERT INTO public.evidence_vectors (
        evidence_id, chunk_index, content, embedding, analysis_type, metadata, model,
        source_revision, embedding_type, source_field
      )
      VALUES (
        ${testEvidenceId}, 0, 'Valid content chunk 0', ${valid768}::vector, 'test-analysis',
        '{"test":true}'::jsonb, 'embeddinggemma', ${testRevision},
        'evidence_text_semantic_768', 'canonical_evidence_text'
      );
    `;
    receipt.checks.valid_insert = 'SUCCESS';

    // 7. Test duplicate insert rejected by unique index
    let dupCaught = false;
    try {
      await scratchSql`
        INSERT INTO public.evidence_vectors (
          evidence_id, chunk_index, content, embedding, analysis_type, metadata, model,
          source_revision, embedding_type, source_field
        )
        VALUES (
          ${testEvidenceId}, 0, 'Duplicate chunk 0', ${valid768}::vector, 'test-analysis',
          '{"test":true}'::jsonb, 'embeddinggemma', ${testRevision},
          'evidence_text_semantic_768', 'canonical_evidence_text'
        );
      `;
    } catch (err) {
      if (err.message.includes('evidence_vectors_source_chunk_uq') || err.code === '23505') {
        dupCaught = true;
      }
    }
    if (!dupCaught) throw new Error('DUPLICATE_INSERT_NOT_REJECTED');
    receipt.checks.duplicate_rejection = 'PASSED_23505_CAUGHT';

    // 8. Test invalid dimension (384 into 768)
    let dimCaught = false;
    try {
      await scratchSql`
        INSERT INTO public.evidence_vectors (
          evidence_id, chunk_index, content, embedding, analysis_type, metadata, model,
          source_revision, embedding_type, source_field
        )
        VALUES (
          ${testEvidenceId}, 1, 'Invalid dim chunk 1', ${dummy384}::vector, 'test-analysis',
          '{"test":true}'::jsonb, 'embeddinggemma', ${testRevision},
          'evidence_text_semantic_768', 'canonical_evidence_text'
        );
      `;
    } catch (err) {
      if (err.message.includes('different size') || err.message.includes('expected 768')) {
        dimCaught = true;
      }
    }
    if (!dimCaught) throw new Error('WRONG_DIMENSION_NOT_REJECTED');
    receipt.checks.wrong_dimension_rejection = 'PASSED_DIM_MISMATCH_CAUGHT';

    // 9. Test invalid source_revision format rejected by CHECK
    let revCheckCaught = false;
    try {
      await scratchSql`
        INSERT INTO public.evidence_vectors (
          evidence_id, chunk_index, content, embedding, analysis_type, metadata, model,
          source_revision, embedding_type, source_field
        )
        VALUES (
          ${testEvidenceId}, 1, 'Invalid revision', ${valid768}::vector, 'test-analysis',
          '{"test":true}'::jsonb, 'embeddinggemma', 'invalid_rev_not_sha256',
          'evidence_text_semantic_768', 'canonical_evidence_text'
        );
      `;
    } catch (err) {
      if (err.message.includes('evidence_vectors_source_revision_sha256_ck') || err.code === '23514') {
        revCheckCaught = true;
      }
    }
    if (!revCheckCaught) throw new Error('INVALID_REVISION_CHECK_NOT_REJECTED');
    receipt.checks.invalid_revision_check = 'PASSED_CHECK_CONSTRAINT_CAUGHT';

    // 10. Test invalid embedding_type rejected by CHECK
    let embTypeCaught = false;
    try {
      await scratchSql`
        INSERT INTO public.evidence_vectors (
          evidence_id, chunk_index, content, embedding, analysis_type, metadata, model,
          source_revision, embedding_type, source_field
        )
        VALUES (
          ${testEvidenceId}, 1, 'Invalid type', ${valid768}::vector, 'test-analysis',
          '{"test":true}'::jsonb, 'embeddinggemma', ${testRevision},
          'unadmitted_type', 'canonical_evidence_text'
        );
      `;
    } catch (err) {
      if (err.message.includes('evidence_vectors_embedding_type_ck') || err.code === '23514') {
        embTypeCaught = true;
      }
    }
    if (!embTypeCaught) throw new Error('INVALID_EMBEDDING_TYPE_NOT_REJECTED');
    receipt.checks.invalid_embedding_type_check = 'PASSED_CHECK_CONSTRAINT_CAUGHT';

    // 11. Immutability verification: verify 384 rollback is refused & 768 is immutable
    const rollbackFile = path.join(ROOT, 'sveltekit-frontend/drizzle/manual/20261029_evidence_vectors_semantic_768_rollback.sql');
    let rollbackRefused = false;
    if (fs.existsSync(rollbackFile)) {
      const rollbackDdl = fs.readFileSync(rollbackFile, 'utf8');
      try {
        await scratchSql.unsafe(rollbackDdl);
      } catch (err) {
        if (err.message.includes('Rollback to legacy vector(384) is prohibited')) {
          rollbackRefused = true;
        }
      }
    }
    if (!rollbackRefused) {
      throw new Error('DANGEROUS_384_ROLLBACK_WAS_NOT_REFUSED');
    }

    // Verify embedding column remains permanently vector(768)
    const finalAtts = await scratchSql`
      SELECT format_type(attribute.atttypid, attribute.atttypmod) as full_type
      FROM pg_attribute attribute
      WHERE attribute.attrelid = 'public.evidence_vectors'::regclass
        AND attribute.attname = 'embedding' AND attribute.attnum > 0;
    `;
    if (finalAtts[0]?.full_type !== 'vector(768)') {
      throw new Error(`EXPECTED_VECTOR_768_FOUND_${finalAtts[0]?.full_type}`);
    }

    receipt.checks.rollback_verification = {
      status: 'REFUSED_384_ROLLBACK_PRESERVES_MRL',
      permanent_embedding_type: 'vector(768)',
    };

    receipt.status = 'ALL_REHEARSAL_CHECKS_PASSED';
    console.log('[Rehearsal] All checks passed successfully:', JSON.stringify(receipt.checks, null, 2));

  } finally {
    await scratchSql.end({ timeout: 5 });
    console.log(`[Rehearsal] Dropping scratch database: ${scratchDbName}`);
    await adminSql.unsafe(`DROP DATABASE ${scratchDbName} WITH (FORCE);`);
    await adminSql.end({ timeout: 5 });
  }

  const outPath = path.join(ROOT, '.tmp/atlas/evidence-vectors-migration-rehearsal-receipt-v1.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2), 'utf8');
  console.log(`[Rehearsal] Wrote receipt to: ${outPath}`);
}

main().catch((err) => {
  console.error('[Rehearsal] FAILED:', err);
  process.exit(1);
});
