import pkg from 'pg';
const { Pool } = pkg;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const p = new Pool({ connectionString: DB_URL });

// 1. Corpus breakdown
const corpus = await p.query(`
  SELECT corpus_type, processing_status, COUNT(*)
  FROM library_documents
  GROUP BY corpus_type, processing_status
  ORDER BY corpus_type
`);
console.log('\n=== Documents by corpus type + status ===');
corpus.rows.forEach((r: any) => console.log(`  ${r.corpus_type} / ${r.processing_status}: ${r.count}`));

// 2. Embedding coverage
const embeds = await p.query(`
  SELECT
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS with_embed,
    COUNT(*) AS total
  FROM legal_chunks
`);
console.log('\n=== Chunk embedding coverage ===');
console.log(`  ${embeds.rows[0].with_embed} / ${embeds.rows[0].total} chunks have embeddings`);

// 3. Top documents
const docs = await p.query(`
  SELECT ld.title, ld.corpus_type, ld.processing_status,
    COUNT(ln.id) node_count,
    SUM(lc.cnt) chunk_count
  FROM library_documents ld
  LEFT JOIN legal_nodes ln ON ln.document_id = ld.id
  LEFT JOIN (SELECT legal_node_id, COUNT(*) cnt FROM legal_chunks GROUP BY legal_node_id) lc ON lc.legal_node_id = ln.id
  GROUP BY ld.id, ld.title, ld.corpus_type, ld.processing_status
  ORDER BY chunk_count DESC NULLS LAST
  LIMIT 15
`);
console.log('\n=== Top 15 documents (by chunk count) ===');
docs.rows.forEach((r: any) => console.log(`  [${r.corpus_type}] ${r.title.slice(0,60)} | nodes=${r.node_count} chunks=${r.chunk_count ?? 0} | ${r.processing_status}`));

// 4. Jurisdictions
const jurs = await p.query(`
  SELECT j.code, j.name, COUNT(ld.id) docs
  FROM jurisdictions j
  LEFT JOIN library_documents ld ON ld.jurisdiction_id = j.id
  GROUP BY j.id, j.code, j.name
  ORDER BY docs DESC
`);
console.log('\n=== Documents per jurisdiction ===');
jurs.rows.forEach((r: any) => console.log(`  ${r.code}: ${r.docs} docs`));

await p.end();
