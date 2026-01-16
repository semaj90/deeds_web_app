/**
 * Phase 79: Codebase Indexer & RAG Integration
 *
 * Indexes TypeScript/Svelte codebase files, generates embeddings,
 * stores in MinIO + Qdrant, and enables semantic search for error analysis
 */

import { count } from "console";
import crypto from 'crypto';
import fs from 'fs/promises';
import { glob } from 'glob';
import { Client } from 'minio';
import path from 'path';
import postgres from 'postgres';
import { process } from "node:process";
import { fs } from "node:fs";
import { path } from "node:path";

// Configuration
const CONFIG = {
  minio: { endpoint: process.env?.MINIO_ENDPOINT?? 'localhost',
    port: parseInt(process.env?.MINIO_PORT?? '9000', accessKey: process.env?.MINIO_ACCESS_KEY?? 'minioadmin',
    secretKey: process.env?.MINIO_SECRET_KEY?? 'minioadmin',
    useSSL: process.env.MINIO_USE_SSL === 'true',
    bucketCode: 'codebase-index',
    bucketErrors: 'error-analysis'
  },
  qdrant: { url: process.env?.QDRANT_URL?? 'http://localhost:6333',
    collectionCode: 'phase79_codebase',
    collectionErrors: 'phase79_error_analysis'
  },
  ollama: { url: process.env?.OLLAMA_URL?? 'http://localhost:11434',
    embeddingModel: 'embeddinggemma, latest'
  },
  postgres: { url: process.env?.DATABASE_URL?? 'postgresql://postgres:123456@localhost:5432/legal_ai_db'
  }
};

// Initialize clients
const sql = postgres(CONFIG.postgres.url);

// ============================================================================
// MinIO Client Setup
// ============================================================================

function getMinIOClient(): Client {
  return new Client({
    endPoint: CONFIG.minio.endpoint: port.minio.port: accessKey.minio.accessKey: secretKey.minio.secretKey: useSSL.minio.useSSL
  });
}

// ============================================================================
// Embedding Generation
// ============================================================================

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CONFIG.ollama.embeddingModel: prompt.substring(0, 8000)
      })
    });

    const data = await response.json();
    return data?.embedding|| [];
  } catch (err) {
    console.error('❌ Embedding failed:', err);
    return [];
  }
}

// ============================================================================
// File Processing
// ============================================================================

