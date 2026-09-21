#!/usr/bin/env node
/**
 * SEM768-GATE-03: RECIPE CENSUS. Which embedding recipes do the two stored 768 columns of codebase_chunk_index actually hold?
 * READ-ONLY (Postgres reads + local Ollama embeds + one small JSON receipt). Answers "what exists", NOT "which recipe should win".
 *
 * Strata (deterministic md5 order, N rows each): both columns populated / content_embedding only / content_embedding_768 only /
 * rows tagged embedding_model = 'embeddinggemma:latest:eg-task-prefix-v1'. Each stored vector is compared with FRESH embeddings of the
 * row text under raw, `title: none | text:` and `title: {relative_path} | text:`. Cosine >= THRESHOLD names the recipe, else UNKNOWN
 * (preserved, never guessed). Also breaks results down by source root and content length.
 *
 * Usage: node scripts/atlas/audit-embedding-recipe-census-v1.mjs [--per-stratum=100]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(repoRoot, 'sveltekit-frontend', 'package.json'));
const { Client } = require('pg');
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? '').split('=')[1] ?? d;
const PER = Number(arg('per-stratum', 100));
const THRESHOLD = 0.995;
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';

function envVal(k) {
  if (process.env[k]) return process.env[k];
  for (const f of ['.env.local', '.env']) {
    try {
      const m = fs.readFileSync(path.join(repoRoot, 'sveltekit-frontend', f), 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm'));
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* next */ }
  }
  return undefined;
}
const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };
async function embedMany(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const r = await fetch(`${OLLAMA}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'embeddinggemma:latest', input: texts.slice(i, i + 32).map((t) => t.slice(0, 2000)) }) });
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    out.push(...(await r.json()).embeddings);
  }
  return out;
}
const RECIPES = {
  raw: (r) => r.content,
  title_none: (r) => `title: none | text: ${r.content}`,
  title_relative_path: (r) => `title: ${r.relative_path} | text: ${r.content}`,
};
const STRATA = {
  both_columns: 'content_embedding IS NOT NULL AND content_embedding_768 IS NOT NULL',
  content_embedding_only: 'content_embedding IS NOT NULL AND content_embedding_768 IS NULL',
  content_embedding_768_only: 'content_embedding IS NULL AND content_embedding_768 IS NOT NULL',
  tagged_eg_task_prefix_v1: "embedding_model = 'embeddinggemma:latest:eg-task-prefix-v1'",
};
const lenBucket = (n) => (n < 300 ? '<300' : n < 800 ? '300-799' : n < 1500 ? '800-1499' : '>=1500');
const rootOf = (p) => String(p ?? '').replace(/\\/g, '/').split('/').slice(0, 2).join('/') || '(none)';

const db = new Client({ connectionString: envVal('DATABASE_URL'), statement_timeout: 120000 });
await db.connect();
const receipt = { schema: 'atlas.embedding-recipe-census.v1', canonicalAuthority: false, mode: 'READ_ONLY', perStratum: PER, threshold: THRESHOLD, strata: {} };

for (const [stratum, cond] of Object.entries(STRATA)) {
  const total = Number((await db.query(`SELECT count(*) FROM codebase_chunk_index WHERE ${cond}`)).rows[0].count);
  const rows = (await db.query(
    `SELECT id::text id, relative_path, content, embedding_model, content_embedding::text ce, content_embedding_768::text ce768
       FROM codebase_chunk_index WHERE ${cond} AND content IS NOT NULL AND length(content) > 40
      ORDER BY md5(id::text || 'census-v1') LIMIT $1`, [PER],
  )).rows;
  const fresh = {};
  for (const [name, fn] of Object.entries(RECIPES)) fresh[name] = await embedMany(rows.map(fn));
  const cols = { content_embedding: {}, content_embedding_768: {} };
  const byRoot = {}, byLen = {};
  const tally = (bucket, key, label) => { bucket[key] ??= {}; bucket[key][label] = (bucket[key][label] ?? 0) + 1; };
  rows.forEach((row, i) => {
    for (const [col, txt] of [['content_embedding', row.ce], ['content_embedding_768', row.ce768]]) {
      if (!txt) continue;
      const v = JSON.parse(txt);
      const scores = Object.fromEntries(Object.keys(RECIPES).map((n) => [n, cos(v, fresh[n][i])]));
      const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
      const label = top[1] >= THRESHOLD ? top[0] : 'UNKNOWN';
      cols[col][label] = (cols[col][label] ?? 0) + 1;
      tally(byRoot, `${col}|${rootOf(row.relative_path)}`, label);
      tally(byLen, `${col}|${lenBucket(row.content.length)}`, label);
    }
  });
  const topRoots = Object.fromEntries(Object.entries(byRoot).sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0)).slice(0, 8));
  receipt.strata[stratum] = {
    populationRows: total,
    sampled: rows.length,
    embeddingModelTagsInSample: rows.reduce((m, r) => { m[r.embedding_model ?? '(null)'] = (m[r.embedding_model ?? '(null)'] ?? 0) + 1; return m; }, {}),
    recipeHistogramByColumn: cols,
    byContentLength: byLen,
    topSourceRoots: topRoots,
  };
  console.log(`${stratum}: population=${total} sampled=${rows.length} ce=${JSON.stringify(cols.content_embedding)} ce768=${JSON.stringify(cols.content_embedding_768)}`);
}
await db.end();
receipt.databaseWrites = false;
receipt.outcome = 'RECIPE_CENSUS_PROVEN_UNKNOWN_ROWS_PRESERVED';
fs.writeFileSync(path.join(repoRoot, 'docs/reports/embedding-recipe-census-v1.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log('receipt written: docs/reports/embedding-recipe-census-v1.json');
