/**
 * HyperRAG Packet Pipeline
 * Map/Reduce summarization: chunking → extraction → normalization → summary → materialization
 * CPU-intensive: chunking, feature extraction, normalization
 * GPU-intensive: embedding, embedding search
 * I/O-intensive: Postgres writes, Qdrant upserts
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import type { HyperRAGPacketState, HyperRAGPacketPipeline } from './hyperrag-rpc-client';

interface ChunkResult {
  content: string;
  hash: string;
  tokenCount: number;
  startOffset: number;
  endOffset: number;
}

/**
 * HyperRAG Map/Reduce Pipeline
 * Splits documents → summarizes chunks → creates parent summary → materializes to Postgres
 */
export class HyperRAGPacketPipelineImpl implements HyperRAGPacketPipeline {
  private db: PostgresJsDatabase;
  private chunkSize: number = 2000;
  private tokenPerChar: number = 0.25; // Approximate for LLM tokens

  constructor(db: PostgresJsDatabase) {
    this.db = db;
  }

  /**
   * Feature Extraction Phase
   * Calls Python sidecar or regex-based extraction
   */
  async extractFeatures(sourcePath: string, text: string): Promise<string[]> {
    try {
      // TODO: Call Python sidecar at services/langextract/server.py
      // POST /extract with { source_path, text }
      // Returns: { features: ["database", "auth", "caching"] }

      const response = await fetch('http://127.0.0.1:9999/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath, text }),
      });

      if (!response.ok) {
        throw new Error(`Extraction failed: ${response.status}`);
      }

      const data = (await response.json()) as { features: string[] };
      return data.features;
    } catch (err) {
      // Fallback: regex extraction
      return this.extractFeaturesFallback(text);
    }
  }

  /**
   * Feature Normalization Phase
   * Maps extracted candidates to canonical feature_id values
   */
  async normalizeFeatureIds(candidates: string[]): Promise<string[]> {
    if (candidates.length === 0) return [];

    // TODO: Query Postgres for canonical feature_id mappings
    // SELECT feature_id FROM canonical_features WHERE label IN (...)

    const uniqueCandidates = [...new Set(candidates)];

    // For now, use candidates directly (assuming they're already normalized)
    // In production: look up in canonical features table
    return uniqueCandidates;
  }

  /**
   * Chunking Phase (Map)
   * Split document into overlapping chunks
   */
  private chunkDocument(text: string): ChunkResult[] {
    const chunks: ChunkResult[] = [];
    const overlap = 500;
    let offset = 0;

    while (offset < text.length) {
      const end = Math.min(offset + this.chunkSize, text.length);
      const chunk = text.slice(offset, end);

      chunks.push({
        content: chunk,
        hash: this.hashChunk(chunk),
        tokenCount: Math.ceil(chunk.length * this.tokenPerChar),
        startOffset: offset,
        endOffset: end,
      });

      offset = end - overlap;
      if (offset + this.chunkSize >= text.length) {
        offset = text.length; // Skip to end to avoid tiny final chunk
      }
    }

    return chunks;
  }

  /**
   * Summarization Phase (Reduce)
   * Summarize each chunk with Gemma4, then summarize summaries
   */
  async summarizeChunks(chunks: string[], featureIds: string[]): Promise<Map<string, string>> {
    const summaries = new Map<string, string>();

    // TODO: For each chunk, call Gemma4 at llama-server :8090
    // POST /v1/chat/completions with bounded prompt

    for (const chunk of chunks) {
      const summary = await this.summarizeChunk(chunk);
      summaries.set(chunk.slice(0, 100), summary); // Use first 100 chars as key
    }

    return summaries;
  }

  /**
   * Materialize Phase
   * Write packet state to Postgres + create parent packet
   */
  async materializePackets(packets: HyperRAGPacketState[]): Promise<void> {
    // TODO: Insert into packet_topology_projection (or task_semantic_packets)
    // INSERT INTO packet_topology_projection (
    //   packet_key, feature_id, source_ref, domain, summary,
    //   som_row, som_col, manifold_x, manifold_y, manifold_z, manifold_w,
    //   metadata, created_at, updated_at
    // ) VALUES (...)

    for (const packet of packets) {
      // Prepare insert statement
      const metadata = {
        chunkCount: packet.chunkCount,
        tokenEstimate: packet.tokenEstimate,
        embeddingModel: packet.embeddingModel,
        source: 'hyperrag-pipeline',
        traceId: packet.traceId,
      };

      // TODO: Execute insert via Drizzle
      // await this.db.insert(packetTopologyProjection).values({...})
    }
  }

  /**
   * Index Phase
   * Update Qdrant, TurboVec, Redis with packet vectors
   */
  async indexPackets(packets: HyperRAGPacketState[]): Promise<void> {
    // TODO: For each packet:
    // 1. Embed summary with EmbeddingGemma
    // 2. Upsert to Qdrant codebase_chunks_768 with payload
    // 3. Upsert to TurboVec multi-file index
    // 4. Cache in Redis ACE hot keys
  }

  // ─────────────────────────────────────────────────────────────

  private async summarizeChunk(chunk: string): Promise<string> {
    try {
      const response = await fetch('http://127.0.0.1:8090/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4-rotorquant:latest',
          messages: [
            {
              role: 'system',
              content: 'Summarize this code chunk in 1-2 sentences. Focus on what it does.',
            },
            { role: 'user', content: chunk.slice(0, 2000) }, // Bounded to 2K chars
          ],
          max_tokens: 100,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemma4 failed: ${response.status}`);
      }

      const data = (await response.json()) as any;
      return data.choices?.[0]?.message?.content || '';
    } catch (err) {
      return '(summarization failed)';
    }
  }

  private extractFeaturesFallback(text: string): string[] {
    const features: Set<string> = new Set();

    // Regex patterns for common feature extraction
    const patterns = [
      /export\s+(?:function|class|interface|type)\s+(\w+)/g,
      /(?:import|export)\s+type\s+(\w+)/g,
      /const\s+(\w+)\s*=\s*(?:async\s+)?function/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        features.add(match[1].toLowerCase());
      }
    }

    return Array.from(features);
  }

  private hashChunk(chunk: string): string {
    // Simple hash for chunk identification
    let hash = 0;
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Factory function
 */
export function createHyperRAGPacketPipeline(db: PostgresJsDatabase): HyperRAGPacketPipeline {
  return new HyperRAGPacketPipelineImpl(db);
}