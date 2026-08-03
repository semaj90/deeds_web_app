/**
 * Postgres Ingestion Boundary — CrawledDocument → Canonical Storage
 *
 * Validated Crawl4AI output enters the canonical document atlas here.
 * The boundary persists one document record and one or more chunk rows in a
 * single transaction, and it preserves failure identity for batch calls.
 *
 * Ownership:
 * - INPUT: CrawledDocument (validated)
 * - STORAGE: documents_atlas_entries + atlas_chunks
 * - OUTPUT: documentId + chunk IDs for downstream indexing
 *
 * Do NOT write to Qdrant, Redis, or Neo4j from this boundary.
 */

import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { documentsAtlasEntries } from '$lib/server/db/schema/documents-atlas.js';
import { atlasChunks } from '$lib/server/db/schema/atlas-chunks.js';
import type { CrawledDocument } from './crawled-document.schema.js';

/**
 * Chunk configuration.
 */
export interface ChunkConfig {
  strategy: 'semantic' | 'sliding_window';
  chunkSize?: number;
  overlapSize?: number;
}

const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  strategy: 'sliding_window',
  chunkSize: 2000,
  overlapSize: 200,
};

/**
 * The semantic strategy is intentionally hard-failed until a real chunker is wired.
 * Falling back silently would make proof claims misleading.
 */
function chunkText(text: string, config: ChunkConfig = DEFAULT_CHUNK_CONFIG): string[] {
  if (config.strategy === 'semantic') {
    throw new Error('SEMANTIC_CHUNKER_NOT_CONFIGURED');
  }

  const { chunkSize = 2000, overlapSize = 200 } = config;
  const chunks: string[] = [];

  let pos = 0;
  while (pos < text.length) {
    const end = Math.min(pos + chunkSize, text.length);
    chunks.push(text.slice(pos, end));
    pos = Math.max(pos + chunkSize - overlapSize, pos + 1);
  }

  return chunks.length > 0 ? chunks : [text];
}

export interface IngestionResult {
  documentId: string;
  sourceRef: string;
  sourceRevision: string;
  contentHash: string;
  chunkIds: string[];
  chunkCount: number;
  wasDuplicate: boolean;
}

export interface IngestionBatchResult {
  results: IngestionResult[];
  failures: Array<{ url: string; error: string }>;
}

function deriveSourceRevision(crawled: CrawledDocument): string {
  return createHash('sha256')
    .update([crawled.canonical_url, crawled.content_hash, 'crawl4ai'].join('|'))
    .digest('hex');
}

function getDocumentPayload(crawled: CrawledDocument, sourceRevision: string, workspaceId: string, userId: number, chunkIds: string[]) {
  return {
    workspaceId,
    userId,
    sourceUrl: crawled.source_url,
    canonicalUrl: crawled.canonical_url,
    contentHash: crawled.content_hash,
    sourceRevision,
    accessScope: crawled.access_scope,
    acquisitionProvider: 'crawl4ai',
    retrievedAt: crawled.retrieved_at,
    language: crawled.language || 'en',
    domainClass: crawled.domain_class,
    chunkIds,
  };
}

/**
 * Ingest a validated CrawledDocument into Postgres canonical storage.
 * The whole write path is wrapped in a transaction.
 */
