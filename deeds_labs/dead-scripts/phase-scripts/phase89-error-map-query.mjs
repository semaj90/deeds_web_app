#!/usr/bin/env node
/**
 * Phase 89: Error Map Query Interface
 * Query the knowledge graph for error patterns, similar errors, and fix suggestions
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import ollama from 'ollama';
import pg from 'pg';

const { Pool } = pg;

const CONFIG = {
  postgres: {
    host: '127.0.0.1',
    port: 5434,
    database: 'legal_ai_db',
    user: 'legal_admin',
    password: '123456'
  },
  qdrant: {
    url: 'http://127.0.0.1:6333',
    collection: 'phase89_error_map'
  },
  ollama: {
    embedModel: 'embeddinggemma:latest'
  }
};

let db, qdrant;

async function initClients() {
  db = new Pool(CONFIG.postgres);
  qdrant = new QdrantClient({ url: CONFIG.qdrant.url });
}

async function closeClients() {
  await db?.end();
}

async function queryErrorMap(query) {
  console.log(`\n🔍 Query: "${query}"\n`);

  // 1. Vector search for similar errors
  console.log('📊 Step 1: Finding similar errors (vector search)...');
  const response = await ollama.embeddings({
    model: CONFIG.ollama.embedModel,
    prompt: query
  });

  const searchResults = await qdrant.search(CONFIG.qdrant.collection, {
    vector: response.embedding,
    limit: 5,
    with_payload: true
  });

  if (searchResults.length === 0) {
    console.log('  ⚠️  No similar errors found in vector DB');
    return;
  }

  console.log(`  ✅ Found ${searchResults.length} similar errors:`);
  for (const hit of searchResults) {
    console.log(`     ${hit.score.toFixed(3)} | ${hit.payload.code} | ${hit.payload.file}:${hit.payload.line}`);
    console.log(`           ${hit.payload.message.substring(0, 80)}...`);
  }

  // 2. Graph expansion: find related files and symbols
  console.log('\n🕸️  Step 2: Expanding graph (find related context)...');
  const errorIds = searchResults.map(r => r.payload.id);

  const expansion = await db.query(`
    WITH error_files AS (
      SELECT DISTINCT e.to_id AS file_id
      FROM kg_edges e
      WHERE e.from_id = ANY($1)
        AND e.edge_type = 'ERROR_IN_FILE'
    ),
    file_symbols AS (
      SELECT DISTINCT e.to_id AS symbol_id, n.label
      FROM kg_edges e
      JOIN kg_nodes n ON n.id = e.to_id
      WHERE e.from_id IN (SELECT file_id FROM error_files)
        AND e.edge_type = 'DEFINES_SYMBOL'
      LIMIT 10
    ),
    file_imports AS (
      SELECT DISTINCT e.to_id AS imported_file_id, n.label
      FROM kg_edges e
      JOIN kg_nodes n ON n.id = e.to_id
      WHERE e.from_id IN (SELECT file_id FROM error_files)
        AND e.edge_type = 'IMPORTS_FILE'
      LIMIT 10
    )
    SELECT
      'symbol' AS type,
      label AS name
    FROM file_symbols
    UNION ALL
    SELECT
      'import' AS type,
      label AS name
    FROM file_imports
  `, [errorIds]);

  console.log(`  ✅ Found ${expansion.rows.length} related entities:`);
  const symbols = expansion.rows.filter(r => r.type === 'symbol');
  const imports = expansion.rows.filter(r => r.type === 'import');

  if (symbols.length > 0) {
    console.log(`     Symbols (${symbols.length}):`);
    symbols.slice(0, 5).forEach(s => console.log(`       - ${s.name}`));
  }

  if (imports.length > 0) {
    console.log(`     Imports (${imports.length}):`);
    imports.slice(0, 5).forEach(i => console.log(`       - ${i.name}`));
  }

  // 3. Find error patterns (group by code)
  console.log('\n📈 Step 3: Analyzing error patterns...');
  const patterns = await db.query(`
    SELECT
      (meta->>'code') AS error_code,
      COUNT(*) AS occurrence_count,
      ARRAY_AGG(DISTINCT (meta->>'file')) AS affected_files
    FROM kg_nodes
    WHERE kind = 'error'
      AND id = ANY($1)
    GROUP BY (meta->>'code')
    ORDER BY occurrence_count DESC
  `, [errorIds]);

  console.log(`  ✅ Error patterns:`);
  for (const pattern of patterns.rows) {
    console.log(`     ${pattern.error_code}: ${pattern.occurrence_count} occurrences`);
    console.log(`       Files: ${pattern.affected_files.slice(0, 3).join(', ')}${pattern.affected_files.length > 3 ? '...' : ''}`);
  }

  // 4. Query knowledge base for fix docs
  console.log('\n📚 Step 4: Retrieving fix documentation...');
  const docSearch = await qdrant.search('phase76_knowledge_base', {
    vector: response.embedding,
    limit: 3,
    with_payload: true,
    filter: {
      should: [
        { key: 'tags', match: { value: 'svelte5' } },
        { key: 'tags', match: { value: 'typescript' } }
      ]
    }
  });

  if (docSearch.length > 0) {
    console.log(`  ✅ Found ${docSearch.length} relevant docs:`);
    for (const doc of docSearch) {
      console.log(`     ${doc.score.toFixed(3)} | ${doc.payload.title || doc.payload.url}`);
      if (doc.payload.summary) {
        console.log(`           ${doc.payload.summary.substring(0, 100)}...`);
      }
    }
  } else {
    console.log('  ⚠️  No relevant docs found');
  }

  // 5. Generate fix suggestion
  console.log('\n💡 Step 5: Generating fix suggestion...');
  const topError = searchResults[0].payload;
  const context = `
Error: ${topError.code} - ${topError.message}
File: ${topError.file}:${topError.line}
Related symbols: ${symbols.slice(0, 3).map(s => s.name).join(', ')}
Documentation: ${docSearch.map(d => d.payload.title || d.payload.url).join(', ')}
  `.trim();

  console.log('  🤖 Asking gemma3-legal for fix...');
  const chatResponse = await ollama.chat({
    model: 'gemma3-legal:latest',
    messages: [{
      role: 'user',
      content: `Fix this TypeScript error using Svelte 5 runes:\n\n${context}\n\nProvide a concise fix (1-2 lines).`
    }],
    options: {
      temperature: 0.3,
      num_predict: 150
    }
  });

  console.log(`\n  ✅ Suggested Fix:`);
  console.log(`     ${chatResponse.message.content.trim()}\n`);
}

async function main() {
  const query = process.argv[2] || 'TS1005 expected semicolon';

  try {
    await initClients();
    await queryErrorMap(query);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await closeClients();
  }
}

main();
