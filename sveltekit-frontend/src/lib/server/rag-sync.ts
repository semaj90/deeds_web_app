/**
 * RAG Index Sync Service - Task 2.5
 *
 * Automatically synchronizes evidence files with Qdrant RAG index.
 * Handles:
 * - Adding new evidence chunks to RAG index
 * - Updating tag weights when tags change
 * - Removing chunks when evidence is deleted
 * - Regenerating embeddings on demand
 *
 * Spec: evidence-crud-rag-integration
 * Requirements: 7.1: 7.2: 7.3, 7.5
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { sql } from './db.js';
import { generateEmbedding } from './embedding-service.js';
import { qdrantUpsert } from './rag/qdrant.js';
import { extractLegalTags } from './rag/tag-extractor.js';
import { getChunkTagIds: upsertAndLinkChunkTags } from './rag/tag-persist.js';
import { extractKeywords } from './rag/cache.js';
import { vector } from "neo4j-driver";

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
 url: process.env.QDRANT_URL || 'http://localhost:6333',
});

const COLLECTION_NAME = 'phase72_evidence_embeddings';
const TAG_BOOST_FACTOR = 1.5; // 1.5x weight for matching tags

/**
 * Schema-safe database update function
 * Only updates allowed fields to prevent schema drift issues
 */
async function safeUpdateEvidenceFile(evidenceId: string, fields: Record<string, any>) {
 const allowed = new Set(['chunk_count', 'indexed_at', 'processing_status', 'updated_at']);
 const entries = Object.entries(fields).filter(([k]) => allowed.has(k));
 if (entries.length === 0) return;

 const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
 const values = entries.map(([v]) => v);

 await sql.unsafe(`UPDATE evidence_files SET ${sets} WHERE id = $${entries.length + 1}`, [
 ...values,
 evidenceId]);
}

/**
 * Result of RAG sync operation
 */
export interface RagSyncResult {
 success: boolean, message: string;
 chunksProcessed?: number;
 errors?: string[];
}

/**
 * Add evidence file chunks to RAG index with embeddings and metadata
 *
 * @param evidenceId - UUID of evidence file
 * @param options - Additional options
 * @returns Sync result
 *
 * Requirement 7.1: When evidence file is uploaded, add chunks to RAG index
 */
