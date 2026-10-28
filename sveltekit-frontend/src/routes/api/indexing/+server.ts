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
import globPkg from 'glob';
const glob = (globPkg as any).glob ?? globPkg;
import { ensureSeaweedBucket, putSeaweedObject } from '$lib/server/seaweed-client.js';
import path from 'path';
import postgres from 'postgres';

import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
// Configuration
const CONFIG = {
  qdrant: {
    url: ENV.QDRANT_URL,
    collectionCode: 'phase79_codebase'
  },
  seaweed: {
    bucketCode: 'codebase-index'
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

// SeaweedFS adapter consolidated into $lib/server/seaweed-client.ts

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

const ERROR_INDEX_BATCH = 50;
const EMBEDDING_DIM = 768;

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
      await ensureSeaweedBucket(CONFIG.seaweed.bucketCode);

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

          // Upload to SeaweedFS
          await putSeaweedObject(CONFIG.seaweed.bucketCode, `${fileHash}.ts`, Buffer.from(content), {
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

  // Index Errors: embed error_logs.message into error_logs.message_embedding (pgvector, semantic_768).
  // Bounded batch per call; rows are picked oldest-unembedded-first so repeated clicks make progress.
  if (pathname === '/api/indexing/errors' || action === 'errors') {
    const sql = postgres(CONFIG.postgres.url);
    try {
      const rows = await sql`
        SELECT id, error_category, message, file_path, route_path
        FROM error_logs
        WHERE message_embedding IS NULL AND message IS NOT NULL AND btrim(message) <> ''
        ORDER BY created_at DESC, id
        LIMIT ${ERROR_INDEX_BATCH}
      `;

      let indexed = 0;
      let skipped = 0;
      for (const row of rows) {
        const text = `Error Category: ${row.error_category ?? 'unknown'}
File: ${row.file_path ?? row.route_path ?? 'unknown'}
Message: ${row.message}`;
        const embedding = await generateEmbedding(text);
        if (embedding.length !== EMBEDDING_DIM) {
          skipped++;
          continue;
        }
        await sql`
          UPDATE error_logs
          SET message_embedding = ${`[${embedding.join(',')}]`}::vector,
              message_embedding_model = ${CONFIG.ollama.embeddingModel},
              message_embedded_at = now()
          WHERE id = ${row.id}
        `;
        indexed++;
      }

      const [{ remaining }] = await sql`
        SELECT count(*)::int AS remaining FROM error_logs
        WHERE message_embedding IS NULL AND message IS NOT NULL AND btrim(message) <> ''
      `;

      return json({
        success: true,
        indexed,
        skipped,
        remaining,
        message: `Embedded ${indexed} error_logs rows (${skipped} skipped, ${remaining} remaining)`,
      });
    } catch (err) {
      console.error('Error indexing failed:', err);
      return json({ success: false, error: 'Indexing operation failed' }, { status: 500 });
    } finally {
      await sql.end();
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
        `${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collectionCode}/points/query`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: Array.from(embedding),
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
      const results = searchData?.result?.points || [];

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

      if (embedding.length !== EMBEDDING_DIM) {
        return json({ success: false, error: 'Embedding dimension mismatch' }, { status: 400 });
      }

      const sql = postgres(CONFIG.postgres.url);
      try {
        const rows = await sql`
          SELECT error_category, file_path, route_path, message,
                 1 - (message_embedding <=> ${`[${embedding.join(',')}]`}::vector) AS similarity
          FROM error_logs
          WHERE message_embedding IS NOT NULL
          ORDER BY message_embedding <=> ${`[${embedding.join(',')}]`}::vector
          LIMIT ${limit}
        `;
        return json({
          success: true,
          results: rows.map((r) => ({
            code: r.error_category,
            file: r.file_path ?? r.route_path,
            similarity: (Number(r.similarity) * 100).toFixed(1),
            message: String(r.message ?? '').substring(0, 100) + '...',
          })),
        });
      } finally {
        await sql.end();
      }
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

    const codebaseData = codebaseResponse.ok ? await codebaseResponse.json() : null;
    const sql = postgres(CONFIG.postgres.url);
    let errorsEmbedded = 0;
    try {
      const [row] = await sql`SELECT count(*)::int AS n FROM error_logs WHERE message_embedding IS NOT NULL`;
      errorsEmbedded = row?.n ?? 0;
    } finally {
      await sql.end();
    }

    const codebaseCollection = codebaseData?.result;

    return json({
      success: true,
      collections: {
        codebase: {
          points_count: codebaseCollection?.points_count ?? 0,
          vectors_size: codebaseCollection?.config?.params?.vectors?.size ?? 768
        },
        errors: {
          points_count: errorsEmbedded,
          vectors_size: EMBEDDING_DIM
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
