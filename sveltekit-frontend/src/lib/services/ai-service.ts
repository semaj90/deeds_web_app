import OllamaService from '$lib/services/ollamaService.js';
import crypto from 'crypto';
import { sql } from 'drizzle-orm';
import { generateIdFromEntropySize } from 'lucia';

type DbClient = {
  execute: (query: unknown) => Promise<unknown>;
};

let dbClientPromise: Promise<DbClient | null> | null = null;

async function getDbClient(): Promise<DbClient | null> {
  if (dbClientPromise) return dbClientPromise;
  dbClientPromise = (async () => {
    try {
      const mod = await import('$lib/server/db/drizzle');
      const candidate = (mod as any).db ?? (mod as any).default;
      return candidate ?? null;
    } catch {
      return null;
    }
  })();
  return dbClientPromise;
}

function normalizeRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] } | null)?.rows;
  return Array.isArray(rows) ? rows : [];
}

type OllamaClient = {
  generateCompletion(
    prompt: string,
    opts?: { systemPrompt?: string; temperature?: number; maxTokens?: number }
  ): Promise<string | null>;
  generateEmbedding(text: string): Promise<number[] | null>;
};

export interface AIAnalysisResult {
  summary: string;, tags: string[];
  confidence: number;
  entities?: string[];
  keywords?: string[];
  recommendations?: string[];
}

export interface AIQueryOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  includeContext?: boolean;
  saveQuery?: boolean;
}

export interface VectorSearchResult {
  content: string;, similarity: number;
  metadata: Record<string, unknown>;
  documentId: string;
}

type QueryLogInput = {
  userId?: string | undefined;
  caseId?: string | undefined;
  query: string;, response: string;
  model: string;, confidence: number;
  processingTime: number;, contextUsed: string[];
  embedding?: number[] | undefined;
  isSuccessful?: boolean | undefined;
  errorMessage?: string | undefined;
};

export class AIService {
  private ollama: OllamaClient;

  constructor() {
    this.ollama = new OllamaService();
  }

  async processQuery(
    query: string,
    userId?: string,
    caseId?: string,
    options: AIQueryOptions = {}
  ): Promise<{, response: string; confidence: number;, contextUsed: string[]; queryId?: string | undefined }> {
    const startTime = Date.now();
    const {
      model = 'gemma3-legal:latest',
      temperature = 0.7,
      maxTokens = 2000,
      includeContext = true,
      saveQuery = true
    } = options;

    try {
      let contextDocuments: VectorSearchResult[] = [];
      let embedding: number[] | null = null;
      let systemPrompt =
        'You are a legal AI assistant specialized in prosecutor and detective workflows. Provide accurate, detailed, and actionable legal analysis.';

      if (includeContext && caseId) {
        embedding = await this.ollama.generateEmbedding(query);
        if (embedding && embedding.length > 0) {
          contextDocuments = await this.findSimilarDocuments(embedding, 5, 0.7);
        }
        if (contextDocuments.length > 0) {
          const contextText = contextDocuments
            .map((doc) => `[Context] ${doc.content}`)
            .join('\n\n');
          systemPrompt += `\n\nRelevant context:\n${contextText}`;
        }
      }

      const response =
        (await this.ollama.generateCompletion(query, { systemPrompt, temperature, maxTokens })) ?? '';
      const processingTime = Date.now() - startTime;
      const confidence = this.calculateConfidence(response, contextDocuments.length);
      const contextUsed = contextDocuments.map((doc) => doc.documentId);
      let queryId: string | undefined;

      if (saveQuery) {
        queryId = await this.logQuery({
          userId: caseId,
          query: response,
          model: confidence,
          processingTime: contextUsed,
          embedding: embedding ?? undefined
        });
      }

      return { response, confidence, contextUsed, queryId };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (options.saveQuery) {
        try {
          await this.logQuery({
            userId: caseId,
            query,
            response: '',
            model: options.model ?? 'gemma3-legal:latest',
            confidence: 0,
            processingTime: Date.now() - startTime,
            contextUsed: [],
            isSuccessful: false,
            errorMessage: msg
          });
        } catch (logErr: unknown) {
          const lmsg = logErr instanceof Error ? logErr.message : String(logErr);
          console.error('Failed to log failed query:', lmsg);
        }
      }
      console.error('AI query failed:', msg);
      throw error;
    }
  }

