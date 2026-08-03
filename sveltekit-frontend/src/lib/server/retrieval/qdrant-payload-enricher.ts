/**
 * Qdrant Payload Enricher
 *
 * Ingests feature_statistics, noun_terms, and analysis results into Qdrant payloads.
 * Creates a unified searchable document with all metadata needed for RRF ranking.
 *
 * Payload structure (per point in codebase_chunks_768):
 * - Feature identity: feature_id, source_ref, directory_path, symbol, kind
 * - Statistics: pagerank, hits_authority, hits_hub, community, som_cluster, som_cell_x, som_cell_y
 * - Text analysis: noun_terms, keywords, entity_tags, error_patterns
 * - Topology: cluster_degree, in_degree, out_degree, betweenness, freshness_days
 * - Ranking signals: semantic_similarity (from embedding), keyword_match_score, topology_weight
 */

import { codebaseChunkIndex } from '../db/schema-postgres.js';
import { inArray, sql } from 'drizzle-orm';

async function getDb() {
  const mod = await import('../db/client.js');
  return mod.db;
}

async function getQdrant() {
  const mod = await import('../vector/qdrant-manager.js');
  return mod.qdrant;
}

export interface EnrichedPayload {
  // Feature identity
  packet_key: string;
  feature_id: string;
  source_ref: string;
  directory_path: string;
  symbol: string;
  kind: string;
  tree_node_id: string | null;
  content_hash: string | null;
  workspace_revision: string | null;
  feature_label: string | null;

  // Statistics (from feature_statistics)
  pagerank: number;
  hits_authority: number;
  hits_hub: number;
  community: number;
  som_cluster: number;
  som_cell_x: number;
  som_cell_y: number;
  cluster_degree: number;
  in_degree: number;
  out_degree: number;
  betweenness: number;
  freshness_days: number;

  // Text analysis
  noun_terms: string[];
  keywords: string[];
  entity_tags: string[];
  error_patterns: string[];

  // Semantic tags for filtering
  semantic_tags: string[];

  // Chunk metadata
  chunk_summary?: string;
  chunk_start_line: number;
  chunk_end_line: number;
  language: string;

  // Ranking signals
  semantic_similarity?: number;
  keyword_match_score?: number;
  topology_weight?: number;

  // Audit
  enriched_at: string;
  enriched_version: string;
}

export class QdrantPayloadEnricher {
  private qdrantCollection = 'codebase_chunks_768';
  private batchSize = 100;

  async enrich(chunkIds: number[] = [], dryRun = false): Promise<{ success: number; failed: number; duration_ms: number }> {
    const startTime = Date.now();
    let success = 0;
    let failed = 0;

    try {
      // Fetch chunks to enrich
      let chunks;
      const db = await getDb();
      if (chunkIds.length > 0) {
        chunks = await db
          .select()
          .from(codebaseChunkIndex)
          .where(inArray(codebaseChunkIndex.id as any, chunkIds as any));
      } else {
        // Enrich all chunks
        chunks = await db.select().from(codebaseChunkIndex);
      }

      console.log(`Enriching ${chunks.length} chunks...`);

      // Process in batches
      for (let i = 0; i < chunks.length; i += this.batchSize) {
        const batch = chunks.slice(i, i + this.batchSize);
        const payloads: Array<{ id: string | number; payload: EnrichedPayload }> = [];

        for (const chunk of batch) {
          try {
            const payload = await this.buildPayload(chunk);
            payloads.push({
              id: chunk.qdrantId ?? chunk.qdrant_id ?? chunk.id,
              payload: payload
            });
            success++;
          } catch (err) {
            console.error(`Failed to build payload for chunk ${chunk.id}:`, err);
            failed++;
          }
        }

        // Upload to Qdrant
        if (!dryRun && payloads.length > 0) {
          try {
            await this.uploadPayloads(payloads);
            console.log(`Uploaded ${payloads.length} payloads to Qdrant`);
          } catch (err) {
            console.error('Failed to upload payloads to Qdrant:', err);
            failed += payloads.length;
            success -= payloads.length;
          }
        }
      }
    } catch (err) {
      console.error('Payload enrichment failed:', err);
    }

    return {
      success,
      failed,
      duration_ms: Date.now() - startTime
    };
  }

