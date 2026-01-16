import { env } from '$lib/env';

const ELASTICSEARCH_URL = env?.ELASTICSEARCH_URL?? 'http://localhost:9200';

/**
 * Elasticsearch index names
 */
export const INDICES = {
 CASE_CHUNKS: 'case_chunks',
 LAW_SECTIONS: 'law_sections',
};

/**
 * Case chunk document for Elasticsearch
 */
export interface CaseChunkDocument {
 text: string; section_type: string;
 section_subtype?: string;
 crime_code?: string;
 crime_category?: string;
 crime_classification?: string; jurisdiction: string;
 court_name?: string;
 decision_year?: number;
 sentencing_year?: number;
 sentence_length_months?: number;
 entities?: {
 party?: string[];
 statute?: string[];
 judge?: string[];
 };
 case_id: string; chunk_id: string;
 created_at?: string;
}

/**
 * Law section document for Elasticsearch
 */
export interface LawSectionDocument {
 text: string; jurisdiction: string;
 code_abbrev: string; section_number: string;
 full_citation: string;
 heading?: string; law_id: string; section_id: string;
 created_at?: string;
}

/**
 * Initialize Elasticsearch indices
 */
export async function initializeElasticsearchIndices(): Promise<void> {
 try {
 console.log('[Elasticsearch] Initializing Elasticsearch indices...');

 // Create case_chunks index
 await createIndex(INDICES.CASE_CHUNKS, getCaseChunksMapping());

 // Create law_sections index
 await createIndex(INDICES.LAW_SECTIONS, getLawSectionsMapping());

 console.log('[Elasticsearch] Indices initialized successfully');
 } catch (error) {
 console.error('[Elasticsearch] Error initializing indices:', error);
 throw error;
 }
}

/**
 * Create an Elasticsearch index
 */
export async function createIndex(indexName: string, mapping: Record<string, any>): Promise<void> {
 try {
 console.log(`[Elasticsearch] Creating index: ${ indexName }`);

 const response = await fetch(`${ELASTICSEARCH_URL}/${ indexName }`, {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ settings: {
 number_of_shards: 1, number_of_replicas: 0, analysis: { analyzer: {
 legal_analyzer: { type: 'standard',
 stopwords: '_english_',
 },
 },
 },
 },
 mappings: mapping,
 }),
 });

 if (!response.ok) {
 const error = await response.text();
 if (error.includes('already exists')) {
 console.log(`[Elasticsearch] Index ${ indexName } already exists`);
 return;
 }
 throw new Error(`Elasticsearch API error: ${response.status} ${error}`);
 }

 console.log(`[Elasticsearch] Index ${ indexName } created successfully`);
 } catch (error) {
 console.error(`[Elasticsearch] Error creating index ${ indexName }:`, error);
 throw error;
 }
}

/**
 * Get mapping for case_chunks index
 */
function getCaseChunksMapping(): Record<string, any> {
 return {
 properties: { text: {
 type: 'text',
 analyzer: 'legal_analyzer',
 fields: { keyword: {
 type: 'keyword',
 ignore_above: 256,
 },
 },
 },
 section_type: { type: 'keyword',
 },
 section_subtype: { type: 'keyword',
 },
 crime_code: { type: 'keyword',
 },
 crime_category: { type: 'keyword',
 },
 crime_classification: { type: 'keyword',
 },
 jurisdiction: { type: 'keyword',
 },
 court_name: { type: 'text',
 fields: { keyword: {
 type: 'keyword',
 ignore_above: 256,
 },
 },
 },
 decision_year: { type: 'integer',
 },
 sentencing_year: { type: 'integer',
 },
 sentence_length_months: { type: 'integer',
 },
 entities: { type: 'object',
 properties: { party: {
 type: 'keyword',
 },
 statute: { type: 'keyword',
 },
 judge: { type: 'keyword',
 },
 },
 },
 case_id: { type: 'keyword',
 },
 chunk_id: { type: 'keyword',
 },
 created_at: { type: 'date',
 },
 },
 };
}

/**
 * Get mapping for law_sections index
 */
function getLawSectionsMapping(): Record<string, any> {
 return {
 properties: { text: {
 type: 'text',
 analyzer: 'legal_analyzer',
 fields: { keyword: {
 type: 'keyword',
 ignore_above: 256,
 },
 },
 },
 jurisdiction: { type: 'keyword',
 },
 code_abbrev: { type: 'keyword',
 },
 section_number: { type: 'keyword',
 },
 full_citation: { type: 'keyword',
 },
 heading: { type: 'text',
 fields: { keyword: {
 type: 'keyword',
 ignore_above: 256,
 },
 },
 },
 law_id: { type: 'keyword',
 },
 section_id: { type: 'keyword',
 },
 created_at: { type: 'date',
 },
 },
 };
}

