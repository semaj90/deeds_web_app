#!/usr/bin/env node
/**
 * Phase 9: Tool Registry Indexing
 *
 * Creates and indexes a tool registry for HMM-gated tool selection.
 * Each tool is indexed like a packet:
 * - JSON schema (input/output)
 * - Examples (domain usage patterns)
 * - Domains (auth, retrieval, graph, etc.)
 * - Embedding (384-dim, indexed in pgvector + Qdrant)
 * - Success telemetry (for HMM state validation)
 *
 * Enables: query intent → tool search → HMM gate → tool execution
 */

import pg from 'pg';
import fetch from 'node-fetch';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBED_MODEL = 'embeddinggemma:latest';

// Canonical tool registry
const TOOLS = [
  {
    tool_id: 'trace.kag_search',
    name: 'KAG Search',
    summary: 'Searches code graph and packet evidence using knowledge-augmented generation',
    input_schema: {
      query: { type: 'string', description: 'Natural language query' },
      top_k: { type: 'integer', default: 5 },
      filters: { type: 'object', properties: { domain: { type: 'string' } } }
    },
    output_schema: {
      results: { type: 'array', items: { type: 'object' } },
      trace_id: { type: 'string' }
    },
    examples: [
      'Find route handler for authentication',
      'Expand CALLS edges around session validation',
      'What functions call validateSession?',
      'Show database queries in auth flow'
    ],
    domains: ['retrieval', 'graph', 'auth']
  },
  {
    tool_id: 'atlas.topology_expand',
    name: 'Topology Expansion',
    summary: 'Expands semantic neighborhood in SOM grid for topology-aware retrieval',
    input_schema: {
      som_row: { type: 'integer' },
      som_col: { type: 'integer' },
      hops: { type: 'integer', default: 1 },
      max_results: { type: 'integer', default: 20 }
    },
    output_schema: {
      neighbors: { type: 'array', items: { type: 'object' } },
      hnsw_distance: { type: 'array', items: { type: 'number' } }
    },
    examples: [
      'Find similar files to src/lib/server/auth.ts',
      'Expand SOM cell (10, 10) by 1 hop',
      'What code patterns are near authentication?'
    ],
    domains: ['topology', 'retrieval']
  },
  {
    tool_id: 'neo4j.dependency_closure',
    name: 'Dependency Closure',
    summary: 'Computes transitive closure of dependencies via Neo4j traversal',
    input_schema: {
      start_node: { type: 'string', description: 'File or function ID' },
      relationship_types: { type: 'array', items: { type: 'string' } },
      max_depth: { type: 'integer', default: 3 }
    },
    output_schema: {
      closure: { type: 'array', items: { type: 'string' } },
      paths: { type: 'array', items: { type: 'array' } }
    },
    examples: [
      'What does the auth module depend on?',
      'Find all CALLS transitive to validateSession',
      'Show dependency chain from route handler to database'
    ],
    domains: ['graph', 'analysis']
  },
  {
    tool_id: 'qdrant.dense_search',
    name: 'Dense Vector Search',
    summary: 'Cosine similarity search in Qdrant HNSW for semantic matching',
    input_schema: {
      query_embedding: { type: 'array', items: { type: 'number' }, minItems: 384, maxItems: 384 },
      top_k: { type: 'integer', default: 10 },
      filter: { type: 'object' }
    },
    output_schema: {
      points: { type: 'array', items: { type: 'object' } },
      scores: { type: 'array', items: { type: 'number' } }
    },
    examples: [
      'Find chunks semantically similar to a query',
      'HNSW neighbor search for topology-aware reranking',
      'Cosine similarity top-10 for evidence packets'
    ],
    domains: ['retrieval', 'vector']
  },
  {
    tool_id: 'rg.lexical_search',
    name: 'Lexical Search (ripgrep)',
    summary: 'Fast regex/substring search for exact code matches',
    input_schema: {
      pattern: { type: 'string', description: 'Regex pattern or substring' },
      file_type: { type: 'string', default: 'ts' },
      max_results: { type: 'integer', default: 50 }
    },
    output_schema: {
      files: { type: 'array', items: { type: 'string' } },
      line_numbers: { type: 'array', items: { type: 'array' } }
    },
    examples: [
      'Find all calls to validateSession',
      'Search for database table names in code',
      'Find route definitions matching /api/auth/*'
    ],
    domains: ['lexical', 'search']
  },
  {
    tool_id: 'gemma4.explain_code',
    name: 'Code Explanation',
    summary: 'Generate natural language explanation of code via Gemma4',
    input_schema: {
      code: { type: 'string', description: 'Source code to explain' },
      focus: { type: 'string', enum: ['purpose', 'inputs', 'outputs', 'flow'] }
    },
    output_schema: {
      explanation: { type: 'string' },
      key_concepts: { type: 'array', items: { type: 'string' } }
    },
    examples: [
      'Explain the authentication flow',
      'What does this database query do?',
      'Summarize this error handling logic'
    ],
    domains: ['synthesis', 'explanation']
  }
];

