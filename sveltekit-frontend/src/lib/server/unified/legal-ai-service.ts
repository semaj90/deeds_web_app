import { pgRows } from '$lib/server/db/client';
/**
 * Unified Legal AI Service
 * Facade over: MinIO storage, Qdrant vectors, PostgreSQL metadata, Redis cache
 *
 * Delegates to existing production implementations rather than reimplementing:
 *   - uploadFile()           → minio-client.ts
 *   - qdrant.search()        → qdrant-manager.ts
 *   - generateSingleEmbed()  → grpc/embedding-client.ts
 *   - getVectorCache/set     → vector-cache.ts
 *   - db                     → Drizzle PostgreSQL client
 */
import { randomUUID } from 'node:crypto';
import { uploadSeaweedFile as uploadFile } from '$lib/server/seaweed-client.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { getVectorCache, setVectorCache } from '$lib/server/vector-cache.js';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL } from '$lib/ai/model-ids.js';
import { ollamaFetch } from '$lib/server/ollama.js';

// --- Types ---

export interface DocumentUpload {
  file: Buffer;
  fileName: string;
  contentType: string;
  caseId?: string;
  documentType: 'evidence' | 'legal_document' | 'contract' | 'brief';
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  query: string;
  type?: 'evidence' | 'documents' | 'all';
  limit?: number;
  threshold?: number;
  caseId?: string;
  cacheResults?: boolean;
}

export interface SearchHit {
  id: string;
  score: number;
  content: string;
  evidenceId?: string;
  fileName?: string;
  sectionPath?: string[];
  heading?: string;
  citations?: string[];
}

export interface UploadResult {
  id: string;
  fileUrl: string;
  objectKey: string;
}

export interface SearchResults {
  results: SearchHit[];
  cached: boolean;
  queryTimeMs: number;
}

export interface HealthStatus {
  postgresql: boolean;
  qdrant: boolean;
  seaweed: boolean;
  minio: boolean;
  overall: 'healthy' | 'degraded' | 'down';
}

// --- Service ---

const EVIDENCE_BUCKET = ENV.MINIO_EVIDENCE_BUCKET;

export class UnifiedLegalAIService {
  /**
   * Upload a document to SeaweedFS and record in PostgreSQL.
   * The full embedding pipeline (chunk → embed → Qdrant) runs async
   * via /api/evidence/upload — this method handles storage + DB insert.
   */
  async uploadDocument(upload: DocumentUpload): Promise<UploadResult> {
    const documentId = randomUUID();
    const ext = upload.fileName.split('.').pop() ?? 'bin';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = upload.documentType === 'evidence' ? 'evidence' : 'documents';
    const objectKey = `${prefix}/${upload.caseId ?? 'default'}/${timestamp}-${documentId.slice(0, 8)}.${ext}`;

    await uploadFile(EVIDENCE_BUCKET, objectKey, upload.file, {
      'Content-Type': upload.contentType,
    });

    const fileUrl = `minio://${EVIDENCE_BUCKET}/${objectKey}`;

    await db.execute(sql`
			INSERT INTO evidence (case_id, evidence_number, title, type, description,
				evidence_type, file_type, file_url, file_name, file_size, uploaded_at)
			VALUES (
				${upload.caseId ?? '00000000-0000-0000-0000-000000000000'},
				${'EV-' + Date.now().toString(36).toUpperCase()},
				${upload.fileName},
				'document',
				${(upload.metadata?.description as string) || `Uploaded: ${upload.fileName}`},
				${upload.documentType},
				${upload.contentType},
				${fileUrl},
				${upload.fileName},
				${upload.file.length},
				NOW()
			)
			RETURNING id
		`);

    return { id: documentId, fileUrl, objectKey };
  }

