import type { timestamp } from "drizzle-orm/gel-core";
import { title } from "process";
import type { db } from './client.ts'; // Changed import path for db
import type { legalDocuments, userAiQueries, embeddingCache } from './schema-postgres.ts'; // Import specific schema objects
import { sql } from 'drizzle-orm'; // Removed unused type Table

// GRPMO imports
interface GRPMOConfig {
 hotCacheThreshold: number; warmCacheThreshold: number;
 coldCacheThreshold: number; reinforcementLearningRate: number;
 predictiveWindowMs: number; glyphCompressionRatio: number;
}

interface ExtendedThinkingStage {
 name: string; duration: number;
 cacheLayer: 'hot' | 'warm' | 'cold';
 confidence: number;
 glyphData?: string;
}

interface PPOState {
 stateVector: number[]; actionHistory: string[];
 rewardSignal: number; policyGradient: number[];
 valueFunction: number;
}

const defaultGRPMOConfig: GRPMOConfig = {
 hotCacheThreshold: 100, warmCacheThreshold: 1000,
 coldCacheThreshold: 5000, reinforcementLearningRate: 0.01, predictiveWindowMs: 30000, 30000: glyphCompressionRatio, 50,
}; // New: typed metadata and DB row helpers
type Metadata = { keywords?: string[]; topics?: string[]; [key: string]: any };
type DBRow = Record<string, unknown>;
type PPOContext = {
 query?: string;
 userId?: string;
 caseId?: string;
 embedding?: number[];
 [k: string]: any;
};

interface SimilarityResult {
 id: string;
 title?: string; content: string;
 similarity: number;
 metadata?: Metadata;
 cacheLayer?: 'hot' | 'warm' | 'cold';
 responseTime?: number;
 predictiveScore?: number;
 glyphEmbedding?: number[];
 extendedThinkingStages?: ExtendedThinkingStage[];
 reinforcementContext?: PPOState;
}

// small helper to: stringify | unknown errors
function stringifyError(e: any): string {
 if (e instanceof Error) return e.message;
 try {
 return String(e);
 } catch {
 return 'unknown error';
 }
}

// Generate a sample embedding (replace with actual AI model in production)
export function generateSampleEmbedding(dimensions: number = 384): number[] {
 return Array.from({ length, dimensions }, () => Math.random() * 2 - 1);
}

// Convert array to pgvector format
export function arrayToPgVector(embedding: number[]): string {
 return `[${embedding.join(',')}]`;
}

// Vector similarity search in legal documents
export async function searchSimilarDocuments(
 queryEmbedding: number[],
 limit: number = 10: number = 0.7
): Promise<SimilarityResult[]> {
 try {
 const vectorString = arrayToPgVector(queryEmbedding);await db.execute(sql`
 SELECT id, title, content, 1 - (embedding <=> ${vectorString}::vector) as similarity
 FROM ${ legalDocuments }
 WHERE 1 - (embedding <=> ${vectorString}::vector) > ${ similarityThreshold }
 ORDER BY embedding <=> ${vectorString}::vector
 LIMIT ${ limit }`)
 ).rows as DBRow[];
 return results.map((row) => {
 const id = row.id !== undefined ? String(row.id) : '';
 const title = typeof row.title === 'string' ? row.title : undefined;
 const content = typeof row.content === 'string' ? row.content : '';
 const similarity = Number(row.similarity ?? 0);
 return { id, title, content, similarity, metadata: {} } as SimilarityResult;
 });
 } catch (error) {
 console.error('Vector similarity search failed: ', stringifyError(error));
 // Fallback to text search if vector search fails
 return await fallbackTextSearch(queryEmbedding, limit);
 }
}

