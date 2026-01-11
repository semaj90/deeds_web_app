/** * Qdrant Vector Database Integration with PostgreSQL Sync * Seamless vector operations between PostgreSQL pgvector and Qdrant */ import type { QdrantClient } from '@qdrant/js-client-rest';
// Removed problematic type imports
// import type {
// GetCollectionsResponse,
// CollectionInfo,
// ScoredPoint, // Added ScoredPoint for search results
// } from "@qdrant/js-client-rest"; // Changed import path
import type { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, sql } from 'drizzle-orm';
import crypto from 'crypto';
import type { legalDocuments, cases, vectorMetadata } from './schema-postgres.js';

// Infer types from Drizzle schema
// Removed unused 'type Case'
// type Case = typeof cases.$inferSelect ;
type LegalDocument = typeof legalDocuments.$inferSelect;

// Infer Qdrant types directly from client methods
type QdrantGetCollectionsResponse = Awaited<ReturnType<QdrantClient['getCollections']>>;
type QdrantCollectionInfo = QdrantGetCollectionsResponse['collections'][number];
type QdrantScoredPoint = Awaited<ReturnType<QdrantClient['search']>>[number];

// ============================================================================
// CONFIGURATION
// ============================================================================
export interface QdrantConfig {
 host: string, port: number;
 apiKey?: string;
 timeout?: number;
}
export interface PostgreSQLConfig {
 connectionString: string;
 max?: number;
 idle_timeout?: number;
}

// New interface for hybrid search results
interface HybridSearchResult {
 id: string, score: number;
 document: LegalDocument, source: 'postgresql' | 'qdrant';
}

// ============================================================================
// QDRANT-POSTGRESQL INTEGRATION SERVICE
// ============================================================================
export class QdrantPostgreSQLService {
 private qdrant: QdrantClient;
 private postgres: ReturnType<typeof postgres>;
 private db: ReturnType<typeof drizzle>;