  async analyzeEvidence(
    evidenceId: string,
    content: string,
    evidenceType: string
  ): Promise<AIAnalysisResult> {
    try {
      const systemPrompt =
        'You are a legal AI assistant specialized in evidence analysis. Respond with JSON.';
      const prompt = `Analyze the following ${evidenceType} evidence and provide a concise summary, tags, entities, keywords, and recommendations.`;
      const response =
        (await this.ollama.generateCompletion(content, {
          systemPrompt: `${systemPrompt}\n${prompt}`,
          temperature: 0.3,
          maxTokens: 1000
        })) ?? '';

      let analysis: AIAnalysisResult;
      try {
        analysis = JSON.parse(response) as AIAnalysisResult;
      } catch {
        analysis = this.parseAnalysisResponse(response);
      }

      if (analysis.tags?.length) {
        await this.generateAutoTags(evidenceId, 'evidence', analysis.tags, analysis.confidence);
      }

      await this.storeDocumentChunk(evidenceId, 'evidence', content, analysis);
      return analysis;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Evidence analysis failed:', msg);
      throw error;
    }
  }

  private async findSimilarDocuments(
    queryEmbedding: number[],
    limit = 10,
    threshold = 0.7
  ): Promise<VectorSearchResult[]> {
    if (!queryEmbedding.length) return [];
    const db = await getDbClient();
    if (!db) return [];

    try {
      const rows = normalizeRows<{
        id: string;, document_id: string;
        content: string;, metadata: Record<string, unknown> | null;
        embedding: string | number[] | null;
      }>(
        await db.execute(
          sql`SELECT id, document_id, content, metadata, embedding FROM document_chunks LIMIT ${limit}`
        )
      );

      const results: VectorSearchResult[] = [];
      for (const row of rows) {
        let storedEmbedding: number[] | null = null;
        if (Array.isArray(row.embedding)) {
          storedEmbedding = row.embedding;
        } else if (typeof row.embedding === 'string' && row.embedding.length > 0) {
          storedEmbedding = JSON.parse(row.embedding) as number[];
        }
        if (!storedEmbedding || storedEmbedding.length !== queryEmbedding.length) continue;
        const sim = this.computeCosineSimilarity(queryEmbedding, storedEmbedding);
        if (sim >= threshold) {
          results.push({
            content: row.content,
            similarity: sim,
            metadata: row.metadata ?? {},
            documentId: row.document_id
          });
        }
      }

      return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Vector search failed:', msg);
      return [];
    }
  }