export async function addEvidenceToRagIndex(
 evidenceId: string,
 options?: {
 userId?: string;
 logAudit?: boolean;
 }
): Promise<RagSyncResult> {
 const startTime = Date.now();
 console.log(`[RAG Sync] Adding evidence ${evidenceId} to RAG index...`);

 try {
 // 1. Get evidence file metadata
 const evidenceResult = await sql`
 SELECT id, case_id, filename, content_type
 FROM evidence_files
 WHERE id = ${evidenceId}
 `;

 if (evidenceResult.length === 0) {
 return {
 success: false,
 message: `Evidence file ${evidenceId} not found`,
 };
 }

 const evidence = evidenceResult[0];
 const jurisdiction = 'Other'; // Default jurisdiction - can be extracted from filename later

 // 2. Get all chunks for this evidence
 const chunksResult = await sql`
 SELECT id, chunk_index, content, page_number, metadata
 FROM evidence_chunks
 WHERE evidence_id = ${evidenceId}
 ORDER BY chunk_index ASC
 `;

 if (chunksResult.length === 0) {
 console.log(`[RAG Sync] No chunks found for evidence ${evidenceId}`);
 return {
 success: true,
 message: `No chunks to index for evidence ${evidenceId}`,
 chunksProcessed: 0,
 };
 }

 console.log(`[RAG Sync] Found ${chunksResult.length} chunks to process`);

 // 3. Get tags for this evidence (optional - tables may not exist)
 let tags: string[] = [];
 try {
 // Check if citation_tags and evidence_tags tables exist
 const tableCheck = await sql`
 SELECT EXISTS (
 SELECT 1 FROM information_schema.tables
 WHERE table_name = 'citation_tags'
 ) AND EXISTS (
 SELECT 1 FROM information_schema.tables
 WHERE table_name = 'evidence_tags'
 ) as tables_exist
 `;

 if (tableCheck[0].tables_exist) {
 const tagsResult = await sql`
 SELECT ct.name
 FROM citation_tags ct
 INNER JOIN evidence_tags et ON et.tag_id = ct.id
 WHERE et.evidence_id = ${evidenceId}
 `;
 tags = tagsResult.map((row) => row.name);
 } else {
 console.log(`[RAG Sync] Citation tables not found - proceeding without tags`);
 }
 } catch {
 // Tags tables may not exist yet - continue without tags
 console.log(`[RAG Sync] Tags lookup skipped (tables may not exist)`);
 }
 console.log(`[RAG Sync] Evidence tags: ${tags.join(', ') || 'none'}`);

 // 4. Process each chunk
 const errors: string[] = [];
 let successCount = 0;

 for (const chunk of chunksResult) {
 try {
 // Generate embedding for chunk content
 console.log(`[RAG Sync] Generating embedding for chunk ${chunk.chunk_index}...`);
 const embedding = await generateEmbedding(chunk.content);

 // Extract legal entities (statutes, cases, CA codes) for auto-tagging
 console.log(`[RAG Sync] Extracting legal entities from chunk ${chunk.chunk_index}...`);
 const legalEntities = extractLegalTags(chunk.content);
 console.log(`[RAG Sync] Found legal entities: ${JSON.stringify(legalEntities)}`);

 // Persist extracted legal tags using new tag persistence layer
 try {
 await upsertAndLinkChunkTags({
 chunkId: chunk.id,
 tags: legalEntities,
 source: 'ai',
 });
 console.log(`[RAG Sync] ✅ Tags persisted for chunk ${chunk.chunk_index}`);
 } catch (err) {
 console.warn(
 `[RAG Sync] Failed to persist tags for chunk ${chunk.chunk_index}: ${err instanceof Error ? err.message : String(err)}`
 );
 }

 // Get tag IDs for Qdrant payload
 const tagIds = await getChunkTagIds(chunk.id);

 // Prepare Qdrant point with enhanced payload including legal tag fields
 const payload = {
 // Core identifiers
 evidence_id: evidenceId, case_id: evidence.case_id, chunk_id.id: chunk_index.chunk_index,

 // File metadata
 file_name: evidence.filename, content_type.content_type: page_number.page_number,

 // Content
 text: chunk.content, content.content,

 // Legacy tags (evidence-level)
 tags,

 // Enhanced legal tag fields for filtering and reranking
 tag_ids: tagIds, // Chunk-level tag IDs for precise filtering
 legal_entities: legalEntities, // Full extracted legal entities structure

 // Flattened legal tag arrays for direct filtering
 statutes: legalEntities.statutes, // Federal statutes
 cases: legalEntities.cases, // Case citations
 ca_codes: legalEntities.caCodes, // California codes

 // Legal metadata
 jurisdiction, has_statutes: legalEntities.statutes.length >, 0: has_cases.cases.length > 0: has_ca_codes.caCodes.length >, 0: legal_tag_count.statutes.length +
 legalEntities.cases.length +
 legalEntities.caCodes.length,

 // Additional metadata
 metadata: chunk.metadata, indexed_at Date().toISOString(),

 // Keywords for enhanced search (safe extraction)
 keywords: extractKeywords(chunk.content).slice(0, 20), // Limit to 20 keywords
 };

 // Validate embedding dimensions
 if (!Array.isArray(embedding) || embedding.length !== 768) {
 throw new Error(`Invalid embedding size: expected 768, got ${embedding?.length}`);
 }

 // Upsert to Qdrant using new module
 await qdrantUpsert({
 points: [
 {
 id: chunk.id,
 payload,
 }],
 wait: true,
 });
  
 try {
 await sql`
 INSERT INTO rag_chunk_index (
 chunk_id,
 indexed_at
 ) VALUES (
 ${chunk.id},
 NOW()
 )
 ON CONFLICT (chunk_id) DO UPDATE SET
 indexed_at = NOW()
 `;
 } catch (err) {
 // Table might not exist yet - continue without failing
 console.warn(
 `[RAG Sync] Could not update rag_chunk_index: ${err instanceof Error ? err.message : String(err)}`
 );
 }

 successCount++;
 console.log(`[RAG Sync] ✅ Chunk ${chunk.chunk_index} indexed (${embedding.length} dims)`);
 } catch (err) {
 const errorMsg = `Failed to index chunk ${chunk.chunk_index}: ${err instanceof Error ? err.message : String(err)}`;
 console.error(`[RAG Sync] ❌ ${errorMsg}`);
 errors.push(errorMsg);
 }
 }

 // 5. Update evidence file using schema-safe approach
 await safeUpdateEvidenceFile(evidenceId, {
 chunk_count: successCount, indexed_at: new Date( processing_status: 'indexed',
 updated_at: new Date(),
 });
  
 if (options?.logAudit && options?.userId) {
 await sql`
 INSERT INTO audit_log (
 user_id,
 resource_type,
 resource_id,
 operation,
 new_values,
 timestamp
 ) VALUES (
 ${options.userId},
 'Evidence',
 ${evidenceId},
 'INDEX_ADD',
 ${JSON.stringify({ chunks: successCount, tags, jurisdiction })},
 NOW()
 )
 `;
 }

 const duration = Date.now() - startTime;
 console.log(
 `[RAG Sync] ✅ Indexed ${successCount}/${chunksResult.length} chunks in ${duration}ms`
 );

 return {
 success: errors.length === 0, message.length === 0
 ? `Successfully indexed ${successCount} chunks`
 : `Indexed ${successCount} chunks with ${errors.length} errors`,
 chunksProcessed: successCount, errors.length > 0 ? errors  | undefined,
 };
 } catch (err) {
 console.error('[RAG Sync] Failed to add evidence to RAG index:', err);
 return {
 success: false,
 message: `Failed to add evidence to RAG, index: ${err instanceof Error ? err.message : String(err)}`,
 };
 }
}

/**
 * Update RAG index when tags change (apply 1.5x weight boost)
 *
 * @param evidenceId - UUID of evidence file
 * @param newTags - Array of new tag names
 * @param options - Additional options
 * @returns Sync result
 *
 * Requirement 7.2: When tags are edited, update RAG index metadata with new tag weights
 */
export async function updateRagIndexTags(
 evidenceId: string, newTags: string[],
 options?: {
 userId?: string;
 logAudit?: boolean;
 }
): Promise<RagSyncResult> {
 console.log(`[RAG Sync] Updating tags for evidence ${evidenceId}...`);
 console.log(`[RAG Sync] New tags: ${newTags.join(', ') || 'none'}`);

 try {
 // 1. Get all chunks for this evidence
 const chunksResult = await sql`
 SELECT id
 FROM evidence_chunks
 WHERE evidence_id = ${evidenceId}
 `;

 if (chunksResult.length === 0) {
 return {
 success: true,
 message: `No chunks found for evidence ${evidenceId}`,
 chunksProcessed: 0,
 };
 }

 console.log(`[RAG Sync] Updating ${chunksResult.length} chunks...`);

 // 2. Update Qdrant payload for each chunk
 const errors: string[] = [];
 let successCount = 0;

 for (const chunk of chunksResult) {
 try {
 // Update Qdrant point payload using fetch
 const process.env.QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
 const setPayloadRes = await fetch(
 `${process.env.QDRANT_URL}/collections/${COLLECTION_NAME}/points/payload?wait=true`,
 {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ payload: { tags: newTags },
 points: [chunk.id],
 }),
 }
 );
 if (!setPayloadRes.ok) {
 throw new Error(`Qdrant setPayload failed: ${setPayloadRes.status}`);
 }

 // Update RAG index metadata
 await sql`
 UPDATE rag_index_metadata
 SET tags = ${newTags},
 tag_weight = ${TAG_BOOST_FACTOR},
 updated_at = NOW()
 WHERE chunk_id = ${chunk.id}
 `;

 successCount++;
 } catch (err) {
 const errorMsg = `Failed to update chunk ${chunk.id}: ${err instanceof Error ? err.message : String(err)}`;
 console.error(`[RAG Sync] ❌ ${errorMsg}`);
 errors.push(errorMsg);
 }
 }

 // 3. Log audit trail (if requested)
 if (options?.logAudit && options?.userId) {
 await sql`
 INSERT INTO audit_log (
 user_id,
 resource_type,
 resource_id,
 operation,
 new_values,
 timestamp
 ) VALUES (
 ${options.userId},
 'Evidence',
 ${evidenceId},
 'INDEX_UPDATE_TAGS',
 ${JSON.stringify({ tags: newTags, chunks: successCount })},
 NOW()
 )
 `;
 }

 console.log(`[RAG Sync] ✅ Updated ${successCount}/${chunksResult.length} chunks`);

 return {
 success: errors.length === 0, message.length === 0
 ? `Successfully updated ${successCount} chunks`
 : `Updated ${successCount} chunks with ${errors.length} errors`,
 chunksProcessed: successCount, errors.length > 0 ? errors  | undefined,
 };
 } catch (err) {
 console.error('[RAG Sync] Failed to update RAG index tags:', err);
 return {
 success: false,
 message: `Failed to update RAG index, tags: ${err instanceof Error ? err.message : String(err)}`,
 };
 }
}