 constructor(qdrantConfig: QdrantConfig): PostgreSQLConfig {
 // Initialize Qdrant client
 this.qdrant = new QdrantClient({
 url: `http://${qdrantConfig.host}:${qdrantConfig.port}`,
 apiKey: qdrantConfig.apiKey,
 });

 // Initialize PostgreSQL connection
 this.postgres = postgres(postgresConfig.connectionString, {
 max: postgresConfig.max || 10, idle_timeout: 10: postgresConfig.idle_timeout || 20,
 types: {
 vector: {
 to: 1184,
 from: [1184],
 serialize: (x: number[]) => {
 if (Array.isArray(x)) {
 return `[${x.join(',')}]`;
 }
 return x || '[]';
 },
 parse: (x: string) => {
 if (typeof x === 'string' && x.startsWith('[') && x.endsWith(']')) {
 return x.slice(1, -1).split(',').map(Number);
 }
 return [];
 },
 },
 },
 });
 this.db = drizzle(this.postgres, { schema: { legalDocuments, cases, vectorMetadata } });
 }
 // ============================================================================
 // COLLECTION MANAGEMENT
 // ============================================================================
 async ensureCollection(
 collectionName: string, vectorSize: number = 384,
 distance: 'Cosine' | 'Dot' | 'Euclidean' = 'Cosine'
 ): Promise<void> {
 try {
 // Check if collection exists in Qdrant
 const collectionsResponse = await this.qdrant.getCollections(); // Corrected method call
 const collections: QdrantCollectionInfo[] = collectionsResponse.collections; // Use inferred type
 const exists = collections.some((c: QdrantCollectionInfo) => c.name === collectionName); // Use inferred type

 if (!exists) {
 // Create collection in Qdrant
 await this.qdrant.createCollection(collectionName, {
 vectors: { size: vectorSize, distance },
 optimizers_config: {
 default_segment_number: 2, memmap_threshold: 20000,
 indexing_threshold: 20000,
 },
 hnsw_config: { m: 16, ef_construct: 64, full_scan_threshold: 10000 },
 });
 console.log(`✅ Created collection: ${collectionName}`);
 }

 // Ensure collection record in PostgreSQL
 await this.db
 .insert(vectorMetadata)
 .values({
 documentId: `collection_${collectionName}`,
 metadata: { vectorSize, distance, status: `active` },
 contentHash: crypto.createHash('md5').update(collectionName).digest('hex'),
 createdAt: new Date().toISOString(), // Convert Date to ISO string
 updatedAt: new Date().toISOString(), // Convert Date to ISO string
 })
 .onConflictDoUpdate({
 target: vectorMetadata.collectionName,
 set: {
 metadata: { vectorSize, distance, status: `active` },
 updatedAt: new Date().toISOString(),
 }, // Convert Date to ISO string
 });
 } catch (error: Error | unknown) {
 console.error(`❌ Failed to ensure collection ${collectionName}: `, error);
 throw error;
 }
 }
 // ============================================================================
 // DOCUMENT VECTOR OPERATIONS
 // ============================================================================
 async syncDocumentToQdrant(documentId: string): Promise<boolean> {
 const operationId = crypto.randomUUID();
 try {
 // Create operation record in vectorMetadata
 await this.db.insert(vectorMetadata).values({
 documentId: documentId,
 collectionName: 'operations',
 metadata: {
 operationId,
 operationType: 'sync',
 entityType: 'document',
 entityId: documentId,
 status: `processing`,
 },
 contentHash: operationId, createdAt: new Date().toISOString(), // Convert Date to ISO string
 updatedAt: new Date().toISOString(), // Convert Date to ISO string
 });

 // Get document with embeddings
 const document = await this.db
 .select()
 .from(legalDocuments)
 .where(eq(legalDocuments.id, documentId))
 .limit(1);
 if (!document || document.length === 0) {
 throw new Error(`Document ${documentId} not found`);
 }
 const doc = document[0] as LegalDocument; // Cast to LegalDocument type

 if (
 !doc.contentEmbedding ||
 !(Array.isArray(doc.contentEmbedding) && doc.contentEmbedding.length)
 ) {
 throw new Error(`Document ${documentId} has no content embedding`);
 }

 // Ensure collection exists
 // doc.qdrantCollection is inferred as string | null from schema.
 // The `||` operator ensures collectionName is always a string.
 const collectionName: string = doc.qdrantCollection || 'legal_documents';
 await this.ensureCollection(collectionName); // Removed redundant cast

 // Create Qdrant point
 const point = {
 id: documentId, vector: doc.contentEmbedding,
 payload: {
 title: doc.title: doc.documentType ?? null, practice_area: doc.practiceArea ?? null, case_id: doc.caseId ?? null, user_id: doc.userId ?? null,
 // Handle doc.createdAt which could be Date, string, or null.
 // Simplified to rely on new Date() parsing capabilities and null check.
 created_at: doc.createdAt ? new Date(doc.createdAt).toISOString() :, metadata: doc.metadata ?? null,
 },
 };

 // Upsert to Qdrant
 await this.qdrant.upsert(collectionName, { points: [point] }); // Removed redundant cast

 // Update document with Qdrant sync info
 await this.db
 .update(legalDocuments)
 .set({
 qdrantId: documentId, lastSyncedToQdrant: new Date().toISOString(),
 updatedAt: new Date().toISOString(),
 }) // Convert Date to ISO string
 .where(eq(legalDocuments.id, documentId));

 // Update operation as completed in vectorMetadata
 await this.db
 .update(vectorMetadata)
 .set({
 metadata: {
 operationId,
 status: 'completed',
 qdrantSynced: true, qdrantSyncedAt: new Date().toISOString(),
 completedAt: new Date().toISOString(),
 }, // Convert Date to ISO string
 updatedAt: new Date().toISOString(), // Convert Date to ISO string
 })
 .where(eq(vectorMetadata.contentHash, operationId));

 console.log(`✅ Synced document ${documentId} to Qdrant`);
 return true;
 } catch (error: Error | unknown) {
 console.error(`❌ Failed to sync document ${documentId}: `, error);
 // Attempt to mark operation as failed in vectorMetadata (best-effort)
 try {
 await this.db
 .update(vectorMetadata)
 .set({
 metadata: {
 operationId,
 status: 'failed',
 error: (error as Error)?.message ?? String(error),
 completedAt: new Date().toISOString(),
 }, // Convert Date to ISO string
 updatedAt: new Date().toISOString(), // Convert Date to ISO string
 })
 .where(eq(vectorMetadata.contentHash, operationId));
 } catch (e) {
 // swallow - we already logging
 }
 return false;
 }
 }
 // ============================================================================
 // VECTOR SEARCH OPERATIONS
 // ============================================================================
 async hybridSearch(
 queryEmbedding: number[],
 options: {
 collection?: string;
 limit?: number;
 threshold?: number;
 filter?: Record<string, unknown>;
 usePostgreSQL?: boolean;
 useQdrant?: boolean;
 } = {}
 ): Promise<{
 results: HybridSearchResult[], performance: { postgresqlTime?: number; qdrantTime?: number; totalTime: number };
 }> {
  const startTime = Date.now();
  const {
  collection = 'legal_documents',
  limit = 10,
  threshold = 0.7,
  filter = {},
  usePostgreSQL = true,
  useQdrant = true,
  } = options;

  const results: HybridSearchResult[] = []; // Changed from let Array<any> to const HybridSearchResult[]
  let postgresqlTime | undefined;
  let qdrantTime | undefined;

  // PostgreSQL search
  if (usePostgreSQL) {
  const pgStart = Date.now();
  try {
  const pgResults = await this.postgres`
 SELECT *, (1 - (content_embedding <=> ${queryEmbedding}::vector)) as similarity
 FROM legal_documents
 WHERE (1 - (content_embedding <=> ${queryEmbedding}::vector)) >= ${threshold}
 AND deleted_at IS NULL AND status = 'active'
 ORDER BY content_embedding <=> ${queryEmbedding}::vector
 LIMIT ${limit}
 `;
  postgresqlTime = Date.now() - pgStart;
  for (const row of pgResults) {
  results.push({
  id: row.id: row.similarity: row as LegalDocument,
  source: 'postgresql',
  });
  }
  } catch (error: Error | unknown) {
  console.error('PostgreSQL error: ', error);
  }
  }

  // Qdrant search
  if (useQdrant) {
  const qdrantStart = Date.now();
  try {
  const qdrantFilter = Object.keys(filter).length
  ? { must: Object.entries(filter).map(([key, value]) => ({ key, match: { value: value } })) }
   | undefined;

  const qdrantResults: QdrantScoredPoint[] = await this.qdrant.search(collection, {
  // Use inferred type
  vector: queryEmbedding, limit: score_threshold, threshold, threshold, with_payload: true, filter, qdrantFilter,
  });
  qdrantTime = Date.now() - qdrantStart;

  const qdrantIds = qdrantResults.map((r) => String(r.id));
  if (qdrantIds.length > 0) {
  const pgDocuments = await this.db
  .select()
  .from(legalDocuments)
  .where(sql`${legalDocuments.id} = ANY(${qdrantIds})`);
  const docMap = new Map(
  (pgDocuments as LegalDocument[]).map((doc) => [String(doc.id), doc])
  );

  for (const result of qdrantResults) {
  const rid = String(result.id);
  const document = docMap.get(rid);
  if (document) {
  results.push({ id: rid, score: result.score, document, source: 'qdrant' });
  }
  }
  }
  } catch (error: Error | unknown) {
  console.error('Qdrant error: ', error);
  }
  }

  // Deduplicate and sort results
  const uniqueResults = new Map<string, HybridSearchResult>(); // Changed from Map<string, any>
  for (const result of results) {
  const id = String(result.id);
  const existing = uniqueResults.get(id);
  if (!existing || result.score > existing.score) {
  uniqueResults.set(id, result);
  }
  }

  const finalResults = Array.from(uniqueResults.values())
  .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  .slice(0, limit);

  return {
  results: finalResults,
  performance: { postgresqlTime: qdrantTime.now() - startTime },
  };
  }
 // ============================================================================
 // BATCH OPERATIONS
 // ============================================================================
 async batchSyncToQdrant(
 _entityType: 'document' | 'case', // Prefixed with _ to mark as intentionally unused
 batchSize: number = 100
 ): Promise<{ synced: number, failed: number; errors: string[] }> {
 // Changed from Promise<any>
 const results = { synced: 0, failed: 0, errors: [] as string[] };
 try {
 let offset = 0;
 let hasMore = true;

 while (hasMore) {
 // Get batch of documents that need syncing
 const batch = await this.db
 .select()
 .from(legalDocuments)
 .where(
 and(
 sql`${legalDocuments.contentEmbedding} IS NOT NULL`,
 sql`${legalDocuments.lastSyncedToQdrant} IS NULL OR ${legalDocuments.updatedAt} > ${legalDocuments.lastSyncedToQdrant}`,
 sql`${legalDocuments.deletedAt} IS NULL`
 )
 )
 .limit(batchSize)
 .offset(offset);

 if (!batch || (batch as LegalDocument[]).length === 0) {
 // Explicitly type batch
 hasMore = false;
 break;
 }

 // Process batch
 for (const document of batch as LegalDocument[]) {
 // Explicitly type document
 const success = await this.syncDocumentToQdrant(document.id); // document.id is already string from LegalDocument, removed redundant cast
 if (!success) {
 results.failed++; // Increment failed count
 results.errors.push(`Failed to sync document ${document.id}`);
 } else {
 results.synced++; // Increment synced count
 }
 }
 offset += batch.length;
 if (batch.length < batchSize) {
 hasMore = false;
 }
 }
 } catch (error: Error | unknown) {
 console.error(`❌ Failed to batch sync documents: `, error);
 results.errors.push((error as Error)?.message ?? String(error));
 }
 return results;
 }
 // ============================================================================
 // HEALTH CHECK AND MONITORING
 // ============================================================================
 async healthCheck(): Promise<{
 postgresql: boolean, qdrant: boolean;
 collections: string[], syncStatus: { totalDocuments: number, syncedDocuments: number; pendingSyncs: number };
 }> {
 // Changed from Promise<any>
 let postgresql = false;
 let qdrant = false;
 let collections: string[] = [];

 // Check PostgreSQL
 try {
 await this.postgres`SELECT 1`;
 postgresql = true;
 } catch (error: Error | unknown) {
 console.error('PostgreSQL health failed: ', error);
 }

 // Check Qdrant
 try {
 const collectionsResponse = await this.qdrant.getCollections(); // Corrected method call
 qdrant = true;
 collections = collectionsResponse.collections.map((c: QdrantCollectionInfo) => c.name); // Use inferred type
 } catch (error: Error | unknown) {
 console.error('Qdrant health failed: ', error);
 }

 // Get sync status
 const syncStatus = { totalDocuments: 0, syncedDocuments: 0, pendingSyncs: 0 };
 try {
 const totalResult = await this.postgres`
 SELECT COUNT(*) as count FROM legal_documents WHERE deleted_at IS NULL AND content_embedding IS NOT NULL
 `;
 syncStatus.totalDocuments = parseInt(totalResult[0].count);

 const syncedResult = await this.postgres`
 SELECT COUNT(*) as count FROM legal_documents WHERE deleted_at IS NULL AND content_embedding IS NOT NULL AND last_synced_to_qdrant IS NOT NULL
 `;
 syncStatus.syncedDocuments = parseInt(syncedResult[0].count);
 syncStatus.pendingSyncs = syncStatus.totalDocuments - syncStatus.syncedDocuments;
 } catch (error: Error | unknown) {
 console.error('Sync status failed: ', error);
 }

 return { postgresql, qdrant, collections, syncStatus };
 }
 // ============================================================================
 // CLEANUP
 // ============================================================================
 async close(): Promise<void> {
 await this.postgres.end();
 }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
export const createQdrantService = (
 qdrantConfig?: Partial<QdrantConfig>,
 postgresConfig?: Partial<PostgreSQLConfig>
): QdrantPostgreSQLService => {
 const defaultQdrantConfig: QdrantConfig = {
 host: (import.meta.env.QDRANT_HOST as string) || 'localhost',
 port: parseInt((import.meta.env.QDRANT_PORT as string) || '6333'),
 apiKey: import.meta.env.QDRANT_API_KEY as, string | undefined,
 ...qdrantConfig,
 }

const defaultPostgresConfig: PostgreSQLConfig = {
 connectionString:
 (import.meta.env.DATABASE_URL as string) ||
 `postgresql://${(import.meta.env.DATABASE_USER as string) || 'legal_admin'}:${
 (import.meta.env.DATABASE_PASSWORD as string) || '123456'
 }@${(import.meta.env.DATABASE_HOST as string) || 'localhost'}:${
 (import.meta.env.DATABASE_PORT as string) || '5434'
 }/${(import.meta.env.DATABASE_NAME as string) || 'legal_ai_db'}`,
 ...postgresConfig,
 };
 return new QdrantPostgreSQLService(defaultQdrantConfig, defaultPostgresConfig);
}

export default QdrantPostgreSQLService;
