/**
 * Phase 79: Codebase Indexing API Endpoints
 *
 * POST /api/indexing/codebase - Index all TypeScript/Svelte files
 * POST /api/indexing/errors - Index error patterns from database
 * GET /api/indexing/status - Check indexing status
 * POST /api/indexing/search - Search indexed codebase
 * POST /api/indexing/search-errors - Search indexed error patterns
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'crypto';
import fs from 'fs/promises';
import { glob } from 'glob';
import { ensureBucket, putObject } from '$lib/server/minio-client.js';
import path from 'path';
import postgres from 'postgres';

import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
// Configuration
const CONFIG = {
  qdrant: {
    url: ENV.QDRANT_URL,
    collectionCode: 'phase79_codebase',
    collectionErrors: 'phase79_error_analysis'
  },
  minio: {
    bucketCode: 'codebase-index',
    bucketErrors: 'error-analysis'
  },
  ollama: {
    url: ENV.OLLAMA_BASE_URL,
    embeddingModel: 'embeddinggemma:latest'
  },
  postgres: {
    url: ENV.DATABASE_URL
  }
};

// Helpers

// MinIO client consolidated into $lib/server/minio-client.ts

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONFIG.ollama.embeddingModel,
        prompt: text.substring(0, 8000)
      }),
      signal: AbortSignal.timeout(15_000)
    });

    const data = await response.json();
    return data?.embedding || [];
  } catch (err) {
    console.error('Embedding error:', err);
    return [];
  }
}

async function ensureQdrantCollection(collectionName: string): Promise<void> {
  try {
    const response = await fetch(`${CONFIG.qdrant.url}/collections/${collectionName}`, { signal: AbortSignal.timeout(5_000) });
    if (response.status === 404) {
      throw new Error('Collection not found');
    }
    if (!response.ok) {
      throw new Error(`Qdrant API error: ${response.statusText}`);
    }
  } catch {
    const createResponse = await fetch(`${CONFIG.qdrant.url}/collections/${collectionName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: {
          size: 768,
          distance: 'Cosine'
        }
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!createResponse.ok) {
      throw new Error(`Failed to create collection: ${createResponse.statusText}`);
    }
  }
}

interface FileMetadata { language: string; imports: string[]; exports: string[]; typeCount: number; functionCount: number }

function extractFileMetadata(content: string, filePath: string): FileMetadata {
  const lines = content.split('\n');
  const imports = lines
    .filter(l => l.match(/^import\s+/))
    .slice(0, 10)
    .map(l => l.trim());
  const exports = lines
    .filter(l => l.match(/^export\s+/))
    .slice(0, 10)
    .map(l => l.trim());

  const typeCount = (content.match(/\b(type|interface)\s+/g) || []).length;
  const functionCount = (content.match(/\b(function|async\s+function)\s+/g) || []).length;

  const language = filePath.endsWith('.svelte')
    ? 'svelte'
    : filePath.endsWith('.ts')
      ? 'typescript'
      : 'javascript';

  return { language, imports, exports, typeCount, functionCount };
}

function chunkFileContent(content: string, chunkSize: number = 500, overlap: number = 100): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += chunkSize - overlap) {
    const chunk = content.slice(i, i + chunkSize);
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
  }
  return chunks;
}

const PROJECT_ROOT = path.resolve(process.cwd());

const indexCodebaseSchema = z.object({
  rootPath: z
    .string()
    .max(500)
    .optional()
    .default('./src')
    .refine((p) => !p.includes('..'), 'Path traversal not allowed'),
});

const indexSearchSchema = z.object({
  query: z.string().min(1, 'query is required').max(5000),
  limit: z.number().int().min(1).max(100).optional().default(5),
});

// POST /api/indexing

export const POST: RequestHandler = async ({ request, url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const pathname = url.pathname;
  const action = url.searchParams.get('action');

  // Index Codebase
  if (pathname === '/api/indexing/codebase' || action === 'codebase') {
    try {
      const raw = await request.json();
      const parsed = indexCodebaseSchema.safeParse(raw);
      if (!parsed.success) {
        return json(
          { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 }
        );
      }
      const rootPath = parsed.data.rootPath;

      // Verify rootPath resolves within project directory
      const resolvedRoot = path.resolve(PROJECT_ROOT, rootPath);
      if (!resolvedRoot.startsWith(PROJECT_ROOT)) {
        return json(
          { success: false, error: 'rootPath must be within the project directory' },
          { status: 400 }
        );
      }

      // Ensure bucket exists
      await ensureBucket(CONFIG.minio.bucketCode);

      // Find files
      const patterns = ['**/*.ts', '**/*.svelte', '**/*.js'];
      const files: string[] = [];

      for (const pattern of patterns) {
        const fullPattern = path.join(rootPath, pattern);
        const matches = glob.sync(fullPattern, {
          ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/dist/**'],
        });
        files.push(...matches);
      }

      // Ensure Qdrant collection exists
      await ensureQdrantCollection(CONFIG.qdrant.collectionCode);

      // Process files
      let indexed = 0;
      const results: {
        file: string;
        chunks?: number;
        vectors?: number;
        code?: string;
        count?: string;
      }[] = [];

      for (const filePath of files.slice(0, 50)) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const relativePath = path.relative(rootPath, filePath);
          const fileHash = crypto.createHash('md5').update(filePath).digest('hex');

          const metadata = extractFileMetadata(content, relativePath);
          const chunks = chunkFileContent(content, 500, 100);

          // Upload to MinIO
          await putObject(CONFIG.minio.bucketCode, `${fileHash}.ts`, Buffer.from(content), {
            'X-Amz-Meta-RelativePath': relativePath,
          });

          // Store in Qdrant
          const pointIds = [];
          for (let idx = 0; idx < chunks.length; idx++) {
            const chunk = chunks[idx];
            const embedding = await generateEmbedding(chunk);

            if (!embedding || embedding.length === 0) continue;

            const pointId =
              parseInt(
                crypto.createHash('md5').update(`${filePath}_${idx}`).digest('hex').slice(0, 8),
                16
              ) %
              10 ** 8;

            const upsertResponse = await fetch(
              `${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collectionCode}/points`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  points: [
                    {
                      id: pointId,
                      vector: Array.from(embedding),
                      payload: {
                        file_path: relativePath,
                        file_hash: fileHash,
                        chunk_index: idx,
                        chunk_count: chunks.length,
                        language: metadata.language,
                        imports: metadata.imports.slice(0, 5),
                        exports: metadata.exports.slice(0, 5),
                        type_count: metadata.typeCount,
                        function_count: metadata.functionCount,
                        indexed_at: new Date().toISOString(),
                      },
                    },
                  ],
                }),
                signal: AbortSignal.timeout(10_000),
              }
            );
            if (!upsertResponse.ok) {
              throw new Error(`Qdrant upsert failed: ${upsertResponse.statusText}`);
            }

            pointIds.push(pointId);
          }

          results.push({
            file: relativePath,
            chunks: chunks.length,
            vectors: pointIds.length,
          });

          indexed++;
        } catch (err) {
          console.error(`Error indexing ${filePath}:`, err);
        }
      }

      return json({
        success: true,
        indexed: results,
        message: `Indexed ${indexed} of ${Math.min(50, files.length)} files`,
      });
    } catch (err) {
      return json({ success: false, error: 'Indexing operation failed' }, { status: 500 });
    }
  }

  // Index Errors
  if (pathname === '/api/indexing/errors' || action === 'errors') {
    try {
      const sql = postgres(CONFIG.postgres.url);
      // Ensure bucket exists
      await ensureBucket(CONFIG.minio.bucketErrors);

      // Fetch error clusters
      const errorClusters = await sql`
        SELECT DISTINCT
          file_path, error_code,
          message,
          COUNT(*) as error_count
        FROM error_cluster
        WHERE file_path IS NOT NULL
        GROUP BY file_path, error_code, message
        ORDER BY error_count DESC
        LIMIT 50
      `;

      // Ensure Qdrant collection exists
      await ensureQdrantCollection(CONFIG.qdrant.collectionErrors);

      // Index error clusters
      let indexed = 0;
      const results: {
        file: string;
        chunks?: number;
        vectors?: number;
        code?: string;
        count?: string;
      }[] = [];

      for (const cluster of errorClusters) {
        try {
          const { file_path, error_code, message, error_count } = cluster;
          const errorContext = `Error Code: ${error_code}
File: ${file_path}
Message: ${message}
Occurrences: ${error_count}
Phase: Phase 66-79 Error Analysis`.trim();

          const embedding = await generateEmbedding(errorContext);

          if (!embedding || embedding.length === 0) continue;

          const pointId =
            parseInt(crypto.createHash('md5').update(errorContext).digest('hex').slice(0, 8), 16) %
            10 ** 8;

          const upsertResponse = await fetch(
            `${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collectionErrors}/points`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                points: [
                  {
                    id: pointId,
                    vector: Array.from(embedding),
                    payload: {
                      error_code,
                      file_path,
                      message,
                      error_count,
                      phase: 'phase66-79',
                      indexed_at: new Date().toISOString(),
                    },
                  },
                ],
              }),
              signal: AbortSignal.timeout(10_000),
            }
          );
          if (!upsertResponse.ok) {
            throw new Error(`Qdrant upsert failed: ${upsertResponse.statusText}`);
          }

          // Store in MinIO
          await putObject(
            CONFIG.minio.bucketErrors,
            `${error_code}_${Date.now()}.json`,
            Buffer.from(JSON.stringify({ file_path, error_code, message, error_count }, null, 2))
          );

          results.push({
            code: error_code,
            file: file_path,
            count: error_count,
          });

          indexed++;
        } catch (err) {
          console.error('Error indexing cluster:', err);
        }
      }

      await sql.end();

      return json({
        success: true,
        indexed: results,
        message: `Indexed ${indexed} error clusters`,
      });
    } catch (err) {
      return json({ success: false, error: 'Indexing operation failed' }, { status: 500 });
    }
  }

  // Search Codebase
  if (pathname === '/api/indexing/search' || action === 'search') {
    try {
      const raw = await request.json();
      const parsed = indexSearchSchema.safeParse(raw);
      if (!parsed.success) {
        return json(
          { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 }
        );
      }
      const { query, limit } = parsed.data;

      const embedding = await generateEmbedding(query);

      if (!embedding || embedding.length === 0) {
        return json({ success: false, error: 'Failed to generate embedding' }, { status: 400 });
      }

      const searchResponse = await fetch(
        `${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collectionCode}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: Array.from(embedding),
            limit,
            with_payload: true,
          }),
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (!searchResponse.ok) {
        throw new Error(`Qdrant search failed: ${searchResponse.statusText}`);
      }

      const searchData = await searchResponse.json();
      const results = searchData?.result || [];

      return json({
        success: true,
        results: results.map((r: { score: number; payload?: Record<string, unknown> }) => ({
          file: r.payload?.file_path,
          chunk: r.payload?.chunk_index,
          similarity: (r.score * 100).toFixed(1),
          language: r.payload?.language,
          content: String(r.payload?.content ?? '').substring(0, 150) + '...',
        })),
      });
    } catch (err) {
      return json({ success: false, error: 'Indexing operation failed' }, { status: 500 });
    }
  }

  // Search Error Patterns
  if (pathname === '/api/indexing/search-errors' || action === 'search-errors') {
    try {
      const raw = await request.json();
      const parsed = indexSearchSchema.safeParse(raw);
      if (!parsed.success) {
        return json(
          { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 }
        );
      }
      const { query, limit } = parsed.data;

      const embedding = await generateEmbedding(query);

      if (!embedding || embedding.length === 0) {
        return json({ success: false, error: 'Failed to generate embedding' }, { status: 400 });
      }

      const searchResponse = await fetch(
        `${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collectionErrors}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: Array.from(embedding),
            limit,
            with_payload: true,
          }),
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (!searchResponse.ok) {
        throw new Error(`Qdrant search failed: ${searchResponse.statusText}`);
      }

      const searchData = await searchResponse.json();
      const results = searchData?.result || [];

      return json({
        success: true,
        results: results.map((r: { score: number; payload?: Record<string, unknown> }) => ({
          code: r.payload?.error_code,
          file: r.payload?.file_path,
          count: r.payload?.error_count,
          similarity: (r.score * 100).toFixed(1),
          message: String(r.payload?.message ?? '').substring(0, 100) + '...',
        })),
      });
    } catch (err) {
      return json({ success: false, error: 'Indexing operation failed' }, { status: 500 });
    }
  }

  return json({ success: false, error: 'Not found' }, { status: 404 });
};

// GET /api/indexing/status

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const codebaseResponse = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collectionCode}`, { signal: AbortSignal.timeout(5_000) });
    const errorsResponse = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collectionErrors}`, { signal: AbortSignal.timeout(5_000) });

    const codebaseData = codebaseResponse.ok ? await codebaseResponse.json() : null;
    const errorsData = errorsResponse.ok ? await errorsResponse.json() : null;

    const codebaseCollection = codebaseData?.result;
    const errorsCollection = errorsData?.result;

    return json({
      success: true,
      collections: {
        codebase: {
          points_count: codebaseCollection?.points_count ?? 0,
          vectors_size: codebaseCollection?.config?.params?.vectors?.size ?? 768
        },
        errors: {
          points_count: errorsCollection?.points_count ?? 0,
          vectors_size: errorsCollection?.config?.params?.vectors?.size ?? 768
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return json({
      success: false,
      collections: {
        codebase: { points_count: 0, vectors_size: 768 },
        errors: { points_count: 0, vectors_size: 768 },
      },
      timestamp: new Date().toISOString(),
    });
  }
};