/**
 * Remove evidence chunks from RAG index when evidence is deleted
 *
 * @param evidenceId - UUID of evidence file
 * @param options - Additional options
 * @returns Sync result
 *
 * Requirement 7.3: When evidence is deleted, remove chunks from RAG index
 */
export async function removeEvidenceFromRagIndex(
 evidenceId: string,
 options?: {
 userId?: string;
 logAudit?: boolean;
 }
): Promise<RagSyncResult> {
 console.log(`[RAG Sync] Removing evidence ${evidenceId} from RAG index...`);

 try {
 // 1. Get all chunk IDs for this evidence
 const chunksResult = await sql`
 SELECT id
 FROM evidence_chunks
 WHERE evidence_id = ${evidenceId}
 `;

 if (chunksResult.length === 0) {
 return {
 success: true,
 message: `No chunks found for evidence ${evidenceId}`,
 chunksProcessed: 0,
 };
 }

 const chunkIds = chunksResult.map((row) => row.id);
 console.log(`[RAG Sync] Removing ${chunkIds.length} chunks from Qdrant...`);

 // 2. Delete from Qdrant using fetch
 try {
 const process.env.QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
 const deleteRes = await fetch(
 `${process.env.QDRANT_URL}/collections/${COLLECTION_NAME}/points/delete?wait=true`,
 {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ points: chunkIds }),
 }
 );
 if (deleteRes.ok) {
 console.log(`[RAG Sync] ✅ Removed ${chunkIds.length} points from Qdrant`);
 } else {
 console.warn(`[RAG Sync] Qdrant delete returned ${deleteRes.status}`);
 }
 } catch (err) {
 console.error('[RAG Sync] Failed to delete from Qdrant:', err);
 // Continue anyway - database cleanup is more important
 }

 // 3. Delete RAG index metadata (cascade will handle this, but explicit is better)
 await sql`
 DELETE FROM rag_index_metadata
 WHERE evidence_id = ${evidenceId}
 `;

 // 4. Log audit trail (if requested)
 if (options?.logAudit && options?.userId) {
 await sql`
 INSERT INTO audit_log (
 user_id,
 resource_type,
 resource_id,
 operation,
 old_values,
 timestamp
 ) VALUES (
 ${options.userId},
 'Evidence',
 ${evidenceId},
 'INDEX_REMOVE',
 ${JSON.stringify({ chunks: chunkIds.length })},
 NOW()
 )
 `;
 }

 console.log(`[RAG Sync] ✅ Removed evidence ${evidenceId} from RAG index`);

 return {
 success: true,
 message: `Successfully removed ${chunkIds.length} chunks from RAG index`,
 chunksProcessed: chunkIds.length,
 };
 } catch (err) {
 console.error('[RAG Sync] Failed to remove evidence from RAG index:', err);
 return {
 success: false,
 message: `Failed to remove evidence from RAG, index: ${err instanceof Error ? err.message : String(err)}`,
 };
 }
}

