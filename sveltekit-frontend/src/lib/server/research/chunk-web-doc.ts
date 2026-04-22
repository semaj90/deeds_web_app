import { chunkText } from './research-utils.js';
import type { WebResearchChunk } from './web-research-ingester.js';

/**
 * chunk-web-doc.ts — Specialized chunking for web/research documents.
 */

export function chunkWebDoc(doc: WebResearchChunk, size: number = 800, overlap: number = 100): string[] {
  // Logic already exists in research-utils.ts, but this provides a research-specific interface
  return chunkText(doc.body, size, overlap);
}