async function embedText(text) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        prompt: text
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (err) {
    console.error(`  ❌ Embedding failed for "${text.slice(0, 50)}...": ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('\n🔧 Phase 9: Tool Registry Indexing\n');

  const pool = new pg.Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5434'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'legal_ai_db'
  });

  try {
    await pool.connect();
    console.log('✅ Postgres connected\n');

    // Create tool_registry table if not exists
    console.log('[SCHEMA] Creating tool_registry table...\n');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tool_registry (
        tool_id text PRIMARY KEY,
        name text NOT NULL,
        summary text NOT NULL,
        input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
        output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
        examples text[] NOT NULL DEFAULT '{}',
        domains text[] NOT NULL DEFAULT '{}',
        embedding vector(384),
        success_count int DEFAULT 0,
        failure_count int DEFAULT 0,
        avg_latency_ms real DEFAULT 0,
        allowed_hmm_states text[] DEFAULT ARRAY['CANONICAL','RECOVERABLE'],
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS tool_registry_domain_idx
      ON tool_registry USING gin(domains);

      CREATE INDEX IF NOT EXISTS tool_registry_schema_gin
      ON tool_registry USING gin(input_schema jsonb_path_ops);

      CREATE INDEX IF NOT EXISTS tool_registry_embedding_hnsw
      ON tool_registry USING hnsw (embedding vector_cosine_ops)
      WITH (m=16, ef_construction=64);
    `);

    console.log('  ✓ Table and indexes created\n');

    if (DRY_RUN) {
      console.log('[DRY-RUN] Tool registry would be populated with:');
      for (const tool of TOOLS) {
        console.log(`  - ${tool.tool_id}: ${tool.name}`);
      }
      console.log(`\n  Total: ${TOOLS.length} tools\n`);
      process.exit(0);
    }

    // Embed tool summaries and examples
    console.log('[EMBED] Embedding tool summaries and examples...\n');
    let embedded = 0;

    for (const tool of TOOLS) {
      // Combine summary + examples for embedding
      const textToEmbed = `${tool.summary}. Examples: ${tool.examples.join('; ')}`;

      if (VERBOSE) console.log(`  Embedding ${tool.tool_id}...`);
      const embedding = await embedText(textToEmbed);

      if (!embedding) {
        console.log(`  ⚠️  Skipping ${tool.tool_id} (embedding failed)`);
        continue;
      }

      // Truncate embedding to 384-dim (canonical project dimension)
      const embedding384 = embedding.slice(0, 384);
      if (embedding384.length !== 384) {
        console.log(`  ⚠️  Skipping ${tool.tool_id} (embedding dimension mismatch: got ${embedding.length}, expected >= 384)`);
        continue;
      }

      // Insert or update tool
      await pool.query(
        `INSERT INTO tool_registry
          (tool_id, name, summary, input_schema, output_schema, examples, domains, embedding, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (tool_id) DO UPDATE SET
          name = $2, summary = $3, input_schema = $4, output_schema = $5,
          examples = $6, domains = $7, embedding = $8, updated_at = now()`,
        [
          tool.tool_id,
          tool.name,
          tool.summary,
          JSON.stringify(tool.input_schema),
          JSON.stringify(tool.output_schema),
          tool.examples,
          tool.domains,
          JSON.stringify(embedding384)
        ]
      );

      embedded++;
      console.log(`  ✓ ${tool.tool_id}`);
    }

    console.log(`\n✅ Embedded ${embedded} tools\n`);

    // Verify
    console.log('[VERIFY] Checking tool registry...\n');
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as embedded,
        array_agg(DISTINCT domains[1]) as unique_domains
      FROM tool_registry
    `);

    const { total, embedded: embeddedCount, unique_domains } = result.rows[0];
    console.log(`  Total tools: ${total}`);
    console.log(`  Embedded: ${embeddedCount}`);
    console.log(`  Domains: ${unique_domains.filter(d => d).join(', ')}\n`);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ Phase 9 Tool Registry Complete');
    console.log(`  - ${embedded} tools indexed`);
    console.log(`  - HMM-gated tool search ready`);
    console.log(`  - Next: Fix Phase 6a path normalization`);
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('[ERROR]', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
