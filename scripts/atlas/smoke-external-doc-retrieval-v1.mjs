#!/usr/bin/env node
/**
 * Retrieval smoke over the admitted external-doc chunks (READ ONLY; no writes, no cache population, no authorization phrase).
 * Three separately measured query classes against atlas_external_doc_chunks (Postgres is truth):
 *   exact      - a literal api_signature / symbol taken from the corpus itself; must be found by lexical (FTS + symbol array) lane
 *   near-exact - the same chunk's heading path reworded as a question; lexical and dense lanes are reported separately
 *   breadth    - a concept question; dense lane only, reports distinct pages/products in top-k
 * Dense uses Ollama embeddinggemma /api/embed with the EmbeddingGemma query prompt. The corpus executor is NOT proven identical to Ollama
 * (same dimension != same representation), so dense numbers are indicative until a parity receipt for the corpus executor exists.
 *   node scripts/atlas/smoke-external-doc-retrieval-v1.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const K = 10;
const REPORT = path.join(REPO_ROOT, 'docs/reports/external-doc-retrieval-smoke-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 30000 });

const embedQuery = async (q) => {
  const r = await fetch(`${OLLAMA}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', input: [`task: search result | query: ${q}`], truncate: false }) });
  if (!r.ok) throw new Error(`OLLAMA_EMBED_${r.status}`);
  const v = (await r.json()).embeddings?.[0];
  if (!Array.isArray(v) || v.length !== 768 || v.some((x) => !Number.isFinite(x))) throw new Error('QUERY_VECTOR_INVALID');
  return v;
};
const lexical = async (q) => (await pool.query(
  `SELECT c.chunk_id, p.url FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id
    WHERE c.search_vector @@ websearch_to_tsquery('english', $1) OR $1 = ANY(c.symbols) OR $1 = ANY(c.api_signatures)
    ORDER BY ($1 = ANY(c.symbols) OR $1 = ANY(c.api_signatures)) DESC, ts_rank(c.search_vector, websearch_to_tsquery('english', $1)) DESC, c.chunk_id LIMIT ${K}`, [q])).rows;
const dense = async (q) => {
  const v = `[${(await embedQuery(q)).join(',')}]`;
  return (await pool.query(
    `SELECT c.chunk_id, p.url, 1 - (c.content_embedding <=> $1::vector) AS cos FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id
      WHERE c.content_embedding IS NOT NULL ORDER BY c.content_embedding <=> $1::vector LIMIT ${K}`, [v])).rows;
};

const out = { schema: 'atlas.external-doc-retrieval-smoke.v1', generatedAt: new Date().toISOString(), canonicalAuthority: false, writesPerformed: false, cacheTouched: false, cases: [], error: null };
try {
  const total = (await pool.query('SELECT count(*)::int n, count(content_embedding)::int embedded, count(qdrant_point_id)::int qdrant FROM atlas_external_doc_chunks')).rows[0];
  out.corpus = total;
  // The exact case must use a signature that occurs in exactly one chunk (a non-unique one is a bad test, not a retrieval fault). Cases are derived from the corpus so they cannot drift: one signature chunk (exact/near-exact), one concept query (breadth).
  const sig = (await pool.query(`SELECT c.chunk_id, u.sig, c.heading_path FROM atlas_external_doc_chunks c CROSS JOIN LATERAL unnest(c.api_signatures) AS u(sig) WHERE cardinality(c.heading_path) > 0 AND length(u.sig) >= 12 AND (SELECT count(*) FROM atlas_external_doc_chunks d WHERE u.sig = ANY(d.api_signatures)) = 1 ORDER BY c.chunk_id LIMIT 1`)).rows[0];
  const cases = [];
  if (sig) {
    cases.push({ cls: 'exact', query: sig.sig, expectChunk: sig.chunk_id, lanes: ['lexical'] });
    cases.push({ cls: 'near-exact', query: sig.heading_path.slice(-2).join(' '), expectChunk: sig.chunk_id, lanes: ['lexical', 'dense'] });
  }
  cases.push({ cls: 'breadth', query: 'how do I define typed procedures and call them from a client', expectChunk: null, lanes: ['dense'] });
  for (const c of cases) {
    const res = { cls: c.cls, query: c.query, expectChunk: c.expectChunk, lanes: {} };
    for (const lane of c.lanes) {
      try {
        const rows = lane === 'lexical' ? await lexical(c.query) : await dense(c.query);
        const rank = c.expectChunk ? rows.findIndex((r) => r.chunk_id === c.expectChunk) + 1 : null;
        res.lanes[lane] = { status: 'OK', returned: rows.length, expectedRank: rank === 0 ? null : rank, distinctPages: new Set(rows.map((r) => r.url)).size, top: rows.slice(0, 3).map((r) => ({ chunk_id: r.chunk_id, url: r.url, cos: r.cos ?? undefined })) };
      } catch (e) { res.lanes[lane] = { status: 'UNAVAILABLE', reason: String(e.message ?? e).slice(0, 120) }; }
    }
    out.cases.push(res);
  }
} catch (e) { out.error = String(e.message ?? e).slice(0, 160); } finally { await pool.end(); }
fs.writeFileSync(REPORT, JSON.stringify(out, null, 2) + '\n');
if (out.error) console.log('ERROR', out.error);
console.log('corpus', JSON.stringify(out.corpus));
for (const c of out.cases) for (const [lane, r] of Object.entries(c.lanes)) console.log(`${c.cls.padEnd(10)} ${lane.padEnd(8)} ${r.status} ${r.status === 'OK' ? `returned=${r.returned} expectedRank=${r.expectedRank} pages=${r.distinctPages}` : r.reason}`);
