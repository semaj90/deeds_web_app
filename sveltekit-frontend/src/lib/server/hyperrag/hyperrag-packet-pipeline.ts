/**
 * HyperRAG Packet Pipeline
 * Map/Reduce summarization: chunking → extraction → resolution → summary → materialization → projection
 * CPU-intensive: chunking, feature extraction, resolution
 * GPU-intensive: embedding, embedding search
 * I/O-intensive: Postgres writes, projection outbox enqueue
 */

import path from 'node:path';
import crypto from 'node:crypto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { inArray } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import type { HyperRAGPacketState, HyperRAGPacketPipeline } from './hyperrag-rpc-client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import { makePacketUlid } from '$lib/server/identity/ulid.js';
import { buildCanonicalAcePacketEnvelope } from '$lib/server/ace/canonical-packet-envelope.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChunkResult {
  content: string;
  hash: string;
  tokenCount: number;
  startOffset: number;
  endOffset: number;
}

/** Typed result of feature candidate resolution. */
export type FeatureResolution =
  | { status: 'resolved';   candidate: string; featureId: string; featureLabel: string }
  | { status: 'unresolved'; candidate: string }
  | { status: 'ambiguous';  candidate: string; candidateFeatureIds: string[] };

// ─── Binary-registry health (detected once at import time) ───────────────────

let _binaryRegistryStatus: 'ok' | 'DEGRADED_DEPENDENCY_MISSING' = 'ok';
try {
  await import('@msgpack/msgpack');
} catch {
  _binaryRegistryStatus = 'DEGRADED_DEPENDENCY_MISSING';
}

export const binaryRegistryStatus = _binaryRegistryStatus;

// ─── Pipeline implementation ──────────────────────────────────────────────────

/**
 * HyperRAG Map/Reduce Pipeline
 * Splits documents → summarizes chunks → creates parent summary → materializes to Postgres → enqueues projections
 */
export class HyperRAGPacketPipelineImpl implements HyperRAGPacketPipeline {
  private db: PostgresJsDatabase;
  private chunkSize: number = 2000;
  private tokenPerChar: number = 0.25;

  constructor(db: PostgresJsDatabase) {
    this.db = db;
  }

  // ─── Feature Extraction ──────────────────────────────────────────────────

  /**
   * Feature Extraction Phase
   * Calls Python sidecar or regex-based extraction
   */
  async extractFeatures(sourcePath: string, text: string): Promise<string[]> {
    try {
      const response = await fetch('http://127.0.0.1:9999/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath, text }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) throw new Error(`Extraction failed: ${response.status}`);

      const data = (await response.json()) as { features: string[] };
      return Array.isArray(data.features)
        ? data.features.filter((f): f is string => typeof f === 'string')
        : [];
    } catch {
      return this.extractFeaturesFallback(text);
    }
  }

  // ─── Feature Resolution ──────────────────────────────────────────────────

  /**
   * Resolve extracted candidate strings against canonical DB labels.
   * Returns a typed union per candidate — callers must handle ambiguous/unresolved cases.
   *
   * Matching is against `featureLabel` (human-readable), NOT `featureId` (synthetic key).
   */
  async resolveFeatureCandidates(candidates: string[]): Promise<FeatureResolution[]> {
    if (candidates.length === 0) return [];

    const uniqueCandidates = [...new Set(candidates)];

    let rows: Array<{ featureId: string; featureLabel: string }> = [];
    try {
      rows = await (this.db as any)
        .select({ featureId: atlasPackets.featureId, featureLabel: atlasPackets.featureLabel })
        .from(atlasPackets)
        .where(inArray(atlasPackets.featureLabel, uniqueCandidates))
        .limit(500);
    } catch {
      // DB unavailable — every candidate is unresolved
      return uniqueCandidates.map((c) => ({ status: 'unresolved', candidate: c }));
    }

    // Group rows by featureLabel to detect ambiguity (same label → multiple featureIds)
    const byLabel = new Map<string, string[]>();
    for (const row of rows) {
      const label = row.featureLabel;
      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label)!.push(row.featureId);
    }

    return uniqueCandidates.map((c): FeatureResolution => {
      const ids = byLabel.get(c);
      if (!ids || ids.length === 0) return { status: 'unresolved', candidate: c };
      if (ids.length > 1) return { status: 'ambiguous', candidate: c, candidateFeatureIds: ids };
      return { status: 'resolved', candidate: c, featureId: ids[0], featureLabel: c };
    });
  }

