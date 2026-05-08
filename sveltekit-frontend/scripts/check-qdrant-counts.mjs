#!/usr/bin/env node
// Quick check of Qdrant collection point counts and vector modes

const QDRANT = 'http://127.0.0.1:6333';
const COLLECTIONS = [
  'evidence_vectors', 'case_chunks', 'court_opinions', 'legal_canon_chunks',
  'legal_documents', 'evidence_items', 'legal_cases', 'knowledge_base',
  'chat_messages', 'poi_profiles', 'topic_clusters'
];

async function main() {
  console.log('=== Qdrant Collection Point Counts ===\n');
  for (const col of COLLECTIONS) {
    try {
      const r = await fetch(`${QDRANT}/collections/${col}`);
      if (!r.ok) { console.log(`${col}: HTTP ${r.status}`); continue; }
      const j = await r.json();
      const pts = j.result?.points_count ?? 0;
      const v = j.result?.config?.params?.vectors;
      const isNamed = v && typeof v === 'object' && v.size === undefined;
      const mode = isNamed ? `named:[${Object.keys(v).join(',')}]` : 'unnamed';
      console.log(`${col.padEnd(25)} ${String(pts).padStart(6)} pts | ${mode}`);
    } catch (e) {
      console.log(`${col.padEnd(25)} ERROR: ${e.message}`);
    }
  }

  // Also check evidence table counts
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });
  try {
    const tables = ['evidence', 'evidence_vectors', 'case_notes', 'legal_documents', 'citations', 'statutes'];
    console.log('\n=== PostgreSQL Table Counts ===\n');
    for (const t of tables) {
      try {
        const r = await pool.query(`SELECT COUNT(*) as cnt FROM ${t}`);
        console.log(`${t.padEnd(25)} ${String(r.rows[0].cnt).padStart(6)} rows`);
      } catch (e) {
        console.log(`${t.padEnd(25)} ERROR: ${e.message.split('\n')[0]}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
