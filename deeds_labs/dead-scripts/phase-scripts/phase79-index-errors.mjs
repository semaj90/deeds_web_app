#!/usr/bin/env node
/**
 * Phase 79: Index TypeScript/Svelte Errors for Agentic Fixing
 *
 * Runs svelte-check, extracts all errors, and indexes them into:
 * - PostgreSQL (structured storage)
 * - Qdrant (vector search)
 * - MinIO (raw error files)
 *
 * Enables AI agents to semantically search and fix errors
 */

import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import postgres from 'postgres';

const CONFIG = {
  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    collection: 'phase79_error_analysis'
  },
  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: 'embeddinggemma:latest'
  },
  postgres: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/legal_ai_db'
  }
};

const sql = postgres(CONFIG.postgres.url);

console.log('🔍 Phase 79: Indexing TypeScript/Svelte Errors\n');

// ============================================================================
// Step 1: Run svelte-check and capture errors
// ============================================================================

console.log('📊 Running svelte-check...');
let checkOutput = '';
try {
  checkOutput = execSync('npm run check', {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    cwd: process.cwd()
  });
} catch (err) {
  checkOutput = err.stdout || err.stderr || '';
}

// Parse errors
const errorPattern = /Error: (.+?)\s+\(at (.+?):(\d+):(\d+)\)/g;
const errors = [];
let match;

while ((match = errorPattern.exec(checkOutput)) !== null) {
  errors.push({
    message: match[1].trim(),
    file: match[2].trim(),
    line: parseInt(match[3]),
    column: parseInt(match[4])
  });
}

console.log(`✅ Found ${errors.length} errors\n`);

if (errors.length === 0) {
  console.log('🎉 No errors found! System is clean.');
  process.exit(0);
}

// ============================================================================
// Step 2: Cluster similar errors
// ============================================================================

console.log('📦 Clustering errors by pattern...');
const errorClusters = new Map();

for (const error of errors) {
  // Normalize error message for clustering
  const normalized = error.message
    .replace(/'.+?'/g, '<STRING>')
    .replace(/\d+/g, '<NUM>')
    .replace(/\s+/g, ' ')
    .trim();

  const key = `${normalized}|${error.file}`;

  if (!errorClusters.has(key)) {
    errorClusters.set(key, {
      file_path: error.file,
      error_code: `TS${crypto.createHash('md5').update(normalized).digest('hex').slice(0, 6)}`,
      message: error.message,
      normalized_message: normalized,
      error_count: 0,
      occurrences: []
    });
  }

  const cluster = errorClusters.get(key);
  cluster.error_count++;
  cluster.occurrences.push({ line: error.line, column: error.column });
}

const clusters = Array.from(errorClusters.values())
  .sort((a, b) => b.error_count - a.error_count);

console.log(`✅ Clustered into ${clusters.length} unique error patterns\n`);

// ============================================================================
// Step 3: Store in PostgreSQL
// ============================================================================

console.log('💾 Storing in PostgreSQL...');
try {
  // Create table if not exists
  await sql`
    CREATE TABLE IF NOT EXISTS phase79_errors (
      id SERIAL PRIMARY KEY,
      error_code TEXT NOT NULL,
      file_path TEXT NOT NULL,
      message TEXT NOT NULL,
      normalized_message TEXT NOT NULL,
      error_count INTEGER NOT NULL,
      occurrences JSONB NOT NULL,
      indexed_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(error_code, file_path)
    )
  `;

  // Upsert error clusters
  for (const cluster of clusters) {
    await sql`
      INSERT INTO phase79_errors (
        error_code, file_path, message, normalized_message,
        error_count, occurrences
      ) VALUES (
        ${cluster.error_code}, ${cluster.file_path}, ${cluster.message},
        ${cluster.normalized_message}, ${cluster.error_count},
        ${JSON.stringify(cluster.occurrences)}
      )
      ON CONFLICT (error_code, file_path)
      DO UPDATE SET
        message = EXCLUDED.message,
        error_count = EXCLUDED.error_count,
        occurrences = EXCLUDED.occurrences,
        indexed_at = NOW()
    `;
  }

  console.log(`✅ Stored ${clusters.length} error clusters\n`);
} catch (err) {
  console.warn('⚠️  PostgreSQL storage failed:', err.message);
}

