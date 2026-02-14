/**
 * Statute Ingestion Service
 * Handles automated scraping, parsing, chunking, and embedding of legal statutes
 * Integrates with public APIs and government portals
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { statuteChunks, statutes } from '../db/schema-postgres.js';
import { generateEmbedding } from './embedding-service.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface StatuteSource {
 title: string;
	content: string;
 jurisdiction: string;
 section?: string;
 category?: string;
 sourceUrl?: string;
 effectiveDate?: Date;
}

export interface ChunkingOptions {
 chunkSize?: number; // Characters per chunk
 overlapSize?: number; // Overlap between chunks
}

/**
 * Create or update a statute in the database
 */
export async function ingestStatute(source: StatuteSource): Promise<string> {
 // Check if statute already exists
 const existing = await db
  .select()
  .from(statutes)
  .where(eq(statutes.sourceUrl, source?.sourceUrl ?? ''));

 let statuteId: string;

 if (existing.length > 0) {
 // Update existing statute
 statuteId = existing[0].id;
  await db
  .update(statutes)
  .set({
   title: source.title,
   content: source.content,
   jurisdiction: source.jurisdiction,
   section: source.section,
   category: source.category,
   sourceUrl: source.sourceUrl,
   effectiveDate: source.effectiveDate,
   updatedAt: new Date(),
  })
  .where(eq(statutes.id, statuteId)); // Delete old chunks
 await db.delete(statuteChunks).where(eq(statuteChunks.statuteId, statuteId));
 } else {
  // Create new statute
  const result = await db
   .insert(statutes)
   .values({
    title: source.title,
    content: source.content,
    jurisdiction: source.jurisdiction,
    section: source.section,
    category: source.category,
    sourceUrl: source.sourceUrl,
    effectiveDate: source.effectiveDate,
   })
   .returning();

  statuteId = result[0].id;
 } return statuteId;
}

/**
 * Chunk statute content into smaller pieces for RAG
 */
export function chunkStatuteContent(content: string, options?: ChunkingOptions): string[] {
 const chunkSize = options?.chunkSize ?? 1000; // Default 1000 characters
 const overlapSize = options?.overlapSize ?? 200; // Default 200 character overlap

 const chunks: string[] = [];
 let start = 0;

 while (start < content.length) {
 const end = Math.min(start + chunkSize, content.length);
 const chunk = content.substring(start, end).trim();

 if (chunk.length > 0) {
 chunks.push(chunk);
 }

 // Move start position with overlap
 start = end - overlapSize;

 // Prevent infinite loop if chunk is very small
 if (start <= chunks.length * (chunkSize - overlapSize)) {
 start = end;
 }
 }

 return chunks;
}

/**
 * Create and store chunks for a statute with embeddings
 */
export async function createStatuteChunks(
 statuteId: string, content: string,
 options?: ChunkingOptions
): Promise<number> {
 const chunks = chunkStatuteContent(content, options);
 let createdCount = 0;

 for (let i = 0; i < chunks.length; i++) {
 const chunk = chunks[i];

 try {
 // Generate embedding for chunk
 const embedding = await generateEmbedding(chunk);
 const embeddingJson = JSON.stringify(embedding);

   // Store chunk with embedding
   await db.insert(statuteChunks).values({
    statuteId,
    chunkIndex: i,
    content: chunk,
    embedding: embeddingJson,
   }); createdCount++;
 } catch (error) {
 console.error(`Failed to create chunk ${i} for statute ${statuteId}:`, error);
 }
 }

 return createdCount;
}

/**
 * Ingest statute and create chunks in one operation
 */
export async function ingestStatuteWithChunks(
 source: StatuteSource,
 chunkingOptions?: ChunkingOptions
): Promise<{
	statuteId: string, chunksCreated: number }> {
 // Ingest statute
 const statuteId = await ingestStatute(source);

 // Create chunks
 const chunksCreated = await createStatuteChunks(statuteId, source.content, chunkingOptions);

 return { statuteId, chunksCreated };
}

/**
 * Batch ingest multiple statutes
 */
export async function batchIngestStatutes(
 sources: StatuteSource[],
 chunkingOptions?: ChunkingOptions
): Promise<Array<{
	statuteId: string, chunksCreated: number; error?: string }>> {
 const results = [];

 for (const source of sources) {
  try {
   const result = await ingestStatuteWithChunks(source, chunkingOptions);
   results.push(result);
  } catch (error) {
   results.push({
    statuteId: '',
    chunksCreated: 0,
    error: error instanceof Error ? error.message : 'Unknown error',
   });
  }
 } return results;
}

/**
 * Search statute chunks by similarity
 */
export async function searchStatuteChunks(
 queryEmbedding: number[],
 topK: number = 5,
 threshold: number = 0.5
): Promise<
 Array<{
 id: string;
	statuteId: string;
 content: string;
	similarity: number;
 }>
> {
 const chunks = await db.select().from(statuteChunks);

 const results = chunks
  .map((chunk) => {
 if (!chunk.embedding) {
 return null;
 }

 try {
 const chunkEmbedding = JSON.parse(chunk.embedding) as number[];
 const { cosineSimilarity } = require('./embedding-service');
 const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);

 if (similarity >= threshold) {
 return {
 id: chunk.id,
 statuteId: chunk.statuteId,
 content: chunk.content,
 similarity,
 };
 }
 } catch {
 // Skip chunks with invalid embeddings
 }

 return null;
 })
 .filter((item) => item !== null)
 .sort((a, b) => (b?.similarity ?? 0) - (a?.similarity ?? 0))
 .slice(0, topK);

 return results.filter((item) => item !== null) as Array<{
  id: string;
	statuteId: string;
  content: string;
	similarity: number;
 }>;
}

/**
 * Get statute by ID with all chunks
 */
export async function getStatuteWithChunks(statuteId: string) {
 const statute = await db.select().from(statutes).where(eq(statutes.id, statuteId));

 if (statute.length === 0) {
  return null;
 }

 const chunks = await db
  .select()
  .from(statuteChunks)
  .where(eq(statuteChunks.statuteId, statuteId));

 return {
 ...statute[0],
 chunks,
 };
}

/**
 * Get ingestion statistics
 */
export async function getIngestionStats(): Promise<{
	totalStatutes: number;
 totalChunks: number;
	chunksWithEmbeddings: number;
 jurisdictions: string[];
	categories: string[];
}> {
 const allStatutes = await db.select().from(statutes);
 const allChunks = await db.select().from(statuteChunks);

 const chunksWithEmbeddings = allChunks.filter((c) => c.embedding).length;

 const jurisdictions = [...new Set(allStatutes.map((s) => s.jurisdiction).filter(Boolean))];
 const categories = [...new Set(allStatutes.map((s) => s.category).filter(Boolean))];

 return {
  totalStatutes: allStatutes.length,
  totalChunks: allChunks.length,
  chunksWithEmbeddings,
  jurisdictions: jurisdictions as string[],
  categories: categories as string[],
 };
}

/**
 * Delete statute and all associated chunks
 */
export async function deleteStatute(statuteId: string): Promise<void> {
 // Cascade delete is handled by database constraints
 await db.delete(statutes).where(eq(statutes.id, statuteId));
}