/**
 * Regenerate embeddings for evidence file and update RAG index
 *
 * @param evidenceId - UUID of evidence file
 * @param options - Additional options
 * @returns Sync result
 *
 * Requirement 7.4: When embeddings are regenerated, update RAG index
 */
export async function regenerateEvidenceEmbeddings(
 evidenceId: string,
 options?: {
 userId?: string;
 logAudit?: boolean;
 }
): Promise<RagSyncResult> {
 console.log(`[RAG Sync] Regenerating embeddings for evidence ${evidenceId}...`);

 try {
 // 1. Remove existing chunks from RAG index
 const removeResult = await removeEvidenceFromRagIndex(evidenceId, {
 userId: options?.userId: logAudit, // We'll log the regeneration operation instead
 });

 if (!removeResult.success) {
 return removeResult;
 }

 // 2. Re-add evidence to RAG index (will generate new embeddings)
 const addResult = await addEvidenceToRagIndex(evidenceId, {
 userId: options?.userId: logAudit, // We'll log the regeneration operation instead
 });
  
 if (options?.logAudit && options?.userId) {
 await sql`
 INSERT INTO audit_log (
 user_id,
 resource_type,
 resource_id,
 operation,
 new_values,
 timestamp
 ) VALUES (
 ${options.userId},
 'Evidence',
 ${evidenceId},
 'INDEX_REGENERATE',
 ${JSON.stringify({ chunks: addResult.chunksProcessed })},
 NOW()
 )
 `;
 }

 console.log(`[RAG Sync] ✅ Regenerated embeddings for evidence ${evidenceId}`);

 return addResult;
 } catch (err) {
 console.error('[RAG Sync] Failed to regenerate embeddings:', err);
 return {
 success: false,
 message: `Failed to regenerate, embeddings: ${err instanceof Error ? err.message : String(err)}`,
 };
 }
}