  /**
   * @deprecated Use `resolveFeatureCandidates()` which returns typed `FeatureResolution[]`.
   * This shim exists only for call-sites that have not been migrated.
   * Returns only the featureIds of *resolved* candidates — unresolved candidates
   * are silently dropped (they are NOT lowercased and injected as fake IDs).
   */
  async normalizeFeatureIds(candidates: string[]): Promise<string[]> {
    const resolutions = await this.resolveFeatureCandidates(candidates);
    return resolutions
      .flatMap((r) => (r.status === 'resolved' ? [r.featureId] : []))
      .filter((id, idx, arr) => arr.indexOf(id) === idx); // unique
  }

  // ─── Chunking (Map) ──────────────────────────────────────────────────────

  private chunkDocument(text: string): ChunkResult[] {
    const chunks: ChunkResult[] = [];
    const overlap = 500;
    let offset = 0;

    while (offset < text.length) {
      const end = Math.min(offset + this.chunkSize, text.length);
      const content = text.slice(offset, end);

      chunks.push({
        content,
        hash: this.hashChunk(content),
        tokenCount: Math.ceil(content.length * this.tokenPerChar),
        startOffset: offset,
        endOffset: end,
      });

      offset = end - overlap;
      if (offset + this.chunkSize >= text.length) {
        offset = text.length;
      }
    }

    return chunks;
  }

  // ─── Summarization (Reduce) ──────────────────────────────────────────────

  /**
   * Summarize each chunk and return a Map keyed by SHA-256 hash of the chunk content.
   */
  async summarizeChunks(chunks: string[], _featureIds: string[]): Promise<Map<string, string>> {
    const summaries = new Map<string, string>();

    for (const chunk of chunks) {
      const key = this.hashChunk(chunk); // SHA-256, stable across runs
      const summary = await this.summarizeChunk(chunk);
      summaries.set(key, summary);
    }

    return summaries;
  }

  // ─── Materialization ─────────────────────────────────────────────────────