  private async buildPayload(chunk: any): Promise<EnrichedPayload> {
    const sourceRef = String(
      chunk.sourceRef ??
      chunk.relativePath ??
      chunk.source_ref ??
      chunk.relative_path ??
      ''
    ).trim();

    const packetRows = sourceRef
      ? await (await getDb()).execute(sql`
      SELECT packet_key, tree_node_id, feature_label, sha256, metadata
      FROM atlas_packets
      WHERE source_ref = ${sourceRef}
         OR canonical_source_ref = ${sourceRef}
         OR source_path = ${sourceRef}
         OR file_path = ${sourceRef}
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1
    `)
      : { rows: [] as any[] };
    const packet = packetRows.rows[0] as any | undefined;
    const packetMetadata = (packet?.metadata ?? {}) as Record<string, unknown>;
    const workspaceRevision =
      typeof packetMetadata.workspace_revision === 'string'
        ? packetMetadata.workspace_revision
        : typeof packetMetadata.workspaceRevision === 'string'
          ? packetMetadata.workspaceRevision
          : typeof packetMetadata.revision === 'string'
            ? packetMetadata.revision
            : null;

    // Parse noun_terms from JSONB
    const nounTerms = chunk.noun_terms
      ? Object.keys(chunk.noun_terms as Record<string, any>)
      : Array.isArray(chunk.semanticTags)
        ? chunk.semanticTags.map((tag: unknown) => String(tag))
        : [];

    // Extract semantic tags from analysis
    const semanticTags = this.extractSemanticTags(chunk);

    // Build payload
    const payload: EnrichedPayload = {
      packet_key: packet?.packet_key ? String(packet.packet_key) : String(chunk.packet_key ?? chunk.id ?? chunk.qdrant_id ?? chunk.source_ref),
      feature_id: String(chunk.featureId ?? chunk.feature_id ?? sourceRef ?? chunk.id ?? chunk.qdrantId ?? 'unknown'),
      source_ref: sourceRef || String(chunk.sourceRef ?? chunk.source_ref ?? chunk.relativePath ?? chunk.id ?? ''),
      directory_path: chunk.directoryPath || chunk.directory_path || this.extractDirectoryPath(sourceRef || String(chunk.sourceRef ?? chunk.source_ref ?? chunk.relativePath ?? chunk.id ?? '')),
      symbol: chunk.symbol || chunk.functionSymbol || '',
      kind: chunk.kind || chunk.sourceKind || chunk.source_kind || '',
      tree_node_id: packet?.tree_node_id ? String(packet.tree_node_id) : (chunk.tree_node_id ?? null),
      content_hash: packet?.sha256 ? String(packet.sha256) : (chunk.contentHash ?? chunk.content_hash ?? null),
      workspace_revision: workspaceRevision,
      feature_label: packet?.feature_label ?? chunk.feature_label ?? null,

      pagerank: chunk.pageRankScore || chunk.page_rank_score || 0,
      hits_authority: chunk.hitsAuthority || chunk.hits_authority || 0,
      hits_hub: chunk.hitsHub || chunk.hits_hub || 0,
      community: chunk.communityId || chunk.community_id || 0,
      som_cluster: chunk.somCluster || chunk.som_cluster || 0,
      som_cell_x: chunk.somCellX || chunk.som_cell_x || 0,
      som_cell_y: chunk.somCellY || chunk.som_cell_y || 0,
      cluster_degree: chunk.clusterDegree || chunk.cluster_degree || 0,
      in_degree: chunk.inDegree || chunk.in_degree || 0,
      out_degree: chunk.outDegree || chunk.out_degree || 0,
      betweenness: chunk.betweenness || 0,
      freshness_days: chunk.freshnessDays || chunk.freshness_days || 0,

      noun_terms: nounTerms,
      keywords: this.extractKeywords(chunk),
      entity_tags: this.extractEntityTags(chunk),
      error_patterns: this.extractErrorPatterns(chunk),
      semantic_tags: semanticTags,

      chunk_summary: chunk.signature || chunk.summary || '',
      chunk_start_line: chunk.lineStart || chunk.start_line || 0,
      chunk_end_line: chunk.lineEnd || chunk.end_line || 0,
      language: this.detectLanguage(sourceRef || String(chunk.sourceRef ?? chunk.source_ref ?? chunk.relativePath ?? '')),

      enriched_at: new Date().toISOString(),
      enriched_version: '1.0'
    };

    return payload;
  }

  private extractDirectoryPath(sourceRef: string): string {
    const parts = sourceRef.split('/');
    return parts.slice(0, -1).join('/') || 'root';
  }