  private async findSimilarQueries(
    queryEmbedding: number[],
    userId?: string,
    limit = 5
  ): Promise<Array<{, query: string; response: string;, similarity: number }>> {
    const db = await getDbClient();
    if (!db) return [];

    try {
      const rows = normalizeRows<{ query: string;, response: string; similarity: number }>(
        await db.execute(
          userId
            ? sql`SELECT query, response, 0.0 as similarity FROM user_ai_queries WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`
            : sql`SELECT query, response, 0.0 as similarity FROM user_ai_queries ORDER BY created_at DESC LIMIT ${limit}`
        )
      );

      return rows.map((row) => ({
        query: row.query,
        response: row.response,
        similarity: row.similarity
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Similar query fetch failed:', msg);
      return [];
    }
  }

  async getOrCreateEmbedding(text: string): Promise<number[]> {
    const textHash = crypto.createHash('sha256').update(text).digest('hex');
    const db = await getDbClient();

    if (db) {
      try {
        const rows = normalizeRows<{ embedding: string | number[] | null }>(
          await db.execute(
            sql`SELECT embedding FROM embedding_cache WHERE text_hash = ${textHash} LIMIT 1`
          )
        );
        const cached = rows[0];
        if (cached?.embedding) {
          if (Array.isArray(cached.embedding)) return cached.embedding;
          if (typeof cached.embedding === 'string') {
            return JSON.parse(cached.embedding) as number[];
          }
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn('Embedding cache read failed:', msg);
      }
    }

    const embedding = (await this.ollama.generateEmbedding(text)) ?? [];
    if (db && embedding.length) {
      try {
        await db.execute(
          sql`INSERT INTO embedding_cache (id, text_hash, embedding, model, created_at)
          VALUES (${generateIdFromEntropySize(10)}, ${textHash}, ${JSON.stringify(embedding)}, 'embeddinggemma:latest', ${new Date().toISOString()})
          ON CONFLICT (text_hash) DO UPDATE SET embedding = EXCLUDED.embedding, model = EXCLUDED.model, created_at = EXCLUDED.created_at`
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn('Embedding cache write failed:', msg);
      }
    }

    return embedding;
  }

  private async logQuery(data: QueryLogInput): Promise<string> {
    const db = await getDbClient();
    const id = generateIdFromEntropySize(10);
    if (!db) return id;

    try {
      await db.execute(
        sql`INSERT INTO user_ai_queries
          (id, user_id, case_id, query, response, model, confidence, processing_time, context_used, embedding, is_successful, error_message, created_at)
          VALUES (
            ${id},
            ${data.userId ?? null},
            ${data.caseId ?? null},
            ${data.query},
            ${data.response},
            ${data.model},
            ${String(data.confidence)},
            ${data.processingTime},
            ${JSON.stringify(data.contextUsed)},
            ${data.embedding ? JSON.stringify(data.embedding) : null},
            ${data.isSuccessful !== false},
            ${data.errorMessage ?? null},
            ${new Date().toISOString()}
          )
        `
      );
      return id;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Query log failed:', msg);
      return id;
    }
  }

  private async generateAutoTags(
    entityId: string,
    entityType: string,
    tags: string[],
    confidence: number
  ): Promise<void> {
    const db = await getDbClient();
    if (!db || tags.length === 0) return;

    try {
      for (const tag of tags) {
        await db.execute(
          sql`INSERT INTO auto_tags (id, entity_id, entity_type, tag, confidence, source, model, created_at)
          VALUES (
            ${generateIdFromEntropySize(10)},
            ${entityId},
            ${entityType},
            ${tag},
            ${String(confidence)},
            'ai_analysis',
            'gemma3-legal:latest',
            ${new Date().toISOString()}
          )
          `
        );
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Auto-tag insert failed:', msg);
    }
  }

  private async storeDocumentChunk(
    documentId: string,
    documentType: string,
    content: string,
    analysis: AIAnalysisResult
  ): Promise<void> {
    const db = await getDbClient();
    if (!db) return;

    try {
      const embedding = (await this.ollama.generateEmbedding(content)) ?? [];
      const embeddingString = JSON.stringify(embedding);
      await db.execute(
        sql`INSERT INTO document_chunks (id, document_id, document_type, chunk_index, content, embedding, metadata, created_at)
        VALUES (
          ${generateIdFromEntropySize(10)},
          ${documentId},
          ${documentType},
          ${0},
          ${content.slice(0, 2000)},
          ${embeddingString},
          ${JSON.stringify({ analysis, contentLength: content.length, generatedAt: new Date().toISOString() })},
          ${new Date().toISOString()}
        )
        `
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Document chunk insert failed:', msg);
    }
  }

  private calculateConfidence(response: string, contextCount: number): number {
    let confidence = 0.7;
    if (response.length > 500) confidence += 0.1;
    if (response.includes('evidence') || response.includes('statute')) confidence += 0.05;
    if (response.includes('recommend') || response.includes('suggest')) confidence += 0.05;
    confidence += Math.min(contextCount * 0.02, 0.15);
    return Math.min(confidence, 0.99);
  }

  private parseAnalysisResponse(response: string): AIAnalysisResult {
    return {
      summary: response.split('\n')[0] ?? 'Analysis completed',
      tags: this.extractTags(response),
      confidence: 0.75,
      entities: this.extractEntities(response),
      keywords: this.extractKeywords(response),
      recommendations: this.extractRecommendations(response)
    };
  }

  private extractTags(text: string): string[] {
    const tagPatterns = /(?:tag|category|classification)s?:?\s*([^\n]+)/gi;
    const matches = text.match(tagPatterns);
    return matches
      ? matches
          .flatMap((m) =>
            m
              .split(/[, )/]/)
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean)
          )
      : [];
  }

  private extractEntities(text: string): string[] {
    const entityPattern = /(?:entity|entities|person|organization)s?:?\s*([^\n]+)/gi;
    const matches = text.match(entityPattern);
    return matches
      ? matches
          .flatMap((m) =>
            m
              .split(/[, )/]/)
              .map((t) => t.trim())
              .filter(Boolean)
          )
      : [];
  }

  private extractKeywords(text: string): string[] {
    const keywordPattern = /(?:keyword|key\s+word)s?:?\s*([^\n]+)/gi;
    const matches = text.match(keywordPattern);
    return matches
      ? matches
          .flatMap((m) =>
            m
              .split(/[, )/]/)
              .map((t) => t.trim())
              .filter(Boolean)
          )
      : [];
  }

  private extractRecommendations(text: string): string[] {
    const recPattern = /(?:recommend|suggestion|advice)s?:?\s*([^\n]+)/gi;
    const matches = text.match(recPattern);
    return matches ? matches.map((m) => m.trim()) : [];
  }

  private computeCosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      const va = a[i] ?? 0;
      const vb = b[i] ?? 0;
      dot += va * vb;
      na += va * va;
      nb += vb * vb;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    if (denom === 0) return 0;
    return dot / denom;
  }
}

export const aiService = new AIService();
export default aiService;






