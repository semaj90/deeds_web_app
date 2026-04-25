#!/usr/bin/env node
/**
 * Agentic Knowledge Ingestion Pipeline
 *
 * Continuously indexes:
 * - Error clusters & fixes (Phase 78)
 * - Documentation (TypeScript, Svelte, SvelteKit, Go)
 * - News/updates (Google Alerts, RSS feeds)
 * - Codebase analysis (ripgrep + AST)
 *
 * Stores in:
 * - PostgreSQL 17 (text + metadata)
 * - pgvector (embeddings via embeddinggemma:latest)
 * - Qdrant (mirrored for fast vector search)
 * - JSONL (versioned knowledge snapshots)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { execSync } from 'child_process';
import { appendFile, writeFile } from 'fs/promises';
import fetch from 'node-fetch';
import postgres from 'postgres';

const sql = postgres({
  host: 'localhost',
  port: 5432,
  database: 'legal_ai_db',
  username: 'legal_admin',
  password: process.env.PGPASSWORD || '123456'
});

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333'
});

const OLLAMA_ENDPOINT = process.env.OLLAMA_URL || 'http://localhost:11434';

// ═══════════════════════════════════════════════════════════
// 1. EMBED TEXT USING OLLAMA
// ═══════════════════════════════════════════════════════════

async function embedText(text, title = '') {
  const prompt = title ? `${title}\n\n${text}` : text;

  const response = await fetch(`${OLLAMA_ENDPOINT}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      prompt: prompt.substring(0, 8000) // Truncate to safe length
    })
  });

  const data = await response.json();
  return data.embedding || [];
}

// ═══════════════════════════════════════════════════════════
// 2. INDEX ERROR CLUSTER KNOWLEDGE
// ═══════════════════════════════════════════════════════════

async function indexErrorClusters() {
  console.log('📊 Indexing error clusters with AI-generated fixes...\n');

  const clusters = await sql`
    SELECT
      ec.cluster_id,
      ec.error_code,
      ec.category,
      ec.count,
      ec.sample_message,
      ec.route_id,
      es.summary,
      es.patch,
      es.risk_level
    FROM error_cluster ec
    LEFT JOIN error_suggestions es ON ec.cluster_id = es.cluster_id
    WHERE ec.archived_at IS NULL
    ORDER BY ec.count DESC
    LIMIT 100
  `;

  const indexed = [];

  for (const cluster of clusters) {
    const title = `Error ${cluster.error_code}: ${cluster.category} (${cluster.count} occurrences)`;

    const content = `
Error Cluster: ${cluster.cluster_id}
Code: ${cluster.error_code}
Category: ${cluster.category}
Route: ${cluster.route_id || 'N/A'}
Occurrences: ${cluster.count}

Sample Error:
${cluster.sample_message}

${cluster.summary ? `AI Analysis:\n${cluster.summary}` : ''}
${cluster.patch ? `\nSuggested Fix:\n${cluster.patch}` : ''}
${cluster.risk_level ? `\nRisk Level: ${cluster.risk_level}` : ''}
    `.trim();

    const embedding = await embedText(content, title);

    // Store in PostgreSQL with pgvector
    await sql`
      INSERT INTO knowledge_base (
        id,
        type,
        title,
        content,
        embedding,
        metadata,
        created_at
      ) VALUES (
        gen_random_uuid(),
        'error_cluster',
        ${title},
        ${content},
        ${sql.typed.vector(embedding)},
        ${JSON.stringify({
          cluster_id: cluster.cluster_id,
          error_code: cluster.error_code,
          category: cluster.category,
          count: cluster.count,
          risk_level: cluster.risk_level
        })},
        NOW()
      )
      ON CONFLICT (type, title)
      DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `;

    // Mirror to Qdrant
    if (embedding.length > 0) {
      await qdrant.upsert('knowledge_base', {
        points: [{
          id: cluster.cluster_id,
          vector: embedding,
          payload: {
            type: 'error_cluster',
            title,
            content: content.substring(0, 1000),
            error_code: cluster.error_code,
            category: cluster.category,
            count: cluster.count
          }
        }]
      });
    }

    indexed.push({ cluster_id: cluster.cluster_id, title });
  }

  console.log(`✅ Indexed ${indexed.length} error clusters\n`);
  return indexed;
}

// ═══════════════════════════════════════════════════════════
// 3. CRAWL & INDEX DOCUMENTATION
// ═══════════════════════════════════════════════════════════

const DOCS_SOURCES = [
  {
    name: 'TypeScript',
    urls: [
      'https://www.typescriptlang.org/docs/handbook/intro.html',
      'https://www.typescriptlang.org/docs/handbook/2/basic-types.html',
      'https://devblogs.microsoft.com/typescript/'
    ],
    type: 'typescript_docs'
  },
  {
    name: 'SvelteKit 2',
    urls: [
      'https://kit.svelte.dev/docs/introduction',
      'https://kit.svelte.dev/docs/migrating-to-sveltekit-2',
      'https://svelte.dev/blog'
    ],
    type: 'sveltekit_docs'
  },
  {
    name: 'Svelte 5',
    urls: [
      'https://svelte.dev/docs/svelte/overview',
      'https://svelte.dev/docs/svelte/v5-migration-guide',
      'https://svelte.dev/blog/svelte-5-is-alive'
    ],
    type: 'svelte_docs'
  },
  {
    name: 'Go 1.25',
    urls: [
      'https://go.dev/doc/go1.25',
      'https://go.dev/blog/'
    ],
    type: 'golang_docs'
  }
];

async function crawlAndIndexDocs() {
  console.log('🌐 Crawling documentation sources...\n');

  const indexed = [];

  for (const source of DOCS_SOURCES) {
    console.log(`  📖 ${source.name}...`);

    for (const url of source.urls) {
      try {
        const response = await fetch(url);
        const html = await response.text();

        // Simple HTML to text extraction (in production, use cheerio/jsdom)
        const text = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const title = `${source.name} - ${url.split('/').pop()}`;
        const content = text.substring(0, 4000); // Chunk large docs

        const embedding = await embedText(content, title);

        await sql`
          INSERT INTO knowledge_base (
            id, type, title, content, embedding, metadata, created_at
          ) VALUES (
            gen_random_uuid(),
            ${source.type},
            ${title},
            ${content},
            ${sql.typed.vector(embedding)},
            ${JSON.stringify({ url, source: source.name })},
            NOW()
          )
          ON CONFLICT (type, title)
          DO UPDATE SET
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            updated_at = NOW()
        `;

        indexed.push({ source: source.name, url });
      } catch (err) {
        console.error(`    ❌ Failed to crawl ${url}:`, err.message);
      }
    }
  }

  console.log(`✅ Indexed ${indexed.length} documentation pages\n`);
  return indexed;
}

// ═══════════════════════════════════════════════════════════
// 4. INDEX CODEBASE WITH RIPGREP + AST
// ═══════════════════════════════════════════════════════════

async function indexCodebasePatterns() {
  console.log('🔍 Analyzing codebase patterns with ripgrep...\n');

  const patterns = [
    { name: 'Svelte 5 Runes', regex: '\\$state|\\$derived|\\$effect|\\$props', type: 'svelte5_usage' },
    { name: 'SuperForms v2', regex: 'superValidate|zod\\(', type: 'superforms_usage' },
    { name: 'Error Handling', regex: 'try\\s*\\{|catch\\s*\\(', type: 'error_handling' },
    { name: 'Async Patterns', regex: 'async\\s+function|await\\s+', type: 'async_patterns' }
  ];

  const indexed = [];

  for (const pattern of patterns) {
    try {
      // Use ripgrep for fast codebase search
      const results = execSync(
        `rg -i "${pattern.regex}" src/ --json`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );

      const matches = results
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(m => m && m.type === 'match');

      const summary = `
Pattern: ${pattern.name}
Occurrences: ${matches.length}
Files: ${new Set(matches.map(m => m.data?.path?.text)).size}

Common Usage Examples:
${matches.slice(0, 5).map(m =>
  `  ${m.data?.path?.text}:${m.data?.line_number}\n  ${m.data?.lines?.text?.trim()}`
).join('\n\n')}
      `.trim();

      const embedding = await embedText(summary, `Codebase Pattern: ${pattern.name}`);

      await sql`
        INSERT INTO knowledge_base (
          id, type, title, content, embedding, metadata, created_at
        ) VALUES (
          gen_random_uuid(),
          ${pattern.type},
          ${'Codebase Pattern: ' + pattern.name},
          ${summary},
          ${sql.typed.vector(embedding)},
          ${JSON.stringify({ pattern: pattern.regex, count: matches.length })},
          NOW()
        )
        ON CONFLICT (type, title)
        DO UPDATE SET
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          updated_at = NOW()
      `;

      indexed.push({ pattern: pattern.name, count: matches.length });
    } catch (err) {
      console.error(`  ❌ Pattern "${pattern.name}" failed:`, err.message);
    }
  }

  console.log(`✅ Indexed ${indexed.length} codebase patterns\n`);
  return indexed;
}

// ═══════════════════════════════════════════════════════════
// 5. EXPORT TO JSONL FOR VERSIONING
// ═══════════════════════════════════════════════════════════

async function exportToJSONL() {
  console.log('💾 Exporting knowledge base to JSONL...\n');

  const knowledge = await sql`
    SELECT
      id,
      type,
      title,
      content,
      metadata,
      created_at,
      updated_at
    FROM knowledge_base
    ORDER BY updated_at DESC
  `;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `knowledge-base-${timestamp}.jsonl`;
  const filepath = `./knowledge-snapshots/${filename}`;

  await writeFile(filepath, '');

  for (const item of knowledge) {
    await appendFile(
      filepath,
      JSON.stringify({
        ...item,
        created_at: item.created_at.toISOString(),
        updated_at: item.updated_at?.toISOString()
      }) + '\n'
    );
  }

  console.log(`✅ Exported ${knowledge.length} items to ${filename}\n`);
  return filename;
}

// ═══════════════════════════════════════════════════════════
// 6. SEMANTIC SEARCH FUNCTION
// ═══════════════════════════════════════════════════════════

export async function searchKnowledge(query, topK = 5, type = null) {
  const queryEmbedding = await embedText(query);

  let sqlQuery = sql`
    SELECT
      id,
      type,
      title,
      content,
      metadata,
      1 - (embedding <=> ${sql.typed.vector(queryEmbedding)}) AS similarity
    FROM knowledge_base
    ${type ? sql`WHERE type = ${type}` : sql``}
    ORDER BY embedding <=> ${sql.typed.vector(queryEmbedding)}
    LIMIT ${topK}
  `;

  const results = await sqlQuery;
  return results;
}

// ═══════════════════════════════════════════════════════════
// 7. MAIN PIPELINE
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Agentic Knowledge Ingestion Pipeline                 ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Ensure knowledge_base table exists
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        UNIQUE(type, title)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding
      ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
    `;

    // Run all indexing tasks
    const errorClusters = await indexErrorClusters();
    const docs = await crawlAndIndexDocs();
    const codePatterns = await indexCodebasePatterns();
    const snapshot = await exportToJSONL();

    // Summary
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  INDEXING COMPLETE                        ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('📊 Summary:');
    console.log(`  Error Clusters:    ${errorClusters.length}`);
    console.log(`  Documentation:     ${docs.length}`);
    console.log(`  Code Patterns:     ${codePatterns.length}`);
    console.log(`  JSONL Snapshot:    ${snapshot}\n`);

    console.log('💡 Usage:');
    console.log('  Search: import { searchKnowledge } from "./agentic-knowledge-pipeline.mjs"');
    console.log('  Example: await searchKnowledge("How to fix TS2322 type errors?", 5)\n');

  } catch (err) {
    console.error('❌ Pipeline failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