  /**
   * Semantic search across evidence vectors via Qdrant.
   * Embeds the query → vector search → returns ranked hits.
   * Falls back to pgvector cosine search if Qdrant is unavailable.
   */
  async search(options: SearchOptions): Promise<SearchResults> {
    const start = performance.now();
    const { query, limit = 10, threshold = 0.3, caseId, cacheResults = true } = options;

    // Check cache
    if (cacheResults) {
      try {
        const { entry } = await getVectorCache(query, { caseId, limit });
        if (entry) {
          return {
            results: entry.results as unknown as SearchHit[],
            cached: true,
            queryTimeMs: performance.now() - start,
          };
        }
      } catch {
        /* cache miss */
      }
    }

    // Embed query
    let embedding: number[] | null = null;
    try {
      embedding = await generateSingleEmbedding(query);
    } catch {
      // gRPC unavailable — try direct Ollama
      try {
        const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: SERVER_EMBEDDING_MODEL, prompt: query }),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          const data = await res.json();
          embedding = data.embedding;
        }
      } catch {
        /* no embedding available */
      }
    }

    if (!embedding || embedding.length === 0) {
      return { results: [], cached: false, queryTimeMs: performance.now() - start };
    }

    // Qdrant vector search
    const filter = caseId ? { must: [{ key: 'case_id', match: { value: caseId } }] } : undefined;

    let hits: SearchHit[] = [];
    try {
      const qdrantResults = await qdrant.hybridSearch({
        query,
        queryEmbedding: embedding,
        collection: 'evidence',
        limit,
        scoreThreshold: threshold,
        filters: filter,
      });

      hits = (qdrantResults.results ?? []).map((hit: any) => ({
        id: String(hit.id),
        score: hit.score ?? 0,
        content: hit.payload?.content_preview ?? '',
        evidenceId: hit.payload?.evidence_id,
        fileName: hit.payload?.file_name,
        sectionPath: hit.payload?.section_path,
        heading: hit.payload?.heading,
        citations: hit.payload?.citations,
      }));
    } catch (err) {
      console.warn('[UnifiedLegalAI] Qdrant search failed, falling back to pgvector:', err);

      // Fallback: pgvector cosine search
      const vectorStr = `[${embedding.join(',')}]`;
      const pgResults = await db.execute(sql`
				SELECT ev.evidence_id, ev.chunk_index, ev.content,
					1 - (ev.embedding <=> ${vectorStr}::vector) AS score
				FROM evidence_vectors ev
				WHERE 1 - (ev.embedding <=> ${vectorStr}::vector) > ${threshold}
				ORDER BY score DESC
				LIMIT ${limit}
			`);

      const rows = pgRows(pgResults);
      hits = rows.map((row: any) => ({
        id: row.evidence_id ?? '',
        score: parseFloat(row.score) || 0,
        content: row.content ?? '',
        evidenceId: row.evidence_id,
      }));
    }

    // Cache results (30min TTL)
    if (cacheResults && hits.length > 0) {
      setVectorCache(
        query,
        hits,
        {
          searchTime: performance.now() - start,
          totalResults: hits.length,
          model: SERVER_EMBEDDING_MODEL,
          distanceMetric: 'cosine',
          threshold,
        },
        { caseId, limit }
      ).catch(() => {});
    }

    return {
      results: hits,
      cached: false,
      queryTimeMs: performance.now() - start,
    };
  }

  /**
   * Health check — pings PostgreSQL, Qdrant, and MinIO.
   */
  async healthCheck(): Promise<HealthStatus> {
    const status: HealthStatus = {
      postgresql: false,
      qdrant: false,
      seaweed: false,
      minio: false,
      overall: 'down',
    };

    // PostgreSQL
    try {
      await db.execute(sql`SELECT 1`);
      status.postgresql = true;
    } catch {
      /* down */
    }

    // Qdrant
    try {
      status.qdrant = Object.keys(qdrant.collections).length > 0;
    } catch {
      /* down */
    }

    // SeaweedFS / S3-compatible object storage
    try {
      const { checkSeaweedHealth: checkHealth } = await import('$lib/server/seaweed-client.js');
      const health = await checkHealth();
      status.seaweed = health.healthy;
      status.minio = health.healthy;
    } catch {
      /* down */
    }

    const upCount = [status.postgresql, status.qdrant, status.seaweed].filter(Boolean).length;
    status.overall = upCount === 3 ? 'healthy' : upCount >= 1 ? 'degraded' : 'down';

    return status;
  }
}

/** Singleton instance */
export const legalAIService = new UnifiedLegalAIService();