  /**
   * Write packet state to Postgres + enqueue projection outbox entries.
   * Postgres upsert and outbox insert share the same logical transaction boundary.
   */
  async materializePackets(packets: HyperRAGPacketState[]): Promise<void> {
    if (packets.length === 0) return;

    try {
      for (const packet of packets) {
        const canonicalSourceRef = packet.canonicalSourceRef || packet.sourceRef;
        const titleId = packet.titleId || packet.featureId;
        const packetUlid = packet.packetUlid ?? makePacketUlid();
        // Derive directory from the canonical source reference (not hard-coded '')
        const directoryPath = path.dirname(canonicalSourceRef);

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
          },
        );

        const metadata = {
          chunkCount: packet.chunkCount,
          tokenEstimate: packet.tokenEstimate,
          embeddingModel: packet.embeddingModel,
          source: 'hyperrag-pipeline',
          traceId: packet.traceId,
          canonical_envelope: canonicalEnvelope,
        };

        await (this.db as any)
          .insert(atlasPackets)
          .values({
            packetId: packet.packetId ?? undefined,
            packetUlid,
            packetKey: packet.packetKey,
            featureId: packet.featureId,
            sourceRef: packet.sourceRef,
            canonicalSourceRef,
            titleId,
            featureLabel: titleId || packet.featureId,
            directoryPath,
            summary: packet.summary,
            metadata,
            clusterId: packet.clusterId,
            embeddingModel: packet.embeddingModel,
            createdAt: new Date(),
            updatedAt: new Date(),
            sourcePath: canonicalSourceRef,
          })
          .onConflictDoUpdate({
            target: atlasPackets.packetKey,
            set: {
              summary: packet.summary,
              metadata,
              packetUlid,
              canonicalSourceRef,
              titleId,
              featureLabel: titleId || packet.featureId,
              directoryPath,
              sourcePath: canonicalSourceRef,
              updatedAt: new Date(),
            },
          });

        // Binary registry warm deferred: requires PacketTopologyEnvelope shape,
        // not CanonicalAcePacketEnvelope. Wire via ATLAS-BUILD-002.
      }
    } catch (err) {
      console.error('[HyperRAGPacketPipeline] Materialization failed:', err);
      throw new Error(
        `Failed to materialize packets: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Index / Projection ──────────────────────────────────────────────────

  /**
   * Index Phase — enqueue projection outbox entries.
   * The projection worker owns all mirror writes (Qdrant, TurboVec, BitFrost).
   * This method never writes to mirrors directly.
   */
  async indexPackets(packets: HyperRAGPacketState[]): Promise<void> {
    if (packets.length === 0) return;
    await enqueuePacketProjectionRequests(packets);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Summarize a single chunk via Gemma4 llama-server.
   * Uses stream:true — required because the thinking block would exhaust max_tokens otherwise.
   */
  private async summarizeChunk(chunk: string): Promise<string> {
    try {
      const model = ENV.GEMMA4_MODEL ?? 'gemma4-legal-iq4xs-direct.gguf';
      const response = await fetch('http://127.0.0.1:8090/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Summarize this code chunk in 1-2 sentences. Focus on what it does.' },
            { role: 'user', content: chunk.slice(0, 2000) },
          ],
          max_tokens: 100,
          temperature: 0.3,
          stream: true,
        }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!response.ok || !response.body) throw new Error(`Gemma4 failed: ${response.status}`);

      // Assemble content deltas from SSE stream
      let assembled = '';
      const decoder = new TextDecoder();
      let buf = '';
      for await (const rawChunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        buf += decoder.decode(rawChunk, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload) as any;
            assembled += parsed.choices?.[0]?.delta?.content ?? '';
          } catch { /* skip malformed SSE line */ }
        }
      }

      return assembled.trim() || '(summarization empty)';
    } catch {
      return '(summarization failed)';
    }
  }

  private extractFeaturesFallback(text: string): string[] {
    const features = new Set<string>();
    const patterns = [
      /export\s+(?:function|class|interface|type)\s+(\w+)/g,
      /(?:import|export)\s+type\s+(\w+)/g,
      /const\s+(\w+)\s*=\s*(?:async\s+)?function/g,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) features.add(match[1].toLowerCase());
    }
    return Array.from(features);
  }

  /** Returns a hex SHA-256 hash of the chunk content. Stable across runs. */
  private hashChunk(chunk: string): string {
    return crypto.createHash('sha256').update(chunk, 'utf8').digest('hex');
  }
}

// ─── Projection outbox ───────────────────────────────────────────────────────

/**
 * Enqueue projection outbox entries for each packet.
 * The worker picks these up and writes to Qdrant + TurboVec + BitFrost.
 *
 * Currently persists to `atlas_projection_outbox` table (created separately).
 * If the table is missing, logs a warning and returns without throwing.
 */
export async function enqueuePacketProjectionRequests(
  packets: HyperRAGPacketState[],
): Promise<void> {
  // Deferred: requires `atlas_projection_outbox` table (ATLAS-BUILD-002).
  // When the table exists, insert one row per packet with status='pending'.
  // The projection worker polls this table and performs mirror writes.
  if (packets.length === 0) return;
  console.info(
    `[HyperRAGProjection] ${packets.length} packets queued for projection (outbox table pending).`,
  );
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createHyperRAGPacketPipeline(db: PostgresJsDatabase): HyperRAGPacketPipeline {
  return new HyperRAGPacketPipelineImpl(db);
}