export async function ingestCrawledDocument(
  crawled: CrawledDocument,
  userId: number,
  workspaceId: string,
  chunkConfig: ChunkConfig = DEFAULT_CHUNK_CONFIG,
): Promise<IngestionResult> {
  const sourceRevision = deriveSourceRevision(crawled);
  const now = new Date();

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: documentsAtlasEntries.id,
        metadata: documentsAtlasEntries.metadata,
        chunkIds: documentsAtlasEntries.chunkIds,
      })
      .from(documentsAtlasEntries)
      .where(eq(documentsAtlasEntries.sourceRef, crawled.canonical_url))
      .limit(1);

    const existingContentHash = (existing[0]?.metadata as { contentHash?: string } | undefined)?.contentHash;
    const existingChunkIds = Array.isArray(existing[0]?.chunkIds) ? existing[0]!.chunkIds as string[] : [];

    if (existing.length > 0 && existingContentHash === crawled.content_hash) {
      console.log(`[ingest] Document already exists (duplicate): ${crawled.content_hash}`);
      return {
        documentId: existing[0]!.id,
        sourceRef: crawled.canonical_url,
        sourceRevision,
        contentHash: crawled.content_hash,
        chunkIds: existingChunkIds,
        chunkCount: existingChunkIds.length,
        wasDuplicate: true,
      };
    }

    const chunkTexts = chunkText(crawled.text, chunkConfig);
    const chunkIds = chunkTexts.map(() => randomUUID());
    const payload = getDocumentPayload(crawled, sourceRevision, workspaceId, userId, chunkIds);

    if (existing.length > 0) {
      await tx.delete(atlasChunks).where(eq(atlasChunks.path, crawled.canonical_url));
      await tx
        .update(documentsAtlasEntries)
        .set({
          path: crawled.canonical_url,
          title: crawled.title,
          category: 'web_document',
          summary: crawled.text.slice(0, 280),
          tags: crawled.domain_class,
          featureFamilies: ['web_document'],
          sourceRefs: [crawled.source_url, crawled.canonical_url],
          chunkIds,
          metadata: payload,
          updatedAt: now,
        })
        .where(eq(documentsAtlasEntries.sourceRef, crawled.canonical_url));
    } else {
      const inserted = await tx.insert(documentsAtlasEntries).values({
        sourceRef: crawled.canonical_url,
        path: crawled.canonical_url,
        title: crawled.title,
        category: 'web_document',
        summary: crawled.text.slice(0, 280),
        tags: crawled.domain_class,
        sourceRefs: [crawled.source_url, crawled.canonical_url],
        chunkIds,
        featureFamilies: ['web_document'],
        metadata: payload,
        parentId: null,
        featureFamily: 'web_document',
        createdAt: now,
        updatedAt: now,
      }).returning({ id: documentsAtlasEntries.id });

      existing.push({
        ...(inserted[0] as Record<string, unknown>),
        metadata: payload,
        chunkIds,
      } as typeof existing[number]);
    }

    for (let i = 0; i < chunkTexts.length; i++) {
      const chunkTextValue = chunkTexts[i];
      const chunkId = chunkIds[i]!;

      await tx.insert(atlasChunks).values({
        id: randomUUID(),
        chunkId,
        path: crawled.canonical_url,
        summary: `${crawled.title} :: chunk ${i + 1}`,
        content: chunkTextValue,
        featureFamily: 'web_document',
        sourceRefs: [crawled.source_url, crawled.canonical_url],
        clusterTags: crawled.domain_class,
        envVars: [],
        embedding: null,
        createdAt: now,
      });
    }

    console.log(
      `[ingest] Document persisted: ${crawled.canonical_url} (${chunkTexts.length} chunks, contentHash=${crawled.content_hash.slice(0, 8)}...)`
    );

    return {
      documentId: existing[0]!.id,
      sourceRef: crawled.canonical_url,
      sourceRevision,
      contentHash: crawled.content_hash,
      chunkIds,
      chunkCount: chunkIds.length,
      wasDuplicate: false,
    };
  });
}

/**
 * Batch ingest multiple documents, preserving failure identity.
 */
export async function ingestCrawledDocumentBatch(
  crawledDocs: CrawledDocument[],
  userId: number,
  workspaceId: string,
  chunkConfig?: ChunkConfig,
): Promise<IngestionBatchResult> {
  const results: IngestionResult[] = [];
  const failures: Array<{ url: string; error: string }> = [];

  for (const crawled of crawledDocs) {
    try {
      const result = await ingestCrawledDocument(crawled, userId, workspaceId, chunkConfig);
      results.push(result);
    } catch (err) {
      failures.push({
        url: crawled.canonical_url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (failures.length > 0) {
    console.error(`[ingest] ${failures.length}/${crawledDocs.length} documents failed:`, failures);
  }

  return { results, failures };
}