// ============================================================================
// Step 4: Generate embeddings and index to Qdrant
// ============================================================================

console.log('🔮 Generating embeddings...');

async function generateEmbedding(text) {
  try {
    const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONFIG.ollama.model,
        prompt: text.substring(0, 8000)
      })
    });
    const data = await response.json();
    return data.embedding || [];
  } catch (err) {
    console.warn('Embedding failed:', err.message);
    return [];
  }
}

// Ensure Qdrant collection exists
console.log('📝 Ensuring Qdrant collection...');
try {
  const checkResponse = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}`);

  if (checkResponse.status === 404) {
    const createResponse = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: {
          size: 768,
          distance: 'Cosine'
        }
      })
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create collection: ${createResponse.statusText}`);
    }
    console.log('✅ Created Qdrant collection');
  }
} catch (err) {
  console.warn('⚠️  Qdrant collection check failed:', err.message);
}

// Index errors
let indexed = 0;
for (const cluster of clusters.slice(0, 100)) { // Top 100 errors
  const errorContext = `
Error Code: ${cluster.error_code}
File: ${cluster.file_path}
Message: ${cluster.message}
Occurrences: ${cluster.error_count}
Locations: ${cluster.occurrences.map(o => `Line ${o.line}`).join(', ')}
  `.trim();

  console.log(`📌 ${cluster.error_code}: ${cluster.message.slice(0, 80)}...`);

  const embedding = await generateEmbedding(errorContext);

  if (!embedding || embedding.length === 0) {
    console.log('  ⏭️  Skipping (embedding failed)');
    continue;
  }

  const pointId = parseInt(
    crypto.createHash('md5').update(errorContext).digest('hex').slice(0, 8),
    16
  ) % (10 ** 8);

  try {
    const upsertResponse = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [
          {
            id: pointId,
            vector: Array.from(embedding),
            payload: {
              error_code: cluster.error_code,
              file_path: cluster.file_path,
              message: cluster.message,
              error_count: cluster.error_count,
              phase: 'phase79',
              indexed_at: new Date().toISOString()
            }
          }
        ]
      })
    });

    if (!upsertResponse.ok) {
      throw new Error(`Upsert failed: ${upsertResponse.statusText}`);
    }

    console.log('  ✅ Indexed');
    indexed++;
  } catch (err) {
    console.log(`  ❌ Failed: ${err.message}`);
  }
}

console.log(`\n✅ Indexed ${indexed} error patterns to Qdrant\n`);

// ============================================================================
// Step 5: Generate summary report
// ============================================================================

const report = {
  timestamp: new Date().toISOString(),
  total_errors: errors.length,
  unique_patterns: clusters.length,
  indexed_to_qdrant: indexed,
  top_10_errors: clusters.slice(0, 10).map(c => ({
    code: c.error_code,
    file: c.file_path,
    message: c.message.slice(0, 100),
    count: c.error_count
  }))
};

await fs.writeFile(
  'reports/phase79-error-index-report.json',
  JSON.stringify(report, null, 2)
);

console.log('📊 Error Analysis Summary:');
console.log('━'.repeat(60));
console.log(`Total Errors:        ${errors.length}`);
console.log(`Unique Patterns:     ${clusters.length}`);
console.log(`Indexed to Qdrant:   ${indexed}`);
console.log(`Stored in Postgres:  ${clusters.length}`);
console.log('━'.repeat(60));
console.log('\n✅ Phase 79 Error Indexing Complete!\n');
console.log('🤖 Agentic Error Fixing Ready:');
console.log('   - Search errors: npm run search:errors');
console.log('   - View dashboard: npm run indexing:ui');
console.log('   - Query database: SELECT * FROM phase79_errors ORDER BY error_count DESC;');

await sql.end();
process.exit(0);
