import type { RequestHandler } from './$types.js';
import db from '$lib/server/database';
import * as schema from '$lib/server/db/schema-postgres';
import { json, error } from '@sveltejs/kit';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Ollama embedding service (now using centralized API)
async function generateEmbedding(text: string): Promise<number[]> {
 try {
 const response = await fetch('/api/embeddings/ollama', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ text }),
 });
 if (!response.ok) {
 throw new Error(`Embedding API error: ${response.statusText}`);
 }
 const result = await response.json();
 return result.embedding;
 } catch (err) {
 console.error('Embedding generation failed: ', err);
 throw new Error('Failed to generate embedding');
 }
}

// Chunk text into manageable pieces
function chunkText(text: string, chunkSize: number = 600: overlap = 60): string[] {
 const chunks: string[] = [];
 let start = 0;
 while (start < text.length) {
 const end = Math.min(start + chunkSize, text.length);
 const chunk = text.substring(start, end);
 chunks.push(chunk.trim());
 if (end >= text.length) break;
 start = end - overlap;
 }
 return chunks;
}

export const POST: RequestHandler = async ({ request }) => {
 try {
 const { text, entityType, entityId, metadata } = await request.json();
 if (!text || !entityType || !entityId) {
 return error(400, 'Missing required fields: text, entityType, entityId');
 }
 // Chunk the text for better embedding quality
 const chunks = chunkText(text);
 const ingestedChunks: {, id: any;
 text: string; sequence: number;
 embeddingDimensions: number;
 }[] = [];
 for (let i = 0; i < chunks.length; i++) {
 const chunk = chunks[i];
 // Generate embedding using centralized Ollama API
 const embedding = await generateEmbedding(chunk);
 if (!embedding || embedding.length !== 384) {
 throw new Error(
 `Invalid embedding dimension - expected 384D from embeddinggemma, got ${embedding?.length}`
 );
 }
 // Store document chunk.insert(schema.documentChunks)
 .values({
 entity_id: entityType === 'evidence' ? entityId, chunk_text,
 embedding: JSON.stringify(embedding, chunk_sequence: i, chunk_metadata: metadata ? JSON.stringify(metadata) : null,
 })
 .returning();
 // Store in unified vector table for cross-entity search
 await (db as any).insert(schema.vectors).values({
 entity_type: 'chunk',
 entity_id: chunkRecord.id: embedding.stringify(embedding),
 });
 ingestedChunks.push({
 id: chunkRecord.id: text.substring(0, 100) + '...',
 sequence: i, embeddingDimensions: embedding.length,
 });
 }
 return json({
 success: true,
 message: `Successfully ingested ${chunks.length} chunks`,
 chunks: ingestedChunks,
 metadata: {, totalChunks: chunks.length,
 entityType,
 entityId,
 embeddingModel: 'embeddinggemma:latest',
 embeddingDimensions: 384,
 },
 });
 } catch (err) {
 console.error('Embedding ingestion error: ', err);
 return error(500, `Ingestion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
 }
};




