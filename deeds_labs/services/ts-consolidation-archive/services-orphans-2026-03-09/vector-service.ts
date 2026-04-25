/**
 * Vector Service - Client for vector operations
 * Wraps Ollama embeddings + Qdrant/Redis vector search
 */

type Metadata = Record<string, unknown>;

export interface EmbeddingOptions {
  contentType?: string;
  metadata?: Metadata;
  model?: string;
  userId?: string;
  caseId?: string;
  conversationId?: string;
}

export type AnalysisResult =
  | { analysis: unknown; type: string; timestamp: string; error?: undefined }
  | { analysis: string; error: string; type?: undefined; timestamp?: undefined };

const OLLAMA_URL = process.env?.OLLAMA_URL ?? 'http://localhost:11434';
const EMBEDDING_MODEL = 'embeddinggemma';

export class VectorService {
  /**
   * Generate embedding using Ollama
   */
  static async generateEmbedding(
    content: string,
    options: EmbeddingOptions = {}
  ): Promise<number[]> {
    try {
      const model = options.model || EMBEDDING_MODEL;
      const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: content }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      return Array.isArray(data.embedding) ? data.embedding : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error generating embedding:', message);
      throw new Error(message);
    }
  }

  /**
   * Semantic search via API
   */
  static async semanticSearch(
    query: string,
    options: { limit?: number; threshold?: number; type?: string } = {}
  ): Promise<Array<{ id: string; score: number; content?: string; metadata?: Metadata }>> {
    try {
      const response = await fetch('/api/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, ...options }),
      });

      if (!response.ok) return [];
      const data = await response.json();
      return data.results ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Search documents (alias for semanticSearch)
   */
  static async search(
    query: string,
    options: { limit?: number; threshold?: number; type?: string } = {}
  ): Promise<Array<{ id: string; score: number; content?: string; metadata?: Metadata }>> {
    return this.semanticSearch(query, options);
  }

  /**
   * Analyze document using Ollama
   */
  static async analyzeDocument(
    text: string,
    analysisType: string
  ): Promise<AnalysisResult> {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma3-legal:latest',
          prompt: `Analyze this document for ${analysisType}:\n\n${text}\n\nProvide a structured analysis:`,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama generate API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        analysis: data.response ?? data,
        type: analysisType,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error analyzing document:', message);
      return { analysis: 'Analysis failed', error: message };
    }
  }

  /**
   * Health check
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default VectorService;