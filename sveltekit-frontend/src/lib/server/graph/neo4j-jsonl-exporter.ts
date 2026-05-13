/**
 * Neo4j JSONL Exporter
 * 
 * Generates JSONL files for Neo4j import (using apoc.import.json).
 * Exports Cluster, Chunk, TranscriptSegment, and Video nodes + relationships.
 */

import { db } from '$lib/server/db/client';
import { aceChunks, audioTranscripts, whisperSegments, qdrantCentroidClusters } from '$lib/server/db/schema';
import fs from 'fs/promises';
import { resolve } from 'path';

export interface ExportResult {
  filePath: string;
  nodeCount: number;
  relCount: number;
}

export async function exportGraphToJsonl(outputPath: string): Promise<ExportResult> {
  const nodes: any[] = [];
  const rels: any[] = [];

  // 1. Fetch Clusters (from qdrant_centroid_clusters)
  const clusters = await db.select().from(qdrantCentroidClusters);
  for (const c of clusters) {
    nodes.push({
      type: 'node',
      id: `cluster_${c.clusterKey}`,
      labels: ['Cluster', 'GPUCluster'],
      properties: {
        clusterKey: c.clusterKey,
        label: c.label,
        summary: c.summary,
        memberCount: c.memberCount,
        pageRank: c.pageRank
      }
    });
  }

  // 2. Fetch Chunks (from ace_chunks)
  const chunks = await db.select().from(aceChunks).limit(2000); // Limit for safety
  for (const c of chunks) {
    const nodeId = `chunk_${c.id}`;
    const chunkMeta = (c.metadata ?? {}) as { source?: string; stored_at?: string; url?: string; title?: string };
    nodes.push({
      type: 'node',
      id: nodeId,
      labels: ['Chunk', 'CodebaseChunk'],
      properties: {
        chunkId: c.id,
        filePath: chunkMeta.url ?? c.sourceDocumentId ?? c.caseId ?? null,
        content: c.content?.slice(0, 1000), // Avoid massive strings
        tokenCount: c.content.length,
        chunkIndex: c.chunkIndex,
        contentHash: c.contentHash,
        title: chunkMeta.title ?? null
      }
    });

    // Relationship to Cluster if known
    if (c.metadata && (c.metadata as any).clusterKey) {
      rels.push({
        type: 'relationship',
        label: 'HAS_MEMBER',
        start: { id: `cluster_${(c.metadata as any).clusterKey}`, labels: ['Cluster'] },
        end: { id: nodeId, labels: ['Chunk'] },
        properties: { weight: 1.0 }
      });
    }
  }

  // 3. Fetch Videos/Audio (from audio_transcripts)
  const transcripts = await db.select().from(audioTranscripts);
  for (const t of transcripts) {
    const videoId = `video_${t.evidenceId}`;
    nodes.push({
      type: 'node',
      id: videoId,
      labels: ['Video', 'Evidence'],
      properties: {
        evidenceId: t.evidenceId,
        duration: t.duration,
        language: t.language,
        fullText: t.fullText?.slice(0, 500)
      }
    });
  }

  // 4. Fetch TranscriptSegments (from whisper_segments)
  const segments = await db.select().from(whisperSegments).limit(5000);
  for (const s of segments) {
    const segmentId = `segment_${s.id}`;
    const videoId = `video_${s.evidenceId}`;
    
    nodes.push({
      type: 'node',
      id: segmentId,
      labels: ['TranscriptSegment', 'Segment'],
      properties: {
        segmentId: s.id,
        text: s.text,
        startMs: s.startMs,
        endMs: s.endMs,
        speaker: s.speaker
      }
    });

    // Relationship: Video -> HAS_SEGMENT -> Segment
    rels.push({
      type: 'relationship',
      label: 'HAS_SEGMENT',
      start: { id: videoId, labels: ['Video'] },
      end: { id: segmentId, labels: ['TranscriptSegment'] },
      properties: { index: s.segmentIndex }
    });
  }

  // Write to JSONL
  const lines = [...nodes, ...rels].map(obj => JSON.stringify(obj)).join('\n');
  await fs.mkdir(resolve(outputPath, '..'), { recursive: true });
  await fs.writeFile(outputPath, lines, 'utf8');

  return {
    filePath: outputPath,
    nodeCount: nodes.length,
    relCount: rels.length
  };
}
