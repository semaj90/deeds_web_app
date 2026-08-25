#!/usr/bin/env node
/**
 * LEXICAL-02B: read-only freeze of the canonical BM25 document input corpus.
 * Reuses the same corpus that already feeds semantic_768 (codebase_chunk_index
 * rows with content_embedding + content_hash populated) rather than inventing
 * a second document set for a lexical challenger. No writes performed.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const outPath = path.resolve(REPO_ROOT, 'docs/reports/atlas-lexical-document-corpus-freeze-v1.json');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
});

const report = {
  schema: 'atlas.lexical-document-corpus-freeze.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  step: 'LEXICAL-02B',
  corpusDefinition: {
    table: 'codebase_chunk_index',
    predicate: 'content_embedding IS NOT NULL AND content_hash IS NOT NULL',
    rationale: 'Reuses the exact corpus already feeding semantic_768 (content_embedding column) '
      + 'so the lexical challenger is benchmarked against the same documents the dense lane already '
      + 'indexes, not a separately-invented corpus.',
  },
  revisionProxy: {
    fieldUsed: 'content_hash',
    note: 'No per-chunk source_revision/commit_sha column exists on codebase_chunk_index. '
      + 'atlas_source_refs.commit_sha exists as a column but is 0% populated live (see prior '
      + 'CONTENT-HASH-BACKFILL-01 findings in the parent-atlas-neural-prefill-encoder change). '
      + 'content_hash is therefore the finest-grained real revision proxy available today for this '
      + 'corpus and is what AtlasLexicalProjectionV1.sourceRevision should carry, not a git SHA.',
  },
  counts: {},
  status: 'PASS',
  findings: [],
};

try {
  const corpus = await pool.query(`
    SELECT
      count(*)::bigint AS eligible_chunks,
      count(DISTINCT source_ref)::bigint AS distinct_source_refs
    FROM public.codebase_chunk_index
    WHERE content_embedding IS NOT NULL AND content_hash IS NOT NULL
  `);
  const total = await pool.query(`SELECT count(*)::bigint AS total FROM public.codebase_chunk_index`);
  const sourceRefCommitSha = await pool.query(`
    SELECT
      count(*)::bigint AS total_source_refs,
      count(*) FILTER (WHERE commit_sha IS NOT NULL)::bigint AS commit_sha_populated
    FROM public.atlas_source_refs
  `);

  report.counts = {
    totalChunkRows: Number(total.rows[0].total),
    eligibleChunks: Number(corpus.rows[0].eligible_chunks),
    distinctSourceRefs: Number(corpus.rows[0].distinct_source_refs),
    atlasSourceRefsTotal: Number(sourceRefCommitSha.rows[0].total_source_refs),
    atlasSourceRefsCommitShaPopulated: Number(sourceRefCommitSha.rows[0].commit_sha_populated),
  };

  if (report.counts.atlasSourceRefsCommitShaPopulated === 0) {
    report.findings.push(
      'commit_sha remains 0% populated live -- confirms content_hash is the only usable revision '
      + 'proxy for this corpus today, not a stale historical note.',
    );
  }
  report.findings.push(
    `Frozen corpus: ${report.counts.eligibleChunks}/${report.counts.totalChunkRows} chunks, `
    + `${report.counts.distinctSourceRefs} distinct source_ref files -- this is the input set for `
    + 'LEXICAL-02C/02D (AtlasLexicalProjectionV1 encoding), regardless of whether the eventual '
    + 'executor is Qdrant BM25 or pg_search.',
  );
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