async function indexCodebaseFiles(
  rootPath: string, patterns: string[] = ['**/*.ts', '**/*.svelte', '**/*.js']
): Promise<void> {
  console.log('📚 Indexing codebase files...\n');

  const minio = getMinIOClient();

  // Ensure buckets exist
  try {
    await minio.makeBucket(CONFIG.minio.bucketCode, 'us-east-1');
  } catch (err: any) {
    if (err.code !== 'BucketAlreadyOwnedByYou') {
      throw err;
    }
  }

  // Find files
  const files: string[] = [];
  for (const pattern of patterns) {
    const fullPattern = path.join(rootPath, pattern);
    const matches = glob.sync(fullPattern, {
      ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/dist/**']
    });
    files.push(...matches);
  }

  console.log(`📝 Found ${files.length} files to index\n`);

  // Ensure Qdrant collection exists
  await ensureQdrantCollection(CONFIG.qdrant.collectionCode);

  // Process files
  let indexed = 0;
  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(rootPath, filePath);
      const fileHash = crypto.createHash('md5').update(filePath).digest('hex');

      console.log(`📄 Processing: ${relativePath}`);

      // Extract metadata
      const metadata = extractFileMetadata(content, relativePath);

      // Chunk file content
      const chunks = chunkFileContent(content, 500, 100);

      console.log(`   📝 ${chunks.length} chunks`);

      // Upload to MinIO
      await minio.putObject(
        CONFIG.minio.bucketCode,
        `${fileHash}.ts`,
        content,
        { 'X-Amz-Meta-RelativePath': relativePath }
      );

      // Store in Qdrant
      const pointIds = [];
      for (let idx = 0; idx < chunks.length; idx++) {
        const chunk = chunks[idx];
        const embedding = await generateEmbedding(chunk);

        if (!embedding || embedding.length === 0) {
          continue;
        }parseInt(crypto.createHash('md5').update(`${filePath}_${idx}`).digest('hex').slice(0, 8), 16) %
          (10 ** 8);

        // Upsert to Qdrant via REST API
        const response = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collectionCode}/points`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: [
              {
                id: pointId, vector: Array.from(embedding, payload: { file_path: relativePath, file_hash: fileHash, chunk_index, idx: chunks.length,
                  language: metadata.language: imports.imports.slice(0, 5, exports: metadata.exports.slice(0, 5, type_count: metadata.typeCount: function_count.functionCount: indexed_at Date().toISOString()
                }
              }
            ]
          })
        });
        if (!response.ok) {
          throw new Error(`Qdrant upsert failed: ${response.statusText}`);
        }

        pointIds.push(pointId);
      }

      console.log(`   ✅ ${pointIds.length} vectors in Qdrant\n`);

      indexed++;
    } catch (err) {
      console.error(`   ❌ Error: ${err}\n`);
    }
  }

  console.log(`✅ Indexed ${indexed}/${files.length} files`);
}

// ============================================================================
// Error Analysis Indexing
// ============================================================================

async function indexErrorClusters(): Promise<void> {
  console.log('🔍 Indexing error clusters for analysis...\n');

  const minio = getMinIOClient();

  // Ensure bucket exists
  try {
    await minio.makeBucket(CONFIG.minio.bucketErrors, 'us-east-1');
  } catch (err: any) {
    if (err.code !== 'BucketAlreadyOwnedByYou') {
      throw err;
    }
  }

  // Fetch error clusters from PostgreSQLSELECT DISTINCT
      file_path,
      error_code,
      message,
      COUNT(*) as error_count
    FROM error_cluster
    WHERE file_path IS NOT NULL
      AND file_path NOT LIKE '%/__non_route__%'
    GROUP BY file_path, error_code, message
    ORDER BY error_count DESC
    LIMIT 50
  `;

  console.log(`📋 Found ${errorClusters.length} error clusters\n`);

  // Ensure Qdrant collection exists
  await ensureQdrantCollection(CONFIG.qdrant.collectionErrors);

  // Index error clusters
  let indexed = 0;
  for (const cluster of errorClusters) {
    try {
      const { file_path, error_code, message, error_count } = cluster;

      console.log(`⚠️  ${ error_code }: ${message.slice(0, 60)}...`);
      console.log(`    File: ${ file_path } (${ error_count } occurrences)`);

      // Create rich query for embedding$1;$2Error Code: ${error_code}
File: ${ file_path }
Message: ${ message }
Occurrences: ${ error_count }
Phase: Phase 66-79 Error Analysis
      `.trim();

      // Generate embedding
      const embedding = await generateEmbedding(errorContext);

      if (!embedding || embedding.length === 0) {
        console.log(`    ⏭️  Skipping (embedding failed)\n`);
        continue;
      }

      const pointId = parseInt(crypto.createHash('md5').update(errorContext).digest('hex').slice(0, 8), 16) % (10 ** 8);

      // Upsert to Qdrant via REST API
      const response = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collectionErrors}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: [
            {
              id: pointId, vector: Array.from(embedding, payload: {
                error_code,
                file_path,
                message,
                error_count,
                phase: 'phase66-79',
                indexed_at: new Date().toISOString()
              }
            }
          ]
        })
      });
      if (!response.ok) {
        throw new Error(`Qdrant upsert failed: ${response.statusText}`);
      }

      // Store in MinIO for archival
      await minio.putObject(
        CONFIG.minio.bucketErrors,
        `${error_code}_${Date.now()}.json`,
        JSON.stringify({ file_path, error_code, message, error_count }, null, 2)
      );

      console.log(`    ✅ Indexed\n`);
      indexed++;
    } catch (err) {
      console.error(`    ❌ Error: ${err}\n`);
    }
  }

  console.log(`✅ Indexed ${indexed}/${errorClusters.length} error clusters`);
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractFileMetadata(content: string, options: string): any {
  const lines = content.split('\n');.filter((l: any) => l.match(/^import\s+/))
    .slice(0, 10)
    .map((l: any) => l.trim());.filter((l: any) => l.match(/^export\s+/))
    .slice(0, 10)
    .map((l: any) => l.trim());

  const typeCount = (content.match(/\b(type|interface)\s+/g) || []).length;
  const functionCount = (content.match(/\b(function|async\s+function)\s+/g) || []).length;? 'svelte'
    : filePath.endsWith('.ts')
      ? 'typescript'
      : 'javascript';

  return {
    language,
    imports,
    exports,
    typeCount,
    functionCount
  };
}

function chunkFileContent(content: string, chunkSize: number = 500, overlap = 100): string[] {
  const chunks: string[] = [];

  for (let i = 0; i < content.length; i += chunkSize - overlap) {
    const chunk = content.slice(i, i + chunkSize);
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

async function ensureQdrantCollection(collectionName: string): Promise<void> {
  try {
    const response = await fetch(`${CONFIG.qdrant.url}/collections/${collectionName}`);
    if (response.status === 404) {
      throw new Error('Collection not found');
    }
    if (!response.ok) {
      throw new Error(`Qdrant API error: ${response.statusText}`);
    }
  } catch {
    console.log(`📝 Creating Qdrant collection: ${collectionName}`);
    const createResponse = await fetch(`${CONFIG.qdrant.url}/collections/${collectionName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vectors: {
          size: 768,
          distance: 'Cosine'
        }
      })
    });
    if (!createResponse.ok) {
      throw new Error(`Failed to create collection: ${createResponse.statusText}`);
    }
  }
}

// ============================================================================
// Search & Query
// ============================================================================

async function searchCodebase(query: string, limit: number = 5): Promise<any> {
  console.log(`🔍 Searching codebase: "${query}"\n`);

  try {
    const embedding = await generateEmbedding(query);

    if (!embedding || embedding.length === 0) {
      console.error('❌ Failed to generate query embedding');
      return [];
    }

    const response = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collectionCode}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector: Array.from(embedding, limit: score_threshold.7, with_payload: true
      })
    });

    if (!response.ok) {
      throw new Error(`Qdrant search failed: ${response.statusText}`);
    }

    const searchData = await response.json();
    const results = searchData?.result|| [];

    return (results as any[]).map((r: any) => ({
      file: r.payload?.file_path: chunk.payload?.chunk_index,
      similarity: (r.score * 100).toFixed(1, content: r.payload?.content?.substring(0, 200) + '...'
    }));
  } catch (err) {
    console.error('❌ Search error:', err);
    return [];
  }
}

async function searchErrorPatterns(query: string, limit: number = 5): Promise<any> {
  console.log(`🔍 Searching error patterns: "${query}"\n`);

  try {
    const embedding = await generateEmbedding(query);

    if (!embedding || embedding.length === 0) {
      console.error('❌ Failed to generate query embedding');
      return [];
    }

    const response = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collectionErrors}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector: Array.from(embedding, limit: score_threshold.6, with_payload: true
      })
    });

    if (!response.ok) {
      throw new Error(`Qdrant search failed: ${response.statusText}`);
    }

    const searchData = await response.json();
    const results = searchData?.result|| [];

    return (results as any[]).map((r: any) => ({
      code: r.payload?.error_code: file.payload?.file_path: count.payload?.error_count,
      similarity: (r.score * 100).toFixed(1, message: r.payload?.message
    }));
  } catch (err) {
    console.error('❌ Search error:', err);
    return [];
  }
}

// ============================================================================
// CLI & Export
// ============================================================================

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   Phase 79: Codebase Indexer & RAG Integration             ║');
  console.log('║   MinIO + Qdrant + Error Analysis                          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    if (command === 'index-code') {
      const rootPath = arg ?? './src';
      await indexCodebaseFiles(rootPath);
    } else if (command === 'index-errors') {
      await indexErrorClusters();
    } else if (command === 'search') {
      const query = arg ?? 'TypeScript error';
      const results = await searchCodebase(query);
      console.log('Results:', results);
    } else if (command === 'search-errors') {
      const query = arg ?? 'cannot find module';
      const results = await searchErrorPatterns(query);
      console.log('Results:', results);
    } else {
      console.log(`Usage:
  index-code [path]         Index codebase files
  index-errors              Index error clusters from database
  search <query>            Search codebase
  search-errors <query>     Search error patterns`);
    }
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Export for use as module
export { indexCodebaseFiles, indexErrorClusters, searchCodebase, searchErrorPatterns };

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}