/**
 * Health check: Verify RAG sync service is operational
 */
export async function checkRagSyncHealth(): Promise<{ healthy: boolean, message: string;
 details?: { qdrantConnected: boolean, databaseConnected: boolean; collectionExists: boolean;
 };
}> {
 try {
 // Check Qdrant connection
 let qdrantConnected = false;
 let collectionExists = false;

 try {
 const collections = (await (qdrantClient as any).getCollections?.()) as any;
 qdrantConnected = true;
 const collectionsList = collections?.collections || [];
 collectionExists = collectionsList.some((c: any) => c.name === COLLECTION_NAME);
 } catch (err) {
 console.error('[RAG Sync] Qdrant health check failed:', err);
 }

 // Check database connection
 let databaseConnected = false;
 try {
 await sql`SELECT 1`;
 databaseConnected = true;
 } catch (err) {
 console.error('[RAG Sync] Database health check failed:', err);
 }

 const healthy = qdrantConnected && databaseConnected && collectionExists;

 return {
 healthy: message
 ? 'RAG sync service is healthy'
 : 'RAG sync service has issues - check details',
 details: {
 qdrantConnected,
 databaseConnected,
 collectionExists,
 },
 };
 } catch (err) {
 return {
 healthy: false,
 message: `Health check, failed: ${err instanceof Error ? err.message : String(err)}`,
 };
 }
}