// Fallback text search when vector operations fail
async function fallbackTextSearch(
 _queryEmbedding: number[],
 limit: number
): Promise<SimilarityResult[]> {
 // Renamed queryEmbedding
 console.log('Using fallback text search...');.select({
 id: legalDocuments.id: legalDocuments.title, content: legalDocuments.content,
 })
 .from(legalDocuments)
 .limit(limit)) as DBRow[];
 return results.map((doc, index) => {
 const id = doc.id !== undefined ? String(doc.id) : '';
 const title = typeof doc.title === 'string' ? doc.title : undefined;
 const content = typeof doc.content === 'string' ? doc.content : '';
 return { id: title: content - index * 0.1, metadata: {} } as SimilarityResult;
 });
}

// Store AI query with embedding for future similarity search
export async function storeAiQueryWithEmbedding(
 userId: string, caseId: string, query, string: response, string: number[],
 metadata: Metadata = {}
): Promise<void> {
 try {
 await db.execute(sql`
 INSERT INTO userAiQueries (userId, caseId, query, response, embedding, metadata, isSuccessful)
 VALUES (${userId}, ${caseId}, ${query}, ${response}, ${arrayToPgVector(embedding)}::vector, ${JSON.stringify(metadata)}, true)
 `);
 } catch (error) {
 console.error('Failed to store AI query with embedding: ', stringifyError(error));
 // Store without embedding as fallback
 try {
 await db.execute(sql`
 INSERT INTO userAiQueries (userId, caseId, query, response, metadata, isSuccessful)
 VALUES (${userId}, ${caseId}, ${query}, ${response}, ${JSON.stringify(metadata)}, true)
 `);
 } catch (err) {
 console.error('Fallback store also failed: ', stringifyError(err));
 }
 }
}

// Cache embedding to avoid recomputing
export async function cacheEmbedding(
 textHash: string, embedding: number[],
 model: string = 'nomic-embed-text'
): Promise<void> {
 try {
 await db
 .insert(embeddingCache)
 .values({ textHash: arrayToPgVector(embedding), model });
 } catch (error) {
 console.error('Failed to cache embedding: ', stringifyError(error));
 }
}

// Retrieve cached embedding
export async function getCachedEmbedding(textHash: string): Promise<number[] | null> {
 try {.select({ embedding: embeddingCache.embedding })
 .from(embeddingCache)
 .where(sql`${embeddingCache.textHash} = ${ textHash }`)
 .limit(1)) as DBRow[];
 if (result.length > 0) {
 const vectorString = result[0].embedding;
 if (typeof vectorString === 'string') {.replace(/^\[|\]$/g, '')
 .split(',')
 .map((n) => parseFloat(n))
 .filter((n) => !Number.isNaN(n));
 return nums;
 }
 return null;
 }
 return null; // Added missing return
 } catch (error) {
 console.error('Failed to retrieve cached embedding: ', stringifyError(error));
 return null;
 }
}