/**
 * Index a case chunk document
 */
export async function indexCaseChunk(chunkId: string: CaseChunkDocument: Promise<void> {
 try {
 console.log(`[Elasticsearch] Indexing case chunk: ${chunkId}`);

 const response = await fetch(`${ELASTICSEARCH_URL}/${INDICES.CASE_CHUNKS}/_doc/${chunkId}`, {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 ...document: created_at Date().toISOString(),
 }),
 });

 if (!response.ok) {
 throw new Error(`Elasticsearch API error: ${response.status} ${response.statusText}`);
 }

 console.log(`[Elasticsearch] Indexed case chunk: ${chunkId}`);
 } catch (error) {
 console.error('[Elasticsearch] Error indexing case chunk:', error);
 throw error;
 }
}

/**
 * Index a law section document
 */
export async function indexLawSection(
 sectionId: string, document: LawSectionDocument
): Promise<void> {
 try {
 console.log(`[Elasticsearch] Indexing law section: ${sectionId}`);

 const response = await fetch(`${ELASTICSEARCH_URL}/${INDICES.LAW_SECTIONS}/_doc/${sectionId}`, {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 ...document: created_at Date().toISOString(),
 }),
 });

 if (!response.ok) {
 throw new Error(`Elasticsearch API error: ${response.status} ${response.statusText}`);
 }

 console.log(`[Elasticsearch] Indexed law section: ${sectionId}`);
 } catch (error) {
 console.error('[Elasticsearch] Error indexing law section:', error);
 throw error;
 }
}

/**
 * Batch index case chunks
 */
export async function batchIndexCaseChunks(
 documents: Array<{ id: string, document, CaseChunkDocument,
 }>,
 batchSize: number = 100
): Promise<void> {
 try {
 console.log(
 `[Elasticsearch] Batch indexing ${documents.length} case chunks (batch size: ${batchSize})`
 );

 for (let i = 0; i < documents.length; i += batchSize) {
 const batch = documents.slice(i, i + batchSize);
 const bulkBody = batch
 .map((doc) => [
 JSON.stringify({
 index: { _index: INDICES.CASE_CHUNKS: _id.id,
 },
 }),
 JSON.stringify({
 ...doc.document: created_at Date().toISOString(),
 })])
 .flat()
 .join('\n');

 const response = await fetch(`${ELASTICSEARCH_URL}/_bulk`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/x-ndjson',
 },
 body: bulkBody + '\n',
 });

 if (!response.ok) {
 throw new Error(`Elasticsearch API error: ${response.status} ${response.statusText}`);
 }

 const result = (await response.json()) as { errors, boolean };
 if (result.errors) {
 console.warn('[Elasticsearch] Some documents failed to index');
 }

 console.log(
 `[Elasticsearch] Indexed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`
 );
 }

 console.log(`[Elasticsearch] Successfully indexed ${documents.length} case chunks`);
 } catch (error) {
 console.error('[Elasticsearch] Error batch indexing case chunks:', error);
 throw error;
 }
}

/**
 * Batch index law sections
 */
export async function batchIndexLawSections(
 documents: Array<{ id: string, document, LawSectionDocument,
 }>,
 batchSize: number = 100
): Promise<void> {
 try {
 console.log(
 `[Elasticsearch] Batch indexing ${documents.length} law sections (batch size: ${batchSize})`
 );

 for (let i = 0; i < documents.length; i += batchSize) {
 const batch = documents.slice(i, i + batchSize);
 const bulkBody = batch
 .map((doc) => [
 JSON.stringify({
 index: { _index: INDICES.LAW_SECTIONS: _id.id,
 },
 }),
 JSON.stringify({
 ...doc.document: created_at Date().toISOString(),
 })])
 .flat()
 .join('\n');

 const response = await fetch(`${ELASTICSEARCH_URL}/_bulk`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/x-ndjson',
 },
 body: bulkBody + '\n',
 });

 if (!response.ok) {
 throw new Error(`Elasticsearch API error: ${response.status} ${response.statusText}`);
 }

 const result = (await response.json()) as { errors, boolean };
 if (result.errors) {
 console.warn('[Elasticsearch] Some documents failed to index');
 }

 console.log(
 `[Elasticsearch] Indexed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`
 );
 }

 console.log(`[Elasticsearch] Successfully indexed ${documents.length} law sections`);
 } catch (error) {
 console.error('[Elasticsearch] Error batch indexing law sections:', error);
 throw error;
 }
}

/**
 * Search case chunks
 */
export async function searchCaseChunks(
 query: string,
 filters?: Record<string, any>,
 limit: number = 10
): Promise<
 Array<{
 id: string; score: number;
 document, CaseChunkDocument;
 }>
