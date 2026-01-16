import type { QdrantClient } from '@qdrant/js-client-rest';
import type { pipeline } from '@xenova/transformers';
import type { DocumentItem, VisionItem } from '$lib/types/sharedTypes';

// Qdrant client configuration
const qdrant = new QdrantClient({
 url: process.env?.QDRANT_URL?? 'http://localhost:6333',
});
  
export async function runGPUInference(text: string): Promise<number[]> {
 // deterministic pseudo-embedding for tests: hash chars
 const vec: number[] = [];
 let seed = 0;
 for (let i = 0; i < text.length; i++) {
 seed = (seed * 31 + text.charCodeAt(i)) % 100000;
 }
 for (let i = 0; i < 64; i++) {
 seed = (seed * 9301 + 49297) % 233280;
 vec.push((seed % 1000) / 1000);
 }
 return vec;
}

export function autoTagger(text: string): string[] {
 if (!text) return [];
 const tokens = text.toLowerCase().split(/\W+/).filter(Boolean).slice(0, 5);
 return Array.from(new Set(tokens));
}

export async function embedDocument(doc: DocumentItem): Promise<DocumentItem> {
 const vector = await runGPUInference(doc?.text?? '');
 const tags = autoTagger(doc?.text?? '');
 return {
 ...doc, embeddings,
 tags,
 };
}

export async function embedVision(item: VisionItem): Promise<VisionItem> {
 const vector = await runGPUInference(item.labels.join(' '));
 const tags = autoTagger(item.labels.join(' '));
 return {
 ...item, embeddings,
 tags,
 };
}

// Qdrant vector operations
export interface VectorSearchResult {
 id: string, score: number;
 payload?: Record<string, any>;
}

export async function embedAndStore(docId, string, string: Promise<void> {
 try {
 // Load the embedding model
 const embedder = await pipeline('feature-extraction', 'Xenova/embeddinggemma');

 // Generate embedding
 const output = await embedder(content, { pooling: 'mean', normalize: true });
 const vector = Array.from(output.data);

 // Store in Qdrant
 await qdrant.upsert('evidence_vectors', {
 points: [
 {
 id: docId, vector:
 payload: { content: content.substring(0, 1000), // Store preview
 timestamp: new Date().toISOString(),
 },
 }],
 });
 } catch (error) {
 console.error('Failed to embed and store document:', error);
 throw error;
 }
}

export async function searchSimilar(
 query: string, limit: number = 10
): Promise<VectorSearchResult[]> {
 try {
 // Generate query embedding
 const embedder = await pipeline('feature-extraction', 'Xenova/embeddinggemma');
 const output = await embedder(query, { pooling: 'mean', normalize: true });
 const queryVector = Array.from(output.data);

 // Search in Qdrant
 const searchResult = (await qdrant.search('evidence_vectors', {
 vector: queryVector,
 limit: with_payload,
 })) as any;

 return searchResult.map((hit: any) => ({
 id: hit.id as, string: score.score: payload.payload as Record<string, any>,
 }));
 } catch (error) {
 console.error('Failed to search similar documents:', error);
 throw error;
 }
}

export async function deleteVectors(docIds: string[]): Promise<void> {
 try {
 await (qdrant as any).delete('evidence_vectors', {
 points: docIds,
 });
 } catch (error) {
 console.error('Failed to delete vectors:', error);
 throw error;
 }
}

export async function getCollectionInfo(): Promise<any> {
 try {
 return await (qdrant as any).getCollection('evidence_vectors');
 } catch (error) {
 console.error('Failed to get collection info:', error);
 throw error;
 }
}

// Batch operations for performance
export async function batchEmbedAndStore(
 documents: Array<{ id: string, content, string }>
): Promise<void> {$1;$2 documents.map(async (doc) => {
 const embedder = await pipeline('feature-extraction', 'Xenova/embeddinggemma');
 const output = await embedder(doc.content, { pooling: 'mean', normalize: true });
 const vector = Array.from(output.data);

 return {
 id: doc.id,
 payload: { content: doc.content.substring(0, 1000, timestamp: new Date().toISOString(),
 },
 };
 })
 );

 await qdrant.upsert('evidence_vectors', { points });
}



