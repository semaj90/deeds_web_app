#!/usr/bin/env node
/**
 * LEXICAL-02B: read-only freeze of the canonical lexical/BM25 challenger corpus.
 * Reuses the rows backed by canonical semantic_768 storage:
 * codebase_chunk_index.content_embedding halfvec(768) + content_hash.
 * content_embedding_768 is a legacy/alternate vector(768) surface and is not
 * used to define the current canonical corpus.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const outPath = path.resolve(REPO_ROOT, 'docs/reports/atlas-lexical-document-corpus-freeze-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 15000 });

const report = {
  schema: 'atlas.lexical-document-corpus-freeze.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  step: 'LEXICAL-02B',
  corpusDefinition: {
    table: 'codebase_chunk_index',
    predicate: 'content_embedding IS NOT NULL AND content_hash IS NOT NULL',
    semanticRepresentation: 'semantic_768',
    canonicalVectorColumn: 'content_embedding',
    canonicalVectorType: 'halfvec(768)',
    alternateVectorColumn: 'content_embedding_768',
    alternateVectorRole: 'LEGACY_ALTERNATE_NONCANONICAL',
    rationale: 'Use the same canonical document cohort as semantic_768 without inventing a second lexical corpus.',
  },
  revisionProxy: {
    fieldUsed: 'content_hash',
    note: 'content_hash remains a proxy only; exact source/workspace revisions are required before promotion.',
  },
  counts: {},
  status: 'PASS',
  findings: [],
};

try {
  const typeResult = await pool.query(`SELECT format_type(a.atttypid,a.atttypmod) AS declared_type FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='codebase_chunk_index' AND a.attname='content_embedding' AND a.attnum>0 AND NOT a.attisdropped`);
  const declaredType = typeResult.rows[0]?.declared_type ?? null;
  if (declaredType !== 'halfvec(768)') throw new Error(`CANONICAL_VECTOR_TYPE_MISMATCH:${declaredType ?? 'missing'}`);

  const corpus = await pool.query(`SELECT count(*)::bigint AS eligible_chunks, count(DISTINCT source_ref)::bigint AS distinct_source_refs FROM public.codebase_chunk_index WHERE content_embedding IS NOT NULL AND content_hash IS NOT NULL`);
  const total = await pool.query(`SELECT count(*)::bigint AS total FROM public.codebase_chunk_index`);
  const alternates = await pool.query(`SELECT count(*) FILTER (WHERE content_embedding_768 IS NOT NULL)::bigint AS alternate_rows FROM public.codebase_chunk_index`);
  report.counts = {
    totalChunkRows: Number(total.rows[0].total),
    eligibleChunks: Number(corpus.rows[0].eligible_chunks),
    distinctSourceRefs: Number(corpus.rows[0].distinct_source_refs),
    alternateContentEmbedding768Rows: Number(alternates.rows[0].alternate_rows),
  };
  report.findings.push(`Canonical semantic_768 corpus uses content_embedding halfvec(768): ${report.counts.eligibleChunks}/${report.counts.totalChunkRows} rows with content_hash.`);
  report.findings.push(`content_embedding_768 remains observable as an alternate compatibility surface (${report.counts.alternateContentEmbedding768Rows} populated rows) but does not define the corpus.`);
} catch (error) {
  report.status = 'FAIL';
  report.findings.push(error.message);
} finally {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await pool.end();
}

console.log(JSON.stringify({ status: report.status, counts: report.counts, findings: report.findings, out: outPath }, null, 2));
if (report.status === 'FAIL') process.exitCode = 1;
