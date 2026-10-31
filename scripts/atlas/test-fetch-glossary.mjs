import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

async function testGlossaryFetch() {
  const query = 'probable cause';
  const candidateTerms = [query.toLowerCase()];
  
  const glossaryRes = await pool.query(
    `SELECT
      lg.id,
      lg.term,
      lg.definition,
      lg.category,
      lg.jurisdiction,
      NULL::text AS citation,
      CASE
        WHEN lower(lg.term) = ANY($2::text[]) THEN 1.0
        ELSE ts_rank(
          to_tsvector('english', coalesce(lg.term, '') || ' ' || coalesce(lg.definition, '')),
          websearch_to_tsquery('english', $1)
        )
      END AS confidence
     FROM legal_glossary lg
     WHERE (
      to_tsvector('english', coalesce(lg.term, '') || ' ' || coalesce(lg.definition, '')) @@ websearch_to_tsquery('english', $1)
      OR lower(lg.term) = ANY($2::text[])
      OR lg.term ILIKE ANY($3::text[])
     )
     ORDER BY confidence DESC
     LIMIT 5`,
    [query, candidateTerms, candidateTerms.map(t => `%${t}%`)]
  );

  console.log(`Query: "${query}" -> Found ${glossaryRes.rows.length} matches:`);
  for (const r of glossaryRes.rows) {
    console.log(`- [${r.confidence}] ${r.term}: ${r.definition.slice(0, 100)}...`);
  }
  await pool.end();
}

testGlossaryFetch().catch(e => {
  console.error(e);
  pool.end();
  process.exit(1);
});