  private detectLanguage(sourceRef: string): string {
    if (sourceRef.endsWith('.ts')) return 'typescript';
    if (sourceRef.endsWith('.tsx')) return 'typescript-react';
    if (sourceRef.endsWith('.js')) return 'javascript';
    if (sourceRef.endsWith('.jsx')) return 'javascript-react';
    if (sourceRef.endsWith('.py')) return 'python';
    if (sourceRef.endsWith('.go')) return 'go';
    if (sourceRef.endsWith('.sql')) return 'sql';
    if (sourceRef.endsWith('.svelte')) return 'svelte';
    return 'unknown';
  }

  private extractKeywords(chunk: any): string[] {
    // Extract from noun_terms, summary, or content
    const keywords: Set<string> = new Set();

    if (chunk.nounTerms) {
      Object.keys(chunk.nounTerms).forEach(term => keywords.add(term));
    } else if (chunk.noun_terms) {
      Object.keys(chunk.noun_terms).forEach(term => keywords.add(term));
    }

    // Extract from summary (simple noun extraction)
    const summary = chunk.signature || chunk.summary || '';
    if (summary) {
      const words = String(summary).toLowerCase().split(/\W+/);
      words.filter((w: string) => w.length > 3).forEach((w: string) => keywords.add(w));
    }

    return Array.from(keywords).slice(0, 20); // Limit to 20 keywords
  }

  private extractEntityTags(chunk: any): string[] {
    // Extract from error_pattern, extracted_entities, or analysis results
    const tags: Set<string> = new Set();

    if (chunk.extracted_entities) {
      const entities = chunk.extracted_entities as Record<string, string[]>;
      Object.values(entities).forEach((values: string[]) => {
        values.forEach(v => tags.add(v));
      });
    }

    if (chunk.errorPattern) {
      tags.add(`error:${chunk.errorPattern}`);
    } else if (chunk.error_pattern) {
      tags.add(`error:${chunk.error_pattern}`);
    }

    return Array.from(tags);
  }

  private extractErrorPatterns(chunk: any): string[] {
    const patterns: Set<string> = new Set();

    if (chunk.error_pattern) {
      patterns.add(chunk.error_pattern);
    }

    // Could parse chunk.content for common error patterns
    // e.g., NullPointerException, TypeError, ReferenceError, etc.

    return Array.from(patterns);
  }

  private extractSemanticTags(chunk: any): string[] {
    const tags: Set<string> = new Set();

    // Add tags based on kind
    if (chunk.kind) {
      tags.add(`kind:${chunk.kind}`);
    } else if (chunk.sourceKind) {
      tags.add(`kind:${chunk.sourceKind}`);
    }

    // Add tags based on directory structure
    const dirParts = chunk.directory_path?.split('/') || [];
    dirParts.forEach(part => {
      if (part && part.length > 2) {
        tags.add(`dir:${part}`);
      }
    });

    // Add tags based on language
    const lang = this.detectLanguage(
      String(chunk.sourceRef ?? chunk.source_ref ?? chunk.relativePath ?? '')
    );
    tags.add(`lang:${lang}`);

    // Add clustering tags
    if (chunk.som_cluster !== undefined) {
      tags.add(`cluster:${chunk.som_cluster}`);
    }

    // Add community tags
    if (chunk.community !== undefined) {
      tags.add(`community:${chunk.community}`);
    }

    return Array.from(tags);
  }

  private async uploadPayloads(payloads: Array<{ id: string | number; payload: EnrichedPayload }>): Promise<void> {
    // Use Qdrant client to upsert points with enriched payloads
    // Implementation depends on qdrant-js client API
    // This is a stub — actual implementation uses the Qdrant HTTP API
    const qdrant = await getQdrant();

    for (const item of payloads) {
      await qdrant.upsert({
        collection: this.qdrantCollection,
        points: [
          {
            id: item.id as string | number,
            payload: item.payload
          }
        ]
      } as any);
    }
  }
}

/**
 * Convenience function to enrich all chunks
 */
export async function enrichQdrantPayloads(dryRun = false): Promise<void> {
  const enricher = new QdrantPayloadEnricher();
  const result = await enricher.enrich([], dryRun);

  console.log(`
Qdrant Payload Enrichment Complete
===================================
Success: ${result.success}
Failed: ${result.failed}
Duration: ${result.duration_ms}ms
  `);
}