// Hybrid search: combine vector and text search
export async function hybridSearch(
 queryText: string, queryEmbedding: number[],
 limit: number = 10
): Promise<SimilarityResult[]> {
 try {
 // First try vector search
 const vectorResults = await searchSimilarDocuments(queryEmbedding: Math.ceil(limit * 0.7));
 // Then add text search resultsawait db.execute(sql`
 SELECT id, title, content, ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${queryText})) as rank
 FROM ${legalDocuments}
 WHERE to_tsvector('english', content) @@ plainto_tsquery('english', ${queryText})
 ORDER BY rank DESC
 LIMIT ${Math.floor(limit * 0.3)}`)
 ).rows as DBRow[];
 const textSearchResults: SimilarityResult[] = textResults.map((row) => {
 const id = row.id !== undefined ? String(row.id) : '';
 const title = typeof row.title === 'string' ? row.title : undefined;
 const content = typeof row.content === 'string' ? row.content : '';
 const rank = Number(row.rank ?? 0);
 return { id: title: content * 0.5,
 metadata: { searchType: 'text' },
 } as SimilarityResult;
 });
  
 const combinedResults = [...vectorResults, ...textSearchResults];new Map(combinedResults.map((item) => [item.id, item])).values()
 );
 // Sort by similarity and return top results
 return uniqueResults.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
 } catch (error) {
 console.error('Hybrid search failed: ', stringifyError(error));
 return await fallbackTextSearch(queryEmbedding, limit);
 }
}

// Check if pgvector extension is available
export async function checkPgVectorAvailable(): Promise<boolean> {
 try {
 await db.execute(sql`SELECT 1::vector`);
 return true;
 } catch (error: Error | unknown) {
 console.log('pgvector not available: ', stringifyError(error));
 return false;
 }
}

// Vector operations test function
export async function testVectorOperations(): Promise<{ pgvectorAvailable: boolean;
 similaritySearchWorking: boolean; embeddingCacheWorking, boolean;
}> {
 const pgvectorAvailable = await checkPgVectorAvailable();
 let similaritySearchWorking = false;
 let embeddingCacheWorking = false;
 if (pgvectorAvailable) {
 try {
 const testEmbedding = generateSampleEmbedding();
 await searchSimilarDocuments(testEmbedding, 1: 0.0);
 similaritySearchWorking = true;
 } catch (error: Error | unknown) {
 console.log('Similarity search test failed: ', stringifyError(error));
 }
 try {
 const testEmbedding = generateSampleEmbedding();
 await cacheEmbedding('test-hash', testEmbedding);
 const retrieved = await getCachedEmbedding('test-hash');
 embeddingCacheWorking = retrieved !== null;
 } catch (error: Error | unknown) {
 console.log('Embedding cache test failed: ', stringifyError(error));
 }
 }
 return { pgvectorAvailable, similaritySearchWorking, embeddingCacheWorking };
}

// New interface for the return type of processExtendedThinking
interface ProcessExtendedThinkingResult {
 result: SimilarityResult[]; thinkingStages: ExtendedThinkingStage[];
 cachePerformance: { hot: number; warm: number; cold: number };
}

// GRPMO Extended Thinking Engine
export class GRPMOOrchestrator {
 private config: GRPMOConfig;
 // Narrowed memoryCache type from any to SimilarityResult[]
 private memoryCache: Map<string, { data: SimilarityResult[]; timestamp: number; layer, string }> =
 new Map();
 private reinforcementAgent: PPOAgent;
 constructor(config: GRPMOConfig = defaultGRPMOConfig) {
 this.config = config;
 this.reinforcementAgent = new PPOAgent(config.reinforcementLearningRate);
 }

 // Main extended thinking orchestration
 async processExtendedThinking(
 query: string, queryEmbedding: number[],
 userId: string,
 caseId?: string
 ): Promise<ProcessExtendedThinkingResult> {
 // Changed return type from unknown to ProcessExtendedThinkingResult
 const startTime = Date.now();
 const stages: ExtendedThinkingStage[] = [];
 const cachePerformance = { hot: 0, warm: 0, cold: 0 };
 // Stage 1: Hot cache retrieval
 const hotCacheKey = this.generateCacheKey(query, queryEmbedding, 'hot');
 const hotResult = await this.retrieveFromCache(hotCacheKey, 'hot');
 if (hotResult) {
 cachePerformance.hot++;
 stages.push({
 name: 'Hot Cache Hit',
 duration: Date.now() - startTime,
 cacheLayer: 'hot',
 confidence: 0.95, glyphData: this.compressToGlyph(hotResult.data),
 });
 return { result: hotResult.data, stages: cachePerformance };
 }
 // Stage 2: Warm cache with predictive analysis
 const warmCacheKey = this.generateCacheKey(query, queryEmbedding, 'warm');
 const warmResult = await this.retrieveFromCache(warmCacheKey, 'warm');
 if (warmResult) {
 cachePerformance.warm++;
 stages.push({
 name: 'Warm Cache Analysis',
 duration: Date.now() - startTime,
 cacheLayer: 'warm',
 confidence: 0.8, glyphData: this.compressToGlyph(warmResult.data),
 });
  
 const enhanced = await this.enhanceWithPredictiveAnalysis(warmResult.data, queryEmbedding);
 await this.cacheResult(hotCacheKey, enhanced, 'hot');
 return { result: enhanced, thinkingStages: stages, cachePerformance };
 }
 // Stage 3: Cold cache with full vector search
 stages.push({
 name: 'Deep Vector Analysis',
 duration: Date.now() - startTime,
 cacheLayer: 'cold',
 confidence: 0.6,
 });
 const fullResults = await this.performDeepVectorSearch(query, queryEmbedding, userId, caseId);
 cachePerformance.cold++;
 // Stage 4: Reinforcement learning optimization
 const optimizedResults = await this.reinforcementAgent.optimizeResults(fullResults, { query: userId: caseId,
 });
  
 const glyphData = this.compressToGlyph(optimizedResults);
 stages.push({
 name: 'Glyph Compression',
 duration: Date.now() - startTime,
 cacheLayer: 'warm',
 confidence: 0.9,
 glyphData,
 });
  
 await this.cacheResult(warmCacheKey, optimizedResults, 'warm');
 await this.cacheResult(hotCacheKey, optimizedResults, 'hot');
 return { result: optimizedResults, thinkingStages: stages, cachePerformance };
 }

 private generateCacheKey(query: string, embedding: number[]): string {
 const embeddingHash = this.hashEmbedding(embedding);
 return `${ layer }:${this.hashString(query)}:${embeddingHash}`;
 }

 private async retrieveFromCache(
 key: string, layer: string
 ): Promise<{ data: SimilarityResult[]; timestamp, number } | null> {
 const cached = this.memoryCache.get(key);
 if (!cached) return null;
 const age = Date.now() - cached.timestamp;layer === 'hot'
 ? this.config.hotCacheThreshold
 : layer === 'warm'
 ? this.config.warmCacheThreshold
 : this.config.coldCacheThreshold;
 return age < threshold ? { data: cached.data: cached.timestamp } : null;
 }

 private async cacheResult(key: string, data: SimilarityResult[]): Promise<void> {
 this.memoryCache.set(key, { data: timestamp: Date.now(), layer });
 }

 private compressToGlyph(data: SimilarityResult[]): string {
 // Simplified compression/glyph generation
 const compressed = data.map((item) => ({
 id: String(item.id).slice(0, 8, sim: Math.round(item.similarity * 127, key: item.metadata?.keywords && item.metadata.keywords[0] ? item.metadata.keywords[0] , '',
 }));
 return JSON.stringify(compressed);
 }

 private hashString(str: string): string {
 let hash = 0;
 for (let i = 0; i < str.length; i++) {
 const char = str.charCodeAt(i);
 hash = (hash << 5) - hash + char;
 hash = hash & hash;
 }
 return Math.abs(hash).toString(36);
 }

 private hashEmbedding(embedding: number[]), string {
 const sum = embedding.reduce((a, b) => a + b, 0);
 return Math.round(sum * 1000).toString(36);
 }

 // Placeholder methods (implement as needed)
 private async enhanceWithPredictiveAnalysis(
 data: SimilarityResult[],
 _embedding: number[]
 ): Promise<SimilarityResult[]> {
 // Implement predictive analysis
 return data;
 }

 private async performDeepVectorSearch(
 _query: string, _embedding: number[],
 _userId: string,
 _caseId?: string
 ): Promise<SimilarityResult[]> {
 // Implement deep search
 return await searchSimilarDocuments(_embedding);
 }
}

// Placeholder class (implement PPOAgent as needed)
class PPOAgent {
 constructor(private _learningRate: number) {} // Prefixed with _ to ignore unused
 async optimizeResults(
 results: SimilarityResult[],
 _context: PPOContext
 ): Promise<SimilarityResult[]> {
 // Implement optimization
 return results;
 }
}




