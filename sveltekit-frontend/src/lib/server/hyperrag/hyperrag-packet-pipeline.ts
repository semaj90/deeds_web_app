/**
 * HyperRAG Packet Pipeline
 * Map/Reduce summarization: chunking → extraction → normalization → summary → materialization
 * CPU-intensive: chunking, feature extraction, normalization
 * GPU-intensive: embedding, embedding search
 * I/O-intensive: Postgres writes, Qdrant upserts
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import type { HyperRAGPacketState, HyperRAGPacketPipeline } from './hyperrag-rpc-client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import { makePacketUlid } from '$lib/server/identity/ulid.js';
import { buildCanonicalAcePacketEnvelope } from '$lib/server/ace/canonical-packet-envelope.js';
import { persistDagHitEnvelope } from '$lib/server/serialization/dag-hit-envelope-persist.js';

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
      // Call Python sidecar at services/langextract/server.py
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
      return Array.isArray(data.features)
        ? data.features.filter((feature): feature is string => typeof feature === 'string')
        : [];
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

    const uniqueCandidates = [...new Set(candidates)];

    try {
      // Query Postgres for canonical feature_id mappings
      // Look up feature_ids by matching extracted labels against known packets
      const results = await (this.db as any).select({
        featureId: atlasPackets.featureId,
      })
        .from(atlasPackets)
        .where(inArray(atlasPackets.featureLabel, uniqueCandidates))
        .limit(100);

      // Extract unique feature_ids from results
      const normalizedIds = new Set(results.map((r: any) => r.featureId));

      // Candidates not found in DB: convert to lowercase, use as-is for fallback
      const missingCandidates = uniqueCandidates.filter(c =>
        !results.some((r: any) => r.featureId === c)
      );

      return Array.from(new Set<string>([
        ...Array.from(normalizedIds).map((id) => String(id)),
        ...missingCandidates.map((c) => c.toLowerCase()),
      ]));
    } catch (err) {
      // Fallback: normalize to lowercase (assumes candidates are already feature labels)
      return uniqueCandidates.map(c => c.toLowerCase());
    }
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
    if (packets.length === 0) return;

    try {
      for (const packet of packets) {
        // Prepare insert statement
        const canonicalSourceRef = packet.canonicalSourceRef || packet.sourceRef;
        const titleId = packet.titleId || packet.featureId;
        const packetUlid = packet.packetUlid ?? makePacketUlid();
        const canonicalEnvelope = buildCanonicalAcePacketEnvelope(
          {
            packet_id: packet.packetId ?? null,
            packet_ulid: packetUlid,
            packet_key: packet.packetKey,
            title_id: titleId,
            source_ref: packet.sourceRef,
            canonical_source_ref: canonicalSourceRef,
            feature_id: packet.featureId,
            domain: packet.domain ?? null,
            summary: packet.summary,
          },
          {
            feature_id: packet.featureId,
            kind: 'packet',
            language: null,
            page_rank_score: 0,
          }
        );
        const metadata = {
          chunkCount: packet.chunkCount,
          tokenEstimate: packet.tokenEstimate,
          embeddingModel: packet.embeddingModel,
          source: 'hyperrag-pipeline',
          traceId: packet.traceId,
          canonical_envelope: canonicalEnvelope,
        };

        // Insert into atlas_packets table
        await (this.db as any).insert(atlasPackets).values({
          packetId: packet.packetId ?? undefined,
          packetUlid,
          packetKey: packet.packetKey,
          featureId: packet.featureId,
          sourceRef: packet.sourceRef,
          canonicalSourceRef: canonicalSourceRef,
          titleId: titleId,
          featureLabel: titleId || packet.featureId,
          directoryPath: '', // TODO: Extract from sourceRef
          summary: packet.summary,
          metadata,
          clusterId: packet.clusterId,
          embeddingModel: packet.embeddingModel,
          createdAt: new Date(),
          updatedAt: new Date(),
          sourcePath: canonicalSourceRef,
        }).onConflictDoUpdate({
          target: atlasPackets.packetKey,
          set: {
            summary: packet.summary,
            metadata,
            packetUlid,
            canonicalSourceRef: canonicalSourceRef,
            titleId: titleId,
            featureLabel: titleId || packet.featureId,
            sourcePath: canonicalSourceRef,
            updatedAt: new Date(),
          },
        });

        // Best-effort transient binary registry write for DAG-hit reuse.
        // This does not replace Postgres truth; it promotes the canonical
        // envelope into the binary handoff lane used by ACE / open-memory.
        await persistDagHitEnvelope(canonicalEnvelope, 'dag_hit').catch((err) => {
          console.warn(
            `[HyperRAGPacketPipeline] binary registry warm failed for ${packet.packetKey}:`,
            err instanceof Error ? err.message : String(err),
          );
        });
      }
    } catch (err) {
      console.error('Materialization failed:', err);
      throw new Error(`Failed to materialize packets: ${err instanceof Error ? err.message : String(err)}`);
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
    console.warn('indexPackets not yet implemented');
  }

  // ─────────────────────────────────────────────────────────────

  private async summarizeChunk(chunk: string): Promise<string> {
    try {
      const model = ENV.GEMMA4_MODEL ?? 'gemma4-legal-iq4xs-direct.gguf';
      const response = await fetch('http://127.0.0.1:8090/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
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
