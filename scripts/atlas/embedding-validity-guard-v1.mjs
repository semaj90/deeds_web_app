#!/usr/bin/env node
/**
 * embedding-validity-guard-v1 (AFC-SCHED-19) -- read-only guard that tests whether
 * codebase_chunk_index.content_embedding_768 IS NOT NULL can be trusted as an eligibility filter.
 * It looks for specific placeholder signatures; it cannot prove every vector is valid.
 *
 *   node scripts/atlas/embedding-validity-guard-v1.mjs [--parity-sample=40]
 *
 * Checks (all in one REPEATABLE READ READ ONLY transaction, rolled back; HTTP calls are read-only):
 *   C1 dimensions: vector_dims = 768 for every embedded row
 *   C2 norms: zero-norm and non-unit (|norm-1| > 0.01) rows
 *   C3 duplicates: identical full vectors, split into benign (identical trimmed text) vs SUSPECT (different text)
 *   C4 re-embed parity: deterministic sample re-embedded via the Go embedding service (:8097 /embed); cosine vs stored
 *   C5 lineage: how many rows have no embedding_version / embedding_eligible (informational)
 * pgvector rejects NaN/Infinity on insert, so non-finite values are not checked separately.
 * Writes nothing except a local receipt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const arg = (n, d) => { const a = process.argv.find((v) => v.startsWith(`${n}=`)); return a ? Number(a.slice(n.length + 1)) : d; };
const SAMPLE = Math.max(0, Math.min(200, arg('--parity-sample', 40)));
const EMBED_URL = process.env.EMBED_URL || 'http://127.0.0.1:8097/embed';
const STAMP = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const RECEIPT = path.join(REPO_ROOT, '.tmp', 'atlas', `embedding-validity-guard-v1.${STAMP}.${randomUUID()}.receipt.json`);
const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x) * Math.sqrt(y)); };
const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : null;

async function main() {
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 280000 });
  const c = await pool.connect();
  const R = { schema: 'atlas.embedding-validity-guard.v1', task: 'AFC-SCHED-19', generatedAt: new Date().toISOString(), writesPerformed: false, canonicalAuthority: false, checks: {} };
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const one = async (sql, p) => (await c.query(sql, p)).rows[0];

    R.checks.C1_dimensions = await one(`SELECT count(*)::int embedded, count(*) FILTER (WHERE vector_dims(content_embedding_768) <> 768)::int wrong_dims FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL`);
    R.checks.C2_norms = await one(`SELECT count(*) FILTER (WHERE n = 0)::int zero_norm, count(*) FILTER (WHERE abs(n - 1) > 0.01)::int non_unit, round(min(n)::numeric, 4)::float min_norm, round(max(n)::numeric, 4)::float max_norm FROM (SELECT vector_norm(content_embedding_768) n FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL) t`);
    R.checks.C3_duplicates = await one(`WITH fp AS (SELECT subvector(content_embedding_768,1,16)::text f, md5(content_embedding_768::text) m, md5(btrim(content)) tm FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL),
      dupf AS (SELECT f FROM fp GROUP BY f HAVING count(*) > 1),
      c AS (SELECT fp.* FROM fp JOIN dupf USING (f)),
      g AS (SELECT m, count(*) n, count(DISTINCT tm) texts FROM c GROUP BY m HAVING count(*) > 1)
      SELECT count(*)::int exact_dup_groups, coalesce(sum(n),0)::int rows_in_exact_dup_groups,
             count(*) FILTER (WHERE texts = 1)::int benign_groups_same_trimmed_text,
             count(*) FILTER (WHERE texts > 1)::int suspect_groups_different_text,
             coalesce(sum(n) FILTER (WHERE texts > 1),0)::int suspect_rows FROM g`);
    R.checks.C5_lineage = await one(`SELECT count(*) FILTER (WHERE embedding_version IS NULL)::int no_embedding_version, count(*) FILTER (WHERE embedding_eligible IS NOT TRUE)::int not_eligible_flag, count(*) FILTER (WHERE embedding_eligible IS TRUE)::int eligible_flag_true FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL`);

    if (SAMPLE > 0) {
      const rows = (await c.query(`SELECT id::text id, content, content_embedding_768::text v, embedding_version FROM codebase_chunk_index
        WHERE content_embedding_768 IS NOT NULL AND length(btrim(content)) > 20 ORDER BY md5(id::text) LIMIT $1`, [SAMPLE])).rows;
      const sims = []; let failed = 0;
      for (const r of rows) {
        try {
          const res = await fetch(EMBED_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts: [r.content] }), signal: AbortSignal.timeout(30000) });
          const e = (await res.json()).embeddings?.[0];
          if (!Array.isArray(e) || e.length !== 768) { failed++; continue; }
          sims.push(cos(JSON.parse(r.v), e));
        } catch { failed++; }
      }
      sims.sort((a, b) => a - b);
      R.checks.C4_reembed_parity = { sampled: rows.length, compared: sims.length, embedFailures: failed, endpoint: EMBED_URL, recipe: 'raw chunk content, as stored',
        min: sims[0] ?? null, p10: pct(sims, 0.1), median: pct(sims, 0.5), max: sims.at(-1) ?? null,
        below_0_99: sims.filter((s) => s < 0.99).length, below_0_95: sims.filter((s) => s < 0.95).length };
    } else R.checks.C4_reembed_parity = { status: 'NOT_EXERCISED' };
  } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); await pool.end().catch(() => {}); }

  const k = R.checks; const reasons = [];
  if (k.C1_dimensions.wrong_dims > 0) reasons.push(`wrong_dims=${k.C1_dimensions.wrong_dims}`);
  if (k.C2_norms.zero_norm > 0) reasons.push(`zero_norm=${k.C2_norms.zero_norm}`);
  if (k.C2_norms.non_unit > 0) reasons.push(`non_unit_norm=${k.C2_norms.non_unit}`);
  if (k.C3_duplicates.suspect_groups_different_text > 0) reasons.push(`duplicate_vectors_for_different_text=${k.C3_duplicates.suspect_rows}`);
  if (k.C4_reembed_parity.below_0_95 > 0) reasons.push(`reembed_cosine_below_0.95=${k.C4_reembed_parity.below_0_95}/${k.C4_reembed_parity.compared}`);
  R.suspectReasons = reasons;
  R.status = reasons.length ? 'SUSPECT_SIGNATURES_FOUND' : 'NO_PLACEHOLDER_SIGNATURE_FOUND';
  R.note = 'Absence of these signatures is not proof of validity. Lineage (embedding_version) is unknown for the rows in C5; per-row validity is not persisted (no writes).';
  fs.mkdirSync(path.dirname(RECEIPT), { recursive: true });
  fs.writeFileSync(RECEIPT, JSON.stringify(R, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(R.checks, null, 1));
  console.log(`status=${R.status}${reasons.length ? ' reasons=' + reasons.join(',') : ''}`);
  console.log(`receipt: ${path.relative(REPO_ROOT, RECEIPT)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
