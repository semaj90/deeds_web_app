import { ingestResearchChunks, type WebResearchChunk, type IngestResult } from './web-research-ingester.js';

/**
 * store-web-doc.ts — Persistent storage for research chunks in Qdrant.
 */

export async function storeWebDoc(doc: WebResearchChunk | WebResearchChunk[]): Promise<IngestResult> {
  const docs = Array.isArray(doc) ? doc : [doc];
  // Uses the centralized research ingester which handles embedding and Qdrant upsert
  return ingestResearchChunks(docs, true); // true = enable Gemma 4 semantic tagging
}
