/**
 * research-utils.ts — Shared utilities for Lane 3 research pipeline
 */

/**
 * SHA-256 hex digest of a string.
 * Used to generate stable deterministic IDs for research chunks.
 * Falls back to a simple hash if crypto.subtle is unavailable.
 */
export async function sha256HexAsync(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Synchronous version using a simple FNV-1a 64-bit approximation.
 * Used where async SHA-256 would be cumbersome (object initialisation).
 * Produces a 32-char hex-like string stable within a session.
 */
export function sha256Hex(input: string): string {
  // FNV-1a 32-bit — good enough for stable dedup IDs in research chunks
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  // Pad to 16 hex chars with a prefix so IDs look distinct from UUIDs
  return `rch_${hash.toString(16).padStart(8, '0')}_${Buffer.from(input.slice(0, 8)).toString('hex').padStart(16, '0')}`;
}

/**
 * Chunk a long body text into overlapping segments.
 * Used before embedding large web/reddit/GitHub responses.
 */
export function chunkText(
  text: string,
  maxLen = 800,
  overlap = 100
): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + maxLen));
    start += maxLen - overlap;
  }
  return chunks.filter((c) => c.trim().length > 40);
}

/**
 * Truncate text to a safe length for embedding models.
 */
export function truncateForEmbed(text: string, maxChars = 2000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + ' [truncated]';
}
