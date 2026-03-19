/**
 * Quick search validation — runs the hybrid SQL used by /api/library/search
 * but directly (no auth required). Also checks Qdrant collection status.
 */
import pkg from 'pg';
const { Pool } = pkg;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

const p = new Pool({ connectionString: DB_URL });

// 1. Quick Qdrant collection check
console.log('\n=== Checking Qdrant legal_library_chunks collection ===');
try {
  const r = await fetch(`${QDRANT_URL}/collections/legal_library_chunks`);
  if (r.ok) {
    const data: any = await r.json();
    console.log(`  Points count: ${data.result?.points_count ?? 'unknown'}`);
    console.log(`  Status: ${data.result?.status ?? 'unknown'}`);
  } else {
    console.log(`  HTTP ${r.status} — collection may not exist`);
  }
} catch (e: any) {
  console.log(`  Qdrant unreachable: ${e.message}`);
}

// 2. Test FTS lexical search directly
const queries = [
  'habeas corpus federal',
  'California constitution article 1 rights',
  'human trafficking penalties California',
  'due process equal protection',
];

console.log('\n=== FTS Lexical search tests ===');
for (const q of queries) {
  const res = await p.query(`
    SELECT
      lc.chunk_text,
      ld.title,
      ld.corpus_type,
      ts_rank(ln.tsv, plainto_tsquery('english', $1)) AS score
    FROM legal_nodes ln
    JOIN legal_chunks lc ON lc.legal_node_id = ln.id
    JOIN library_documents ld ON ld.id = ln.document_id
    WHERE ln.tsv @@ plainto_tsquery('english', $1)
    ORDER BY score DESC
    LIMIT 3
  `, [q]);

  console.log(`\n  Query: "${q}" → ${res.rowCount} hits`);
  res.rows.forEach((r: any) => {
    console.log(`    [${r.corpus_type}] ${r.title.slice(0, 50)} (score=${parseFloat(r.score).toFixed(4)})`);
    console.log(`      "${r.chunk_text.slice(0, 120).replace(/\n/g,' ')}..."`);
  });
}

// 3. Check for missing embeddings detail
const missing = await p.query(`
  SELECT lc.id, ld.title, lc.chunk_index
  FROM legal_chunks lc
  JOIN legal_nodes ln ON ln.id = lc.legal_node_id
  JOIN library_documents ld ON ld.id = ln.document_id
  WHERE lc.embedding IS NULL
  LIMIT 10
`);
if (missing.rowCount && missing.rowCount > 0) {
  console.log(`\n=== ${missing.rowCount}+ chunks missing embeddings ===`);
  missing.rows.forEach((r: any) => console.log(`  ${r.title.slice(0,50)} chunk #${r.chunk_index}`));
}

await p.end();
