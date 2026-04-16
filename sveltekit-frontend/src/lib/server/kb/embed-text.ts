/**
 * Embed-text builders for Qdrant upsert operations.
 * Constructs compact, semantically dense strings for embedding —
 * avoids including raw boilerplate content in the vector space.
 */

import type { CodebaseChunkPayload } from '../types/qdrant.js';

/**
 * Builds a compact semantic string for embedding a codebase chunk.
 * Does NOT include raw content to avoid polluting the vector with boilerplate.
 * Max ~150 tokens. Used for codebase_chunks_768 upserts.
 *
 * Priority order: summary → tags → language → file path
 */
export function buildEmbedText(payload: CodebaseChunkPayload): string {
  return [
    payload.summary ?? '',
    payload.tags.slice(0, 12).join(', '),
    payload.language,
    payload.file_path,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Builds embed text for evidence chunks.
 * Uses entity labels + section markers as semantic anchors,
 * with raw content capped at 800 chars to bound token count.
 */
export function buildEvidenceEmbedText(payload: {
  content: string;
  entities?: string[];
  tags?: string[];
  section?: string;
}): string {
  return [
    payload.section ?? '',
    payload.entities?.slice(0, 8).join(', ') ?? '',
    payload.tags?.slice(0, 6).join(', ') ?? '',
    payload.content.slice(0, 800),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Estimated token count using the rough 4 chars/token heuristic.
 * Suitable for budget checks before sending to Ollama.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
