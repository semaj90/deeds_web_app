#!/usr/bin/env node
/**
 * Populate feature_lexical -- deterministic keyword/BM25-term/statistics extraction.
 *
 * Salvaged 2026-09-13: this table was created in
 * sveltekit-frontend/drizzle/0043_feature_extraction_tables.sql (2026-07-21) with a real, distinct
 * design (regex-tokenizer, no spaCy dependency -- complementary to feature_lexical_facts, which is
 * the spaCy-based POS/linguistic table) but never had a writer. Verified live before building this:
 * its sibling table from the same migration, feature_domain, has 61,659 real rows -- this wasn't a
 * wholesale-abandoned migration, feature_lexical specifically was just never wired up.
 *
 * Purely deterministic (no HTTP calls, no model) -- can run over the full atlas_packets population
 * cheaply, unlike the spaCy-dependent feature_lexical_facts pass.
 *
 * Usage:
 *   node scripts/atlas/populate-feature-lexical.mjs --dry-run --limit=100
 *   node scripts/atlas/populate-feature-lexical.mjs --apply --limit=5000
 */

import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? '1000');
const BATCH_SIZE = Number(process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1] ?? '500');
const VERBOSE = process.argv.includes('--verbose');

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });

// Small, generic English + code-noise stopword list -- deliberately short and conservative
// (this is a keyword FILTER, not a linguistic claim; over-filtering loses real signal).
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'while', 'do', 'this', 'that',
  'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in', 'on', 'at',
  'by', 'with', 'from', 'as', 'it', 'its', 'not', 'no', 'yes', 'can', 'will', 'would', 'should',
  'could', 'has', 'have', 'had', 'const', 'let', 'var', 'function', 'return', 'import', 'export',
  'default', 'null', 'undefined', 'true', 'false', 'type', 'interface', 'class', 'new', 'async',
  'await', 'src', 'lib', 'server', 'app',
]);

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((tok) => tok.length >= 3 && tok.length <= 40 && !/^\d+$/.test(tok));
}

function computeLexicalStats(text, pathTokens, astIdentifiers) {
  const tokens = tokenize(text);
  const tokenCount = tokens.length;
  const freq = new Map();
  for (const tok of tokens) freq.set(tok, (freq.get(tok) ?? 0) + 1);

  const uniqueTokens = freq.size;
  const keywords = [...freq.entries()]
    .filter(([tok]) => !STOPWORDS.has(tok))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 32)
    .map(([tok]) => tok);

  // bm25_terms: the same significant-term set this packet's document would be indexed under for
  // term-frequency-based search -- deliberately the same list as `keywords` (this table's own
  // migration comment describes them as parallel, not independently-derived, fields).
  const bm25Terms = keywords;

  const fileTokens = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([tok]) => tok);

  // identifiers: reuse REAL ast_symbols identity when available (this session's own AST work)
  // rather than re-deriving names from scratch via regex -- avoids a second, lower-quality
  // owner for the same information.
  const identifiers = astIdentifiers.length > 0 ? astIdentifiers.slice(0, 64) : pathTokens.slice(0, 16);

  const keywordDensity = tokenCount > 0 ? Number((keywords.length / tokenCount).toFixed(4)) : 0;

  return { keywords, bm25Terms, identifiers, fileTokens, tokenCount, uniqueTokens, keywordDensity };
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT
        ap.packet_key,
        ap.source_ref,
        COALESCE(ap.summary, '') || ' ' || COALESCE(ap.payload->>'title', '') AS text,
        apf.lexical_features,
        apf.ast_symbols
      FROM atlas_packets ap
      LEFT JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key
      LEFT JOIN feature_lexical fl ON fl.packet_key = ap.packet_key
      WHERE fl.packet_key IS NULL
      ORDER BY ap.packet_key
      LIMIT $1
      `,
      [LIMIT],
    );

    const planned = rows.map((row) => {
      const pathTokens = row.lexical_features ?? [];
      const astIdentifiers = (row.ast_symbols ?? [])
        .map((sym) => {
          const idx = sym.indexOf(':');
          return idx >= 0 ? sym.slice(idx + 1) : sym;
        })
        .filter(Boolean);
      const stats = computeLexicalStats(row.text, pathTokens, astIdentifiers);
      return { packet_key: row.packet_key, source_ref: row.source_ref, ...stats };
    }).filter((item) => item.tokenCount > 0);

    console.log(JSON.stringify({
      apply: APPLY,
      fetched: rows.length,
      planned: planned.length,
      sample: planned.slice(0, 3),
    }, null, 2));

    if (!APPLY) return;

    let written = 0;
    for (let i = 0; i < planned.length; i += BATCH_SIZE) {
      const batch = planned.slice(i, i + BATCH_SIZE);
      await client.query('BEGIN');
      try {
        for (const item of batch) {
          const result = await client.query(
            `
            INSERT INTO feature_lexical
              (packet_key, source_ref, keywords, bm25_terms, identifiers, file_tokens,
               token_count, unique_tokens, keyword_density, extraction_method, materialization_version)
            VALUES ($1, $2, $3::text[], $4::text[], $5::text[], $6::text[], $7, $8, $9, 'regex-tokenizer', 1)
            ON CONFLICT (packet_key, source_ref) DO UPDATE SET
              keywords = EXCLUDED.keywords,
              bm25_terms = EXCLUDED.bm25_terms,
              identifiers = EXCLUDED.identifiers,
              file_tokens = EXCLUDED.file_tokens,
              token_count = EXCLUDED.token_count,
              unique_tokens = EXCLUDED.unique_tokens,
              keyword_density = EXCLUDED.keyword_density,
              updated_at = NOW()
            `,
            [
              item.packet_key, item.source_ref, item.keywords, item.bm25Terms,
              item.identifiers, item.fileTokens, item.tokenCount, item.uniqueTokens, item.keywordDensity,
            ],
          );
          written += result.rowCount;
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      if (VERBOSE) console.log(`   ...${Math.min(i + BATCH_SIZE, planned.length)}/${planned.length}`);
    }

    const verify = await client.query('SELECT count(*)::int AS total FROM feature_lexical');
    console.log(JSON.stringify({ status: 'applied', written, total_in_table: verify.rows[0].total }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
