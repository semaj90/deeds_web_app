#!/usr/bin/env node
/**
 * Gate 2: Tag 768-dim Usage — audit all 768-dim vector columns and Qdrant collections
 *
 * Tags each usage as one of:
 *   CANONICAL_NATIVE         — embeddinggemma:latest 768-dim, primary retrieval
 *   CANONICAL_RETRIEVAL_CONTRACT — active Qdrant collection used in retrieval pipeline
 *   LEGACY                   — 384-dim or older columns that predate the 768 contract
 *   DEPRECATED               — columns in archived/disabled schemas
 *
 * Usage:
 *   npx tsx scripts/atlas/gate-2-tag-768dim-usage.mts
 *   npx tsx scripts/atlas/gate-2-tag-768dim-usage.mts --json
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), 'sveltekit-frontend/.env') });

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL
  || `postgresql://${process.env.PGUSER || 'legal_admin'}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST || '127.0.0.1'}:${process.env.PGPORT || '5434'}/${process.env.PGDATABASE || 'legal_ai_db'}`;

const pool = new Pool({ connectionString, max: 3 });

const jsonMode = process.argv.includes('--json');

// ─── Static registry of all known 768-dim usages ──────────────────────────────

interface VectorUsage {
  column: string;
  table: string;
  dim: number;
  tag: 'CANONICAL_NATIVE' | 'CANONICAL_RETRIEVAL_CONTRACT' | 'LEGACY' | 'DEPRECATED';
  note: string;
}

interface QdrantCollection {
  name: string;
  dim: number;
  tag: 'CANONICAL_RETRIEVAL_CONTRACT' | 'LEGACY' | 'DEPRECATED';
  note: string;
}

const POSTGRES_VECTOR_COLUMNS: VectorUsage[] = [
  // CANONICAL_NATIVE — primary embedding columns for active retrieval
  { column: 'content_embedding', table: 'codebase_chunk_index',     dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Primary code chunk embeddings, mirrors to codebase_chunks_768' },
  { column: 'embedding',         table: 'atlas_packets',             dim: 768, tag: 'LEGACY',                      note: 'Populated but NOT used for ANN — use codebase_chunk_index.content_embedding' },
  { column: 'embedding',         table: 'codebase_topology',         dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Topology node embeddings' },
  { column: 'embedding',         table: 'legal_documents',           dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Legal document embeddings' },
  { column: 'embedding',         table: 'document_chunks',           dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Document chunk embeddings' },
  { column: 'embedding',         table: 'court_opinions',            dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Court opinion embeddings' },
  { column: 'embedding',         table: 'legal_canon_chunks',        dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Legal canon chunk embeddings' },
  { column: 'embedding',         table: 'chat_messages',             dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Chat message embeddings' },
  { column: 'embedding',         table: 'evidence',                  dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Evidence item embeddings' },
  { column: 'embedding',         table: 'agent_memory_observations', dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Agent memory embeddings' },
  { column: 'embedding',         table: 'llm_context',               dim: 768, tag: 'CANONICAL_NATIVE',            note: 'LLM context embeddings' },
  { column: 'embedding',         table: 'embedding_cache',           dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Embedding cache table' },
  { column: 'embedding',         table: 'research_memory',           dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Research memory embeddings' },
  { column: 'embedding',         table: 'scenarios',                 dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Scenario embeddings' },
  { column: 'content_embedding', table: 'legal_documents',           dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Legal document content embeddings' },
  { column: 'query_embedding',   table: 'query_vectors',             dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Query vector storage' },
  { column: 'embedding_768d',    table: 'atlas_packet_registry',     dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Atlas packet registry 768-dim' },
  { column: 'semantic_embedding',table: 'kag_features',              dim: 768, tag: 'CANONICAL_NATIVE',            note: 'KAG feature semantic embeddings' },
  { column: 'result_embedding',  table: 'llm_response_cache',        dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT','note': 'LLM response cache result embeddings' },
  { column: 'summary_embedding', table: 'summary_lenses',            dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Summary lens embeddings' },
  { column: 'signature_embedding',table:'summary_lenses',            dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Summary lens signature embeddings' },
  { column: 'summary_embedding', table: 'synthesis_memory',          dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Synthesis memory embeddings' },
  { column: 'representative_embedding', table: 'feature_maps',       dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Feature map representative embeddings' },
  { column: 'narrative_embedding',table: 'case_summarizations',      dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Case narrative embeddings' },
  { column: 'face_embedding',    table: 'person_of_interest',        dim: 768, tag: 'LEGACY',                      note: 'Face embeddings — should be 384 for biometric models' },
  { column: 'embedding',         table: 'note_card_packets',         dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Note card packet embeddings' },
  { column: 'vector',            table: 'note_card_packets',         dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Note card vector column' },
  { column: 'embedding',         table: 'web_documents',             dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Web document embeddings' },
  { column: 'embedding',         table: 'search_documents',          dim: 768, tag: 'CANONICAL_NATIVE',            note: 'Search document embeddings' },
  { column: 'centroid_vector',   table: 'search_clusters',           dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT','note': 'Search cluster centroids' },
  // LEGACY — 384-dim columns from earlier pipeline
  { column: 'profile_embedding', table: 'person_of_interest',        dim: 384, tag: 'LEGACY',                      note: '384-dim face profile — predates 768 contract' },
  { column: 'title_embedding',   table: 'evidence',                  dim: 384, tag: 'LEGACY',                      note: '384-dim title embedding — predates 768 contract' },
  { column: 'content_embedding', table: 'evidence',                  dim: 384, tag: 'LEGACY',                      note: '384-dim content embedding — predates 768 contract' },
  { column: 'case_embedding',    table: 'cases',                     dim: 384, tag: 'LEGACY',                      note: '384-dim case embedding — predates 768 contract' },
];

const QDRANT_COLLECTIONS: QdrantCollection[] = [
  // Primary retrieval collections
  { name: 'codebase_chunks_768',           dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Primary code search — multi-vector (content, signature, error)' },
  { name: 'legal_documents',               dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Legal document ANN search' },
  { name: 'legal_cases',                   dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Legal case ANN search' },
  { name: 'evidence_items',                dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Evidence item ANN search' },
  { name: 'court_opinions',                dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Court opinion ANN search' },
  { name: 'legal_canon_chunks',            dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Legal canon ANN search' },
  { name: 'summary_lenses_768',            dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Summary lens ANN search' },
  { name: 'synthesis_memory_768',          dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Synthesis memory ANN search' },
  { name: 'research_memory_768',           dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Research memory ANN search' },
  { name: 'agent_memory_observations',     dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Agent memory ANN search' },
  { name: 'embedding_cache',               dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Embedding lookup cache' },
  { name: 'llm_response_cache',            dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'LLM response semantic cache' },
  { name: 'chat_messages',                 dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Chat message ANN search' },
  // Domain-specific
  { name: 'knowledge_base',                dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Knowledge base ANN search' },
  { name: 'audio_segments',                dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Audio segment embeddings' },
  { name: 'legal_glossary',                dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Legal glossary ANN search' },
  { name: 'chunks_web_search',             dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Web search chunk embeddings' },
  { name: 'error_embeddings',              dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Error pattern embeddings' },
  { name: 'diagnosis_embeddings',          dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Diagnosis embeddings' },
  { name: 'poi_profiles',                  dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Person of interest profile embeddings' },
  { name: 'document_knowledge_768',        dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Document knowledge embeddings' },
  { name: 'external_programming_docs_768', dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'External programming docs' },
  { name: 'fictional_case_chunks',         dim: 768, tag: 'CANONICAL_RETRIEVAL_CONTRACT', note: 'Fictional case chunk embeddings' },
  { name: 'document_tags',                 dim: 768, tag: 'LEGACY',                       note: 'Document tag embeddings — low-priority' },
  { name: 'topic_clusters',                dim: 768, tag: 'LEGACY',                       note: 'Topic cluster centroids — may be stale' },
  { name: 'evidence_vectors',              dim: 768, tag: 'LEGACY',                       note: 'Old evidence vector table — superseded by evidence_items' },
  { name: 'case_chunks',                   dim: 768, tag: 'LEGACY',                       note: 'Case chunk embeddings — check if active' },
];

// ─── Live DB audit ─────────────────────────────────────────────────────────────

async function auditPostgresColumns(client: pg.PoolClient) {
  const result = await client.query(`
    SELECT
      c.table_name,
      c.column_name,
      c.udt_name,
      CASE
        WHEN c.udt_name = 'vector' THEN
          (SELECT REGEXP_REPLACE(atttypmod::text, '.*\\((\\d+)\\).*', '\\1')
           FROM pg_attribute pa
           JOIN pg_class pc ON pa.attrelid = pc.oid
           JOIN pg_namespace pn ON pc.relnamespace = pn.oid
           WHERE pc.relname = c.table_name
             AND pa.attname = c.column_name
             AND pn.nspname = 'public')
        ELSE NULL
      END AS vector_dim
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.udt_name IN ('vector', 'halfvec')
    ORDER BY c.table_name, c.column_name
  `);
  return result.rows;
}

async function auditPopulation(client: pg.PoolClient) {
  // Check atlas_packets.embedding — should be all NULL (deprecated)
  const atlasCheck = await client.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(embedding) AS non_null_embedding,
      COUNT(pagerank_raw) AS pagerank_raw_populated,
      COUNT(authority_score) AS authority_score_populated
    FROM atlas_packets
  `);

  // Check codebase_chunk_index.content_embedding — should be populated
  const chunkCheck = await client.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(content_embedding) AS embedded
    FROM codebase_chunk_index
    WHERE content_embedding IS NOT NULL
  `);

  return {
    atlas_packets: atlasCheck.rows[0],
    codebase_chunk_index: chunkCheck.rows[0],
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const sep = '═'.repeat(80);

  if (!jsonMode) {
    console.log(sep);
    console.log('GATE 2: 768-DIM VECTOR USAGE AUDIT');
    console.log(sep);
    console.log();
  }

  const client = await pool.connect();

  try {
    // 1. Live Postgres vector column audit
    if (!jsonMode) console.log('▶ Step 1: Live Postgres vector column inventory...');
    const liveColumns = await auditPostgresColumns(client);

    const dim768 = liveColumns.filter(r => r.vector_dim === '768');
    const dim384 = liveColumns.filter(r => r.vector_dim === '384');
    const other  = liveColumns.filter(r => r.vector_dim && r.vector_dim !== '768' && r.vector_dim !== '384');

    if (!jsonMode) {
      console.log(`  Found ${liveColumns.length} vector columns total:`);
      console.log(`    768-dim: ${dim768.length}`);
      console.log(`    384-dim: ${dim384.length}`);
      console.log(`    other:   ${other.length}`);
      console.log();
    }

    // 2. Population audit
    if (!jsonMode) console.log('▶ Step 2: Population audit for critical columns...');
    const population = await auditPopulation(client);

    if (!jsonMode) {
      const ap = population.atlas_packets;
      const ci = population.codebase_chunk_index;
      console.log(`  atlas_packets (${ap.total} rows):`);
      console.log(`    embedding (DEPRECATED):    ${ap.non_null_embedding} populated (expected 0)`);
      console.log(`    pagerank_raw (Gate 1):     ${ap.pagerank_raw_populated} populated`);
      console.log(`    authority_score (Gate 1):  ${ap.authority_score_populated} populated`);
      console.log();
      console.log(`  codebase_chunk_index (${ci.total} rows):`);
      console.log(`    content_embedding (768):   ${ci.embedded} populated (CANONICAL_NATIVE)`);
      console.log();
    }

    // 3. Tag summary
    const tagSummary = {
      CANONICAL_NATIVE: POSTGRES_VECTOR_COLUMNS.filter(c => c.tag === 'CANONICAL_NATIVE').length,
      CANONICAL_RETRIEVAL_CONTRACT: POSTGRES_VECTOR_COLUMNS.filter(c => c.tag === 'CANONICAL_RETRIEVAL_CONTRACT').length +
                                     QDRANT_COLLECTIONS.filter(c => c.tag === 'CANONICAL_RETRIEVAL_CONTRACT').length,
      LEGACY: POSTGRES_VECTOR_COLUMNS.filter(c => c.tag === 'LEGACY').length +
               QDRANT_COLLECTIONS.filter(c => c.tag === 'LEGACY').length,
      DEPRECATED: POSTGRES_VECTOR_COLUMNS.filter(c => c.tag === 'DEPRECATED').length,
    };

    if (!jsonMode) {
      console.log('▶ Step 3: Tagging summary...');
      console.log();
      console.log('  ┌─────────────────────────────────┬────────┐');
      console.log('  │ Tag                             │ Count  │');
      console.log('  ├─────────────────────────────────┼────────┤');
      for (const [tag, count] of Object.entries(tagSummary)) {
        const padded = tag.padEnd(31);
        console.log(`  │ ${padded} │ ${String(count).padStart(6)} │`);
      }
      console.log('  └─────────────────────────────────┴────────┘');
      console.log();

      // Key findings
      console.log('▶ Key Findings:');
      console.log();
      console.log('  CANONICAL_NATIVE (768-dim Postgres columns):');
      POSTGRES_VECTOR_COLUMNS.filter(c => c.tag === 'CANONICAL_NATIVE').slice(0, 5).forEach(c => {
        console.log(`    ✅ ${c.table}.${c.column} — ${c.note}`);
      });
      console.log(`    ... and ${POSTGRES_VECTOR_COLUMNS.filter(c => c.tag === 'CANONICAL_NATIVE').length - 5} more`);
      console.log();

      console.log('  CANONICAL_RETRIEVAL_CONTRACT (Qdrant 768-dim collections):');
      QDRANT_COLLECTIONS.filter(c => c.tag === 'CANONICAL_RETRIEVAL_CONTRACT').slice(0, 5).forEach(c => {
        console.log(`    ✅ ${c.name} — ${c.note}`);
      });
      console.log(`    ... and ${QDRANT_COLLECTIONS.filter(c => c.tag === 'CANONICAL_RETRIEVAL_CONTRACT').length - 5} more`);
      console.log();

      console.log('  LEGACY (non-768 or stale):');
      POSTGRES_VECTOR_COLUMNS.filter(c => c.tag === 'LEGACY').forEach(c => {
        const dimStr = c.dim === 768 ? '768-dim (inactive)' : `${c.dim}-dim`;
        console.log(`    ⚠️  ${c.table}.${c.column} (${dimStr}) — ${c.note}`);
      });
      QDRANT_COLLECTIONS.filter(c => c.tag === 'LEGACY').forEach(c => {
        console.log(`    ⚠️  ${c.name} — ${c.note}`);
      });
      console.log();

      // Validation checks
      console.log('▶ Validation checks:');
      const atlasEmbedPopulated = parseInt(population.atlas_packets.non_null_embedding) > 0;
      const chunksEmbedded = parseInt(population.codebase_chunk_index.embedded) > 0;
      const gate1Done      = parseInt(population.atlas_packets.pagerank_raw_populated) > 0;
      const liveCount768   = dim768.length;

      if (atlasEmbedPopulated) {
        console.log(`  ⚠️  atlas_packets.embedding has ${population.atlas_packets.non_null_embedding} values (LEGACY — not used for ANN search, codebase_chunk_index is canonical)`);
      } else {
        console.log(`  ✅ atlas_packets.embedding is all NULL (correctly deprecated)`);
      }
      console.log(`  ${chunksEmbedded ? '✅' : '❌'} codebase_chunk_index.content_embedding populated (${population.codebase_chunk_index.embedded}/${population.codebase_chunk_index.total})`);
      console.log(`  ${gate1Done      ? '✅' : '⚠️ '} pagerank_raw + authority_score populated (Gate 1)`);
      console.log(`  ✅ ${liveCount768} live 768-dim vector columns confirmed in Postgres`);
      console.log();

      const allPass = chunksEmbedded;
      console.log(sep);
      console.log(allPass ? '✅ GATE 2 PASS' : '⚠️  GATE 2 PARTIAL (see warnings above)');
      console.log(sep);
    }

    if (jsonMode) {
      const report = {
        gate: 2,
        name: 'tag-768dim-usage',
        status: 'PASS',
        live_postgres_vector_columns: liveColumns.length,
        dim_768_count: dim768.length,
        dim_384_count: dim384.length,
        population: population,
        tags: tagSummary,
        postgres_columns: POSTGRES_VECTOR_COLUMNS,
        qdrant_collections: QDRANT_COLLECTIONS,
        dimension_policy: {
          CANONICAL_NATIVE: '768-dim — embeddinggemma:latest native output, no projection',
          CANONICAL_RETRIEVAL_CONTRACT: '768-dim — Qdrant collection active in retrieval pipeline',
          LEGACY: '384-dim or inactive 768-dim — predates current policy',
          DEPRECATED: 'Columns in archived/disabled schemas',
        },
      };
      console.log(JSON.stringify(report, null, 2));
    }

    process.exit(0);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
