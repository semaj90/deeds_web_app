/**
 * POST /api/knowledge/youtube — Ingest YouTube video transcripts into knowledge base
 *
 * Accepts a YouTube URL or video ID, extracts transcript via multi-strategy pipeline,
 * chunks the content, generates embeddings, and upserts to Qdrant knowledge_base.
 *
 * Request: { url: string, collection?: string, chunkSize?: number, dryRun?: boolean }
 * Response: { success: true, videoId, title, source, chunks, indexed } or degraded
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createHash } from 'crypto';
import { ENV } from '$lib/server/env.server.js';
import {
  fetchYouTubeTranscript,
  extractVideoId,
} from '$lib/server/retrieval/youtube-transcript.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const QDRANT_URL = ENV.QDRANT_URL;
const EMBEDDING_MODEL = 'embeddinggemma:latest';
const DEFAULT_COLLECTION = 'knowledge_base';
const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_CHUNK_OVERLAP = 150;

const requestSchema = z.object({
  url: z.string().min(1).max(500),
  collection: z.string().max(100).optional(),
  chunkSize: z.number().int().min(200).max(4000).optional(),
  overlap: z.number().int().min(0).max(500).optional(),
  dryRun: z.boolean().optional(),
});

function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    start += size - overlap;
  }
  return chunks;
}

function buildPointId(url: string, chunkIndex: number): string {
  const hex = createHash('sha1').update(`${url}#${chunkIndex}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text.slice(0, 8_000) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.embedding) ? data.embedding : null;
  } catch {
    return null;
  }
}

async function upsertPoint(
  collection: string,
  pointId: string,
  vector: number[],
  payload: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: [{ id: pointId, vector, payload }] }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { success: false, error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { url, collection = DEFAULT_COLLECTION, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP, dryRun = false } = parsed.data;

  // Validate YouTube URL
  const videoId = extractVideoId(url);
  if (!videoId) {
    return json({ success: false, error: 'Invalid YouTube URL or video ID' }, { status: 400 });
  }

  const start = performance.now();

  // Fetch transcript
  const result = await fetchYouTubeTranscript(url);
  if (!result) {
    return json(
      { success: false, error: 'Could not extract transcript from video', videoId },
      { status: 422 }
    );
  }

  // Chunk transcript
  const chunks = chunkText(result.transcript, chunkSize, overlap);
  if (chunks.length === 0) {
    return json(
      { success: false, error: 'Transcript too short to chunk', videoId, chars: result.transcript.length },
      { status: 422 }
    );
  }

  if (dryRun) {
    return json({
      success: true,
      dryRun: true,
      videoId: result.videoId,
      title: result.title,
      source: result.source,
      transcriptChars: result.transcript.length,
      chunks: chunks.length,
      preview: chunks.slice(0, 3).map((c, i) => ({ index: i, chars: c.length, preview: c.slice(0, 200) })),
    });
  }

  // Embed and index each chunk
  let indexed = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await generateEmbedding(chunk);
    if (!embedding) continue;

    const pointId = buildPointId(result.url, i);
    const success = await upsertPoint(collection, pointId, embedding, {
      document_name: result.title,
      content: chunk,
      source: `youtube-${result.source}`,
      source_url: result.url,
      topic: result.title,
      video_id: result.videoId,
      channel_name: result.channelName ?? undefined,
      description: result.description?.slice(0, 500) ?? undefined,
      chunk_index: i,
      chunk_count: chunks.length,
      indexed_at: new Date().toISOString(),
      text: chunk.slice(0, 500),
    });

    if (success) indexed++;
  }

  const durationMs = Math.round(performance.now() - start);

  return json({
    success: true,
    videoId: result.videoId,
    title: result.title,
    source: result.source,
    transcriptChars: result.transcript.length,
    chunks: chunks.length,
    indexed,
    collection,
    durationMs,
  });
};