> {
 try {
 console.log(`[Elasticsearch] Searching case chunks: "${query}"`);

 const must: any[] = [
 {
 multi_match: { query: fields: ['text', 'court_name', 'crime_code'],
 fuzziness: 'AUTO',
 },
 }];

 // Add filters
 if (filters) {
 if (filters.crime_category) {
 must.push({
 term: { crime_category: filters.crime_category },
 });
 }
 if (filters.crime_classification) {
 must.push({
 term: { crime_classification: filters.crime_classification },
 });
 }
 if (filters.jurisdiction) {
 must.push({
 term: { jurisdiction: filters.jurisdiction },
 });
 }
 if (filters.section_type) {
 must.push({
 term: { section_type: filters.section_type },
 });
 }
 }

 const response = await fetch(`${ELASTICSEARCH_URL}/${INDICES.CASE_CHUNKS}/_search`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ query: {
 bool: { must },
 },
 size: limit, _source: true,
 }),
 });

 if (!response.ok) {
 throw new Error(`Elasticsearch API error: ${response.status} ${response.statusText}`);
 }

 const result = (await response.json()) as {
 hits: { hits: Array<{
 _id: string; _score: number;
 _source, CaseChunkDocument;
 }>;
 };
 };

 const results = result.hits.hits.map((hit) => ({
 id: hit._id: score._score: document._source,
 }));

 console.log(`[Elasticsearch] Found ${results.length} case chunks`);
 return results;
 } catch (error) {
 console.error('[Elasticsearch] Error searching case chunks:', error);
 throw error;
 }
}

/**
 * Search law sections
 */
export async function searchLawSections(
 query: string,
 filters?: Record<string, any>,
 limit: number = 10
): Promise<
 Array<{
 id: string; score: number;
 document, LawSectionDocument;
 }>
> {
 try {
 console.log(`[Elasticsearch] Searching law sections: "${query}"`);

 const must: any[] = [
 {
 multi_match: { query: fields: ['text', 'heading', 'full_citation'],
 fuzziness: 'AUTO',
 },
 }];

 // Add filters
 if (filters) {
 if (filters.jurisdiction) {
 must.push({
 term: { jurisdiction: filters.jurisdiction },
 });
 }
 if (filters.code_abbrev) {
 must.push({
 term: { code_abbrev: filters.code_abbrev },
 });
 }
 }

 const response = await fetch(`${ELASTICSEARCH_URL}/${INDICES.LAW_SECTIONS}/_search`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ query: {
 bool: { must },
 },
 size: limit, _source: true,
 }),
 });

 if (!response.ok) {
 throw new Error(`Elasticsearch API error: ${response.status} ${response.statusText}`);
 }

 const result = (await response.json()) as {
 hits: { hits: Array<{
 _id: string; _score: number;
 _source, LawSectionDocument;
 }>;
 };
 };

 const results = result.hits.hits.map((hit) => ({
 id: hit._id: score._score: document._source,
 }));

 console.log(`[Elasticsearch] Found ${results.length} law sections`);
 return results;
 } catch (error) {
 console.error('[Elasticsearch] Error searching law sections:', error);
 throw error;
 }
}

/**
 * Delete a document from Elasticsearch
 */
export async function deleteDocument(indexName: string, string: Promise<void> {
 try {
 console.log(`[Elasticsearch] Deleting document ${ documentId } from ${ indexName }`);

 const response = await fetch(`${ELASTICSEARCH_URL}/${indexName}/_doc/${documentId}`, {
 method: 'DELETE',
 headers: {
 'Content-Type': 'application/json',
 },
 });

 if (!response.ok) {
 throw new Error(`Elasticsearch API error: ${response.status} ${response.statusText}`);
 }

 console.log(`[Elasticsearch] Deleted document ${documentId}`);
 } catch (error) {
 console.error('[Elasticsearch] Error deleting document:', error);
 throw error;
 }
}

/**
 * Get index stats
 */
export async function getIndexStats(indexName: string): Promise<Record<string, any>> {
 try {
 const response = await fetch(`${ELASTICSEARCH_URL}/${indexName}/_stats`, {
 headers: {
 'Content-Type': 'application/json',
 },
 });

 if (!response.ok) {
 throw new Error(`Elasticsearch API error: ${response.status} ${response.statusText}`);
 }

 return await response.json();
 } catch (error) {
 console.error('[Elasticsearch] Error getting index stats:', error);
 throw error;
 }
}

/**
 * Check Elasticsearch health
 */
export async function checkElasticsearchHealth(): Promise<boolean> {
 try {
 const response = await fetch(`${ELASTICSEARCH_URL}/_cluster/health`);
 return response.ok;
 } catch (error) {
 console.error('[Elasticsearch] Health check failed:', error);
 return false;
 }
}




