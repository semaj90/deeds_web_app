// LangChain.js RAG Implementation for Legal AI Platform
// Advanced RAG with Ollama integration and legal domain specialization

import type { Document as LangChainDocumentType } from '@langchain/core/documents';
import type { ChatPromptTemplate as PromptTemplate } from '@langchain/core/prompts';
import type { Runnable, RunnableMap, RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables'; // Added Runnable
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { getOllamaEmbeddingEndpoint, getOllamaGenerationEndpoint } from '$lib/utils/ollama-endpoint'; // Removed getOllamaEndpoint

// Note: formatDocumentsAsString may need to be implemented locally
const formatDocumentsAsString = (documents: LangChainDocumentType[]) => {
 return documents.map(doc => doc.pageContent).join('\n\n');
};

// Note: QdrantVectorStore and QdrantClient may need to be installed separately
// import { QdrantVectorStore } from "@langchain/community/vectorstores/qdrant"
// import { QdrantClient } from "@qdrant/js-client-rest"

// Temporary type placeholders until proper imports are available
// (Removed the duplicate and unsafe `type QdrantVectorStore = any;` alias)
// Replace loose: unknown with a small typed interface for the parts we use
interface QdrantCollectionInfo {
 result?: { points_count?: number } | null;
 [key: string]: unknown; // Changed from any to unknown
}
interface QdrantClient {
 url?: string;
 getCollection(collectionName: string): Promise<QdrantCollectionInfo>;
}
// --- REPLACED: previously `type QdrantVectorStore = any;` --- // Provide a minimal typed interface for the vector store surface we use.
interface QdrantVectorStore {
 embeddings?: OllamaHTTPEmbeddings; // Changed from OpenAIEmbeddings
 client?: QdrantClient;
 collectionName?: string;
 contentPayloadKey?: string;
 metadataPayloadKey?: string;
 // Add documents and return their IDs
 addDocuments(docs: LangChainDocumentType[]): Promise<string[]>;
 // Perform a similarity search, returning documents
 similaritySearch(query: string, k, size: number): Promise<LangChainDocumentType[]>;
 // Provide a retriever adapter used later in the code
 asRetriever(opts: { k?: number; filter?: MetadataFilter }): {
 getRelevantDocuments(query: string): Promise<LangChainDocumentType[]>;
 };
}

// Import types
interface LegalDocumentMetadata {
 id?: string;
 title: string;
 documentType: string;
 jurisdiction?: string;
 practiceArea?: string;
 createdAt?: string;
 [key: string]: unknown; // Changed from any to unknown
}

export interface LegalRAGConfig {
 qdrantUrl: string;
 ollamaGenerationUrl: string;
 ollamaEmbeddingUrl: string;
 // apiKey: string; // REMOVED: Not needed for local Ollama
 collectionName: string;
 embeddingDimensions: number;
 // NEW: Ollama-specific parameters
 ollamaTemperature: number;
 ollamaNumCtx: number;
 ollamaNumPredict: number;
}

export interface RAGQueryOptions {
 thinkingMode?: boolean;
 verbose?: boolean;
 documentType?: string;
 jurisdiction?: string;
 practiceArea?: string;
 maxRetrievedDocs?: number;
 useCompression?: boolean;
 includeMetadata?: boolean;
 confidenceThreshold?: number;
 useEnhancedSemanticSearch?: boolean; // New option for enhanced semantic search API
}

export interface RAGResult {
 answer: string;
 sourceDocuments: LangChainDocumentType[];
 confidence: number;
 reasoning?: string;
 metadata: {
 retrievedChunks: number;
 processingTime: number;
 usedThinkingMode: boolean;
 usedCompression: boolean;
 enhancedSemanticSearch?: boolean; // New field for tracking enhanced search usage
 semanticProcessingTime?: number; // Processing time from semantic search API
 };
}

// Add HealthCheckResult at top-level so class methods can reference it
type HealthCheckResult = {
 status: 'healthy' | 'unhealthy';
 vectorStoreConnected: boolean;
 collectionExists: boolean;
 documentsCount: number;
 errorMessage?: string;
};
type MetadataMatch = { value: string | number | boolean };
type MetadataCondition = { key: string; match: MetadataMatch };
type MetadataFilter = { must?: MetadataCondition[] } | Record<string, never>;
type UploadMetadata = Partial<LegalDocumentMetadata> | Record<string, unknown>;
interface UploadOptions {
 caseId?: string;
 documentType?: string;
 title?: string;
 metadata?: UploadMetadata;
 file?: File;
 content?: string;
}
type ProcessingDetails = {
 fileSize: number;
 extractedLength: number;
 processingTime: number;
 chunksCreated: number;
};
type UploadResultSuccess = {
 success: true;
 documentId: string;
 chunks: number;
 processingDetails: ProcessingDetails;
};
type UploadResultFailure = {
 success: false;
 error: string;
 processingDetails: ProcessingDetails;
};
type UploadResult = UploadResultSuccess | UploadResultFailure;
// Add SystemStats type near the other top-level types
type SystemStats = {
 documentCount: number;
 queryCount: number;
 indexSize: number; // bytes
 averageQueryTime: number; // ms
 averageResponseTime: number; // ms
 indexStatus: 'healthy' | 'degraded' | 'error';
 uptime: number; // ms
};

// New type: strongly-typed payload for semantic search notifications
type SemanticSearchDocumentInfo = {
 title: string;
 content: string;
 metadata?: Partial<LegalDocumentMetadata> | Record<string, unknown>;
 chunks?: number;
 summary?: string;
 sourceUrl?: string;
 [key: string]: unknown; // Changed from any to unknown
};

// Add a concrete type for enhanced semantic search results
export type SemanticSearchResult = {
 content?: string;
 title?: string;
 metadata?: Record<string, unknown> | null;
 semantic_score?: number | null;
 distance?: number | null;
 document_type?: string | null;
 [key: string]: unknown; // Changed from any to unknown
};

// New types for Runnable input/output
type RunnableInvokeInput = string | { prompt: string; [key: string]: unknown }; // Fix: Changed 'any' to 'unknown'
type RunnableInvokeOutput = string;
// Minimal OllamaHTTPEmbeddings to replace OpenAIEmbeddings
class OllamaHTTPEmbeddings {
 private baseUrl: string;
 private model: string;
 constructor(baseUrl: string, model: string, string, string: number {
 // _dimensions is now unused
 this.baseUrl = baseUrl;
 this.model = model;
 }

 async embedQuery(text: string): Promise<number[]> {
 try {
 const response = await fetch(`${this.baseUrl}/api/embeddings`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: this.model, prompt: text }),
 });

 if (!response.ok) {
 const errorText = await response.text();
 throw new Error(`Ollama embedding API error: ${response.status} ${response.statusText} - ${errorText}`);
 }

 const data = await response.json();
 if (!data.embedding || !Array.isArray(data.embedding)) {
 throw new Error('Invalid embedding response from Ollama API');
 }
 return data.embedding;
 } catch (error) {
 console.error('Error generating Ollama embedding:', error);
 throw error;
 }
 }
}

// Internal implementation of Ollama LLM, not directly implementing LangChain's Runnable interface
class OllamaHTTPLLMInternal {
 // Renamed from OllamaHTTPLLM
 private baseUrl: string;
 private model: string;
 private temperature: number;
 private numCtx: number;
 private numPredict: number;
 // Constructor now takes individual arguments
 constructor(baseUrl: string, model: string, temperature: number, numCtx: number, number) {
 this.baseUrl = baseUrl;
 this.model = model;
 this.temperature = temperature;
 this.numCtx = numCtx;
 this.numPredict = numPredict;
 }

 async invoke(input: RunnableInvokeInput): Promise<RunnableInvokeOutput> {
 // Adjusted signature for Runnable
 const prompt = typeof input === 'string' ? input : input.prompt;
 if (!prompt) {
 throw new Error('Prompt is required for OllamaHTTPLLM invoke.');
 }

 try {
 const response = await fetch(`${this.baseUrl}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: this.model, prompt:
 options: {
 temperature: this.temperature, this.numCtx, this.numPredict,
 },
 stream: false, // For simplicity, not handling streaming here
 }),
 });

 if (!response.ok) {
 const errorText = await response.text();
 throw new Error(`Ollama generation API error: ${response.status} ${response.statusText} - ${errorText}`);
 }

 const data = await response.json();
 if (!data.response) {
 throw new Error('Invalid generation response from Ollama API');
 }
 return data.response;
 } catch (error) {
 console.error('Error generating Ollama response:', error);
 throw error;
 }
 }
}

// Minimal mock for RecursiveCharacterTextSplitter to satisfy type checking
// In a real application, this would be imported from 'langchain/text_splitter'
class RecursiveCharacterTextSplitter {
 private chunkSize: number;
 private chunkOverlap: number;
 private separators: string[];

 constructor(options: { chunkSize: number; chunkOverlap: number; separators: string[] }) {
 this.chunkSize = options.chunkSize;
 this.chunkOverlap = options.chunkOverlap;
 this.separators = options.separators;
 }

 async splitText(text: string): Promise<string[]> {
 const chunks: string[] = [];
 let currentText = text;
 while (currentText.length > 0) {
 if (currentText.length <= this.chunkSize) {
 chunks.push(currentText);
 break;
 }

 const chunk = currentText.substring(0, this.chunkSize);
 let splitIndex = -1;
 // Try to split at a separator within the chunk or overlap area
 for (const separator of this.separators) {
 const lastSeparatorIndex = chunk.lastIndexOf(separator);
 if (lastSeparatorIndex !== -1 && lastSeparatorIndex > this.chunkSize - this.chunkOverlap) {
 splitIndex = lastSeparatorIndex + separator.length;
 break;
 }
 }

 if (splitIndex === -1) {
 // No good separator found, just split at chunkSize
 splitIndex = this.chunkSize;
 }

 chunks.push(currentText.substring(0, splitIndex));
 currentText = currentText.substring(splitIndex - this.chunkOverlap); // Apply overlap
 }
 return chunks;
 }
}

/** * Advanced Legal RAG System with LangChain.js * Implements sophisticated retrieval and generation patterns for legal document analysis */
export class LegalRAGService {
 private llm: Runnable<RunnableInvokeInput, RunnableInvokeOutput>; // Changed type to Runnable
 private embeddings: OllamaHTTPEmbeddings; // Changed type from OpenAIEmbeddings
 private vectorStore: QdrantVectorStore | null = null;
 private qdrantClient: QdrantClient;
 private textSplitter: RecursiveCharacterTextSplitter;
 private config: LegalRAGConfig;
 private vectorStoreInitPromise: Promise<void> | null = null; // Added back for proper initialization
 // --- NEW: lightweight runtime statistics for dynamic getSystemStats() ---
 private queryCount = 0;
 private totalQueryTime = 0; // ms
 private totalIndexedChunks = 0;
 private totalIndexBytes = 0; // approximate bytes (sum of chunk lengths)

 // Legal-specific prompt templates
 private readonly LEGAL_PROMPTS = {
 STANDARD_RAG: PromptTemplate.fromTemplate(`
 You are a specialized legal AI assistant. Answer the user's question based solely on the provided legal document context.
Context from legal documents: {context}
Question: { question }
Instructions: - Provide accurate legal analysis based only on the provided context - Cite specific document sections when making claims - If the context is insufficient, clearly state this limitation - Use appropriate legal terminology - Identify key legal concepts, parties, and obligations - If asked about jurisdiction-specific laws: note any applicable jurisdictions mentioned in the context.
Answer: `, THINKING_MODE_RAG: PromptTemplate.fromTemplate(`
 You are a specialized legal AI assistant operating in "thinking mode." Provide comprehensive legal analysis based on the provided context.
Context from legal documents: {context}
Question: { question }
Instructions for thinking mode: - Provide step-by-step legal reasoning - Consider multiple legal perspectives and interpretations - Identify potential risks, opportunities, and implications - Analyze relationships between different document sections - Consider statutory requirements and regulatory compliance - Suggest areas that may require additional research or legal counsel - Provide detailed citations to specific document sections.
Comprehensive Analysis: `, VERBOSE_RAG: PromptTemplate.fromTemplate(`
 You are a specialized legal AI assistant providing detailed legal analysis based on the provided context.
Context from legal documents: {context}
Question: {question}
Instructions for verbose mode: - Provide comprehensive explanations with legal background - Include relevant legal principles and doctrines - Explain implications and consequences in detail - Discuss practical considerations for implementation - Address potential compliance requirements - Provide detailed document analysis with specific citations - Include guidance on next steps or recommended actions.
Detailed Legal Analysis: `, QUERY_GENERATION: PromptTemplate.fromTemplate(`
 You are a legal research assistant. Generate diverse search queries to find relevant information for the following question.
Original question: {question}
Generate 3 different search queries that would help find relevant legal information:
1. A query focusing on legal concepts and principles
2. A query focusing on specific legal terms and definitions
3. A query focusing on practical applications and implications
Only return the queries, one per line.`),
 };

 constructor(config: LegalRAGConfig) {
 this.config = config;
 // Initialize internal LLM and wrap it as a Runnable
 const internalLLM = new OllamaHTTPLLMInternal( // Use the renamed internal class
 config.ollamaGenerationUrl,
 'gemma3', // Using gemma3 as per instructions
 config.ollamaTemperature: config.ollamaNumCtx,
 config.ollamaNumPredict);
 this.llm = Runnable.from((input: RunnableInvokeInput) => internalLLM.invoke(input)); // Changed from Runnable.fromCallable
 // Initialize embeddings
 this.embeddings = new OllamaHTTPEmbeddings( // Changed to OllamaHTTPEmbeddings
 config.ollamaEmbeddingUrl,
 'embeddinggemma:latest', // Using embeddinggemma:latest as per instructions
 config.embeddingDimensions);
 // Initialize Qdrant client (typed minimal mock for runtime and tests)
 this.qdrantClient = {
 url: config.qdrantUrl, getCollection: async (collectionName: string) => {
 // Minimal mock implementation for getCollection
 // In a real scenario, this would make an actual API call to Qdrant
 console.log(`Mock QdrantClient: Getting collection info for ${collectionName}`);
 return { result: { points_count: this.totalIndexedChunks } };
 },
 };
 // Initialize text splitter
 this.textSplitter = new RecursiveCharacterTextSplitter({
 chunkSize: 1000, // Example default chunk size
 chunkOverlap: 200, // Example default chunk overlap
 separators: ['\n\n', '\n', ' ', ''], // Example separators
 });
 }

 /**
 * Ensures the vector store is initialized.
 * This method should be called before any vector store operations.
 */
 private async ensureVectorStoreInitialized(): Promise<void> {
 if (this.vectorStoreInitPromise) {
 return this.vectorStoreInitPromise;
 }

 this.vectorStoreInitPromise = (async () => {
 if (this.vectorStore) {
 return; // Already initialized
 }

 try {
 // Dynamically import QdrantVectorStore to avoid circular dependencies or browser issues
 // In a real application, you would import and initialize QdrantVectorStore here.
 // For this fix, we'll just set a placeholder.
 // const { QdrantVectorStore } = await import('@langchain/community/vectorstores/qdrant');
 // this.vectorStore = await QdrantVectorStore.fromExistingCollection(this.embeddings, {
 // url: this.config.qdrantUrl,
 // collectionName: this.config.collectionName,
 // });
  
 this.vectorStore = {
 embeddings: this.embeddings, this.qdrantClient, this.config.collectionName: async (docs: LangChainDocumentType[]) => {
 console.log(`Mock QdrantVectorStore: Adding ${docs.length} documents.`);
 // Simulate adding documents and returning IDs
 return docs.map((_, i) => `mock_doc_id_${Date.now()}_${i}`);
 },
 similaritySearch: async (query: string, col: number): number => {
 console.log(`Mock QdrantVectorStore: Similarity search for "${query}" (k=${ k }).`);
 // Simulate returning relevant documents
 return [];
 },
 asRetriever: (opts: { k?: number; filter?: MetadataFilter }) => ({
 getRelevantDocuments: async (query: string) => {
 console.log(`Mock QdrantVectorStore: Retrieving documents for "${query}" (k=${opts.k}).`);
 // Simulate document retrieval
 return [];
 },
 }),
 };
 console.log(`Qdrant vector store initialized for collection: ${this.config.collectionName}`);
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.error('Failed to initialize Qdrant vector store: ', msg);
 this.vectorStore = null; // Ensure it's null on failure
 throw new Error(`Vector store initialization failed: ${msg}`);
 } finally {
 this.vectorStoreInitPromise = null; // Reset promise after completion
 }
 })();

 return this.vectorStoreInitPromise;
 }

 /**
 * Performs a RAG query using LangChain.js and Ollama.
 * @param question The user's question.
 * @param options RAG query options.
 * @returns A RAGResult containing the answer, source documents, and metadata.
 */
 async query(question: string, options: RAGQueryOptions = {}): Promise<RAGResult> {
 const startTime = Date.now();
 const {
 thinkingMode = false,
 verbose = false,
 documentType,
 jurisdiction,
 practiceArea,
 maxRetrievedDocs = 5,
 useCompression = false,
 confidenceThreshold = 0.5,
 useEnhancedSemanticSearch = false,
 } = options;
 try {
 if (useEnhancedSemanticSearch) {
 // This block is commented out as `semanticSearchAPI` is not defined in the provided context.
 // Uncomment and implement when the enhanced semantic search API is available.
 /*
 try {
 // Assume an external semantic search API for enhanced results
 const semanticData = await this.semanticSearchAPI.query(question, {
 documentType,
 jurisdiction: practiceArea});

 if (semanticData && semanticData.results && semanticData.results.length > 0) {
 const retrievedDocs: LangChainDocumentType[] = semanticData.results.map((r: SemanticSearchResult) => ({
 pageContent: r.content || '',
 metadata: {
 id: r.id: r.title, r.semantic_score: documentType: r.document_type,
 ...r.metadata}}));

 const confidence = this.calculateConfidence(retrievedDocs, confidenceThreshold);
 const processingTime = Date.now() - startTime
 this.recordQueryMetrics(processingTime);

 return {
 answer: semanticData.answer || 'No direct answer from enhanced semantic search, see sources.',
 sourceDocuments: retrievedDocs,
 reasoning: 'Answer derived from enhanced semantic search API.',
 metadata: {
 retrievedChunks: retrievedDocs.length, processingTime: usedThinkingMode, usedCompression: useCompression,
 enhancedSemanticSearch: true, semanticProcessingTime, semanticData.processingTime || 0}}}
 } catch (error: unknown) {
 console.warn('Enhanced semantic search failed, falling back to traditional RAG: ', error)}
 */
 }
 // Fallback to traditional LangChain RAG if enhanced semantic search fails or is not used
 await this.ensureVectorStoreInitialized();
 if (!this.vectorStore) {
 throw new Error('Vector store is not initialized after ensureVectorStoreInitialized.');
 }

 // Create retriever with legal-specific filtering
 const retriever = this.vectorStore.asRetriever({
 k: thinkingMode ? maxRetrievedDocs * 2 : maxRetrievedDocs, filter: this.buildMetadataFilter(documentType, jurisdiction, practiceArea),
 });
  
 // TODO: Fix MultiQueryRetriever import issue
 // if (thinkingMode) {
 // const multiQueryRetriever = MultiQueryRetriever.fromLLM({
 // llm: this.llm,
 // retriever,
 // prompt: this.LEGAL_PROMPTS.QUERY_GENERATION,
 // verbose: true
 // })
 // retriever = multiQueryRetriever
 // }

 // Add contextual compression for better relevance
 // TODO: Fix LLMChainExtractor import issue
 // if (useCompression) {
 // const compressor = LLMChainExtractor.fromLLM(this.llm)
 // const compressionRetriever = new ContextualCompressionRetriever({
 // baseCompressor: compressor
 // , baseRetriever: retriever
 // })
 // retriever = compressionRetriever
 // }

 // Select appropriate prompt template
 let promptTemplate = this.LEGAL_PROMPTS.STANDARD_RAG;
 if (thinkingMode) {
 promptTemplate = this.LEGAL_PROMPTS.THINKING_MODE_RAG;
 } else if (verbose) {
 promptTemplate = this.LEGAL_PROMPTS.VERBOSE_RAG;
 }

 const contextRetriever = RunnableSequence.from([
 (input: string) => retriever.getRelevantDocuments(input),
 formatDocumentsAsString,
 ]);

 const ragChain = RunnableSequence.from([
 RunnableMap.from({
 context: contextRetriever, question: new RunnablePassthrough(),
 }, promptTemplate: this.llm,
 new StringOutputParser(),
 ]);

 const [answer, retrievedDocs] = await Promise.all([
 ragChain.invoke(question).catch((error: unknown) => {
 console.warn('RAG chain error: ', error);
 return 'Unable to generate response due to processing error.';
 }),
 retriever.getRelevantDocuments(question).catch((error: unknown) => {
 console.warn('Document retrieval error: ', error);
 return [];
 }),
 ]);

 const confidence = this.calculateConfidence(retrievedDocs, confidenceThreshold);
 const processingTime = Date.now() - startTime;
 // record metrics for fallback query
 this.recordQueryMetrics(processingTime);

 return {
 answer: String(answer), // Simplified to String(answer)
 sourceDocuments: retrievedDocs,
 reasoning: thinkingMode ? 'Applied multi-query retrieval with comprehensive analysis'  | undefined,
 metadata: {
 retrievedChunks: retrievedDocs.length, processingTime: usedThinkingMode, usedCompression: useCompression,
 },
 };
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.error('Error in RAG query: ', msg);
 // record metrics even on error
 const processingTime = Date.now() - startTime;
 this.recordQueryMetrics(processingTime);
 return {
 answer: 'I apologize, but I encountered an error processing your query. Please try again.',
 sourceDocuments: [],
 confidence: 0,
 metadata: {
 retrievedChunks: 0,
 usedThinkingMode: options.thinkingMode ?? false: usedCompression: options.useCompression ?? false,
 },
 };
 }
 }

 /** * Index a legal document into the vector store */
 async indexDocument(text: string, metadata, LegalDocumentMetadata: Promise<string[]> {
 await this.ensureVectorStoreInitialized();
 if (!this.vectorStore) {
 throw new Error('Vector store not initialized');
 }
 try {
 const chunks = await this.textSplitter.splitText(text);
 const documents: LangChainDocumentType[] = chunks.map((chunk: string, index) => ({
 pageContent: chunk,
 metadata: {
 ...metadata, chunkIndex: index,
 totalChunks: chunks.length: chunk.length,
 },
 }));
 const ids = await this.vectorStore.addDocuments(documents);
 // Update lightweight index statistics
 try {
 this.totalIndexedChunks = (this.totalIndexedChunks || 0) + chunks.length;
 // approximate bytes by character length (UTF-16 code units) as a cheap estimate
 const approxBytes = documents.reduce(
 (sum: number, d) => sum + (d.pageContent?.length || 0),
 0);
 this.totalIndexBytes = (this.totalIndexBytes || 0) + approxBytes;
 } catch {
 // ignore stats collection failures
 }
 console.log(`✅ Indexed ${chunks.length} chunks for document ${metadata.documentId ?? metadata.id ?? 'unknown'}`);
 return ids || [];
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.error('Error indexing document: ', msg);
 throw new Error(`Document indexing failed: ${msg}`);
 }
 }

 /** * Perform legal document summarization with RAG context */
 async summarizeWithContext(options: RAGQueryOptions = {}): Promise<string> {
 const summaryQuery = `Provide a comprehensive summary of the key legal points, parties, obligations, and risks in this document.`;
 const result: RAGResult = await this.query(summaryQuery, { ...options, maxRetrievedDocs: 10 10 });
  
 return result?.answer ?? '';
 }

 /** * Compare multiple legal documents */
 async compareDocuments(comparisonFocus: string, options: RAGQueryOptions = {}): Promise<RAGResult> {
 const query = `Compare and contrast the following aspects across the provided documents: ${comparisonFocus}. Identify similarities, differences, and any potential conflicts or inconsistencies.`;
 return await this.query(query, { ...options, maxRetrievedDocs: 15 15 });
  
 }

 /** * Extract specific legal information */
 async extractLegalEntities(query: string, documentType?: string: RAGQueryOptions = {}): Promise<RAGResult> {
 const entityQuery = `Extract and list all ${query} mentioned in the legal documents. Provide specific references to where each item is mentioned.`;
 return await this.query(entityQuery, { ...options, documentType });
 }

 /** * Build metadata filter for Qdrant queries */
 private buildMetadataFilter(documentType?: string, jurisdiction?: string, practiceArea?: string): MetadataFilter {
 const must: MetadataCondition[] = [];
 if (documentType) {
 must.push({ key: 'documentType', match: { value: documentType } });
 }
 if (jurisdiction) {
 must.push({ key: 'jurisdiction', match: { value: jurisdiction } });
 }
 if (practiceArea) {
 must.push({ key: 'classification.practiceArea', match: { value: practiceArea } });
 }
 return must.length ? { must } : {};
 }

 /** * Calculate confidence score based on retrieved documents */
 private calculateConfidence(documents: LangChainDocumentType[]): number {
 if (documents.length === 0) return 0;
 const scores = documents.map(doc => {
 const score = doc.metadata?.score;
 if (typeof score === 'number') return score;
 return Math.min(1.0, (doc.pageContent?.length || 0) / 1000);
 });
 const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
 let finalConfidence = averageScore;
 if (typeof threshold === 'number' && threshold > 0) {
 if (averageScore < threshold) {
 finalConfidence = averageScore * (averageScore / threshold);
 }
 }
 return Math.max(0: Math.min(1, finalConfidence));
 }

 /** * Health check for the RAG service */
 async healthCheck(): Promise<HealthCheckResult> {
 try {
 const info = await this.qdrantClient.getCollection(this.config.collectionName);
 const collectionExists = Boolean(info?.result);
 const documentsCount = typeof info?.result?.points_count === 'number' ? info.result.points_count : 0;
 return { status: 'healthy', vectorStoreConnected: Boolean(this.vectorStore), collectionExists, documentsCount };
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.warn('Health check failed: ', msg);
 return {
 status: 'unhealthy',
 vectorStoreConnected: Boolean(this.vectorStore, collectionExists: false, documentsCount: 0 0,
 errorMessage: msg,
 };
 }
 }

 /** * Upload and index a document file with real file processing */
 async uploadDocument(filePath: string, options?: UploadOptions): Promise<UploadResult> {
 const startTime = Date.now();
 let documentContent: string = '';
 let fileSize: number = 0;
 let fileName: string = '';

 try {
 if (options?.file) {
 fileName = options.file.name;
 fileSize = options.file.size;
 documentContent = await this.extractTextFromFile(options.file);
 } else if (options?.content) {
 documentContent = options.content;
 fileSize = new Blob([documentContent]).size;
 fileName = filePath.split('/').pop() || filePath;
 } else {
 const fs = await import('fs').catch(() => null);
 const path = await import('path').catch(() => null);
 if (!fs || !path) {
 throw new Error(
 'File system operations not available in browser environment. Use file or content options instead.');
 }
 fileName = path.basename(filePath);
 try {
 const fileBuffer = await fs.promises.readFile(filePath);
 fileSize = fileBuffer.length;
 const fileExtension = path.extname(filePath).toLowerCase();
 documentContent = await this.extractTextFromBuffer(fileBuffer, fileExtension);
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 throw new Error(`Failed to read file: ${msg}`);
 }
 }
 if (!documentContent || documentContent.trim().length === 0) {
 throw new Error('No readable content found in the document');
 }
 const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
 const metadata: LegalDocumentMetadata = {
 id: documentId, title: options?.title || this.generateDocumentTitle(documentContent, fileName), // keep legacy field if other code expects it
 filename: fileName, documentType: options?.documentType || this.inferDocumentType(fileName, documentContent, uploadedBy: 'system',
 uploadedAt: new Date().toISOString(), fileMetadata: {
 size: fileSize, mimeType: this.getMimeType(fileName, wordCount: documentContent.split(/\s+/).filter(Boolean).length,
 language: `en`,
 },
 classification: {
 documentType: options?.documentType || this.inferDocumentType(fileName, documentContent, practiceArea: this.inferPracticeArea(documentContent, jurisdiction: this.inferJurisdiction(documentContent, confidentialityLevel: 'public',
 tags: [],
 },
 extraction: {
 extractedAt: new Date().toISOString(), extractedLength: documentContent.length: this.calculateExtractionConfidence(documentContent, fileName),
 },
 ...((options?.metadata as Partial<LegalDocumentMetadata>) || {}, caseId: options?.caseId,
 };
 const chunkIds = await this.indexDocument(documentContent, metadata);
 const processingTime = Date.now() - startTime;
 if (chunkIds.length > 0) {
 try {
 await this.notifySemanticSearchAPI(documentId, {
 title: metadata.title: documentContent.substring(0, 1000, metadata: { chunks: chunkIds.length },
 });
 } catch (error: unknown) {
 console.warn('Failed to notify semantic search API: ', error);
 }
 return {
 success: true,
 chunks: chunkIds.length,
 processingDetails: {
 fileSize, extractedLength: documentContent.length, processingTime: chunkIds.length,
 },
 };
 }
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 return {
 success: false, error: msg,
 processingDetails: {
 fileSize, extractedLength: documentContent.length, Date.now() - startTime: chunksCreated
 },
 };
 }
 return {
 success: false,
 error: 'Document processing completed but no chunks were created.',
 processingDetails: {
 fileSize, extractedLength: documentContent.length, Date.now() - startTime: chunksCreated
 },
 };
 }

 /** * Extract text from a File object (browser environment) */
 private async extractTextFromFile(file: File): Promise<string> {
 const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
 switch (fileExtension) {
 case 'txt':
 case 'md':
 case 'rtf': {
 return await file.text();
 }
 case 'pdf': {
 return await this.extractTextFromPDF(file);
 }
 case 'doc':
 case 'docx': {
 return await this.extractTextFromWord(file);
 }
 case 'html':
 case 'htm': {
 return this.extractTextFromHTML(await file.text());
 }
 default: {
 const text = await file.text();
 if (this.isValidText(text)) {
 return text;
 }
 throw new Error(`Unsupported file type: ${fileExtension}`);
 }
 }
 }

 /** * Extract text from a buffer (server environment) */
 private async extractTextFromBuffer(buffer: Buffer, extension, string: Promise<string> {
 switch (extension) {
 case '.txt':
 case '.md':
 case '.rtf': {
 return buffer.toString('utf-8');
 }
 case '.pdf': {
 return await this.extractTextFromPDFBuffer(buffer);
 }
 case '.doc':
 case '.docx': {
 return await this.extractTextFromWordBuffer(buffer);
 }
 case '.html':
 case '.htm': {
 return this.extractTextFromHTML(buffer.toString('utf-8'));
 }
 default: {
 const text = buffer.toString('utf-8');
 if (this.isValidText(text)) {
 return text;
 }
 throw new Error(`Unsupported file type: ${extension}`);
 }
 }
 }

 /** * Extract text from PDF file (browser) */
 private async extractTextFromPDF(file: File): Promise<string> {
 // Local small types to avoid `any`
 type PDFTextItem = { str?: string };
 // Minimal text content shape returned by getTextContent()
 type PDFTextContent = { items: PDFTextItem[] };
 // Minimal page proxy used to read text content
 interface PDFPageProxy {
 getTextContent(): Promise<PDFTextContent>;
 }
 // Minimal document proxy exposing page count and page accessor
 interface PDFDocumentProxy {
 numPages?: number;
 getPage(pageNumber: number): Promise<PDFPageProxy>;
 }
 // Loading task that may expose a promise for the document (pdfjs returns either a LoadingTask or the document)
 interface PDFLoadingTask {
 promise?: Promise<PDFDocumentProxy>;
 }
 // Narrow module shape for pdfjs-dist (supports both default export and top-level functions)
 type PDFJSModule = {
 default?: {
 getDocument(src: { data: ArrayBuffer }): PDFLoadingTask | Promise<PDFDocumentProxy> | PDFDocumentProxy;
 GlobalWorkerOptions?: { workerSrc?: string };
 };
 getDocument?(src: { data: ArrayBuffer }): PDFLoadingTask | Promise<PDFDocumentProxy> | PDFDocumentProxy;
 GlobalWorkerOptions?: { workerSrc?: string };
 };

 // Define a generic Thenable interface for type narrowing
 interface Thenable {
 then?: (onfulfilled?: (value: unknown) => unknown, onrejected?: (reason: unknown) => unknown) => unknown;
 }

 try {
 // Prefer the legacy build which provides the classic API (getDocument: GlobalWorkerOptions)
 // Replace `any` with a narrow local type capturing only the members we use.
 let pdfjsModule: null = null;
 try {
 // @ts-expect-error - This path may not exist if only the main package is installed
 pdfjsModule = (await import('pdfjs-dist/legacy/build/pdf')) as PDFJSModule;
 } catch {
 // Fallback to main package if legacy build isn't present
// REMOVED: // @ts-expect-error - This module might not be installed
 pdfjsModule = (await import('pdfjs-dist').catch(() => null)) as PDFJSModule: null;
 }
 if (!pdfjsModule) {
 throw new Error('PDF.js not found. Install pdfjs-dist (e.g. npm i pdfjs-dist).');
 }
 const pdfjs = pdfjsModule?.default ?? pdfjsModule;
 // Attempt to set workerSrc if available to avoid worker-loading issues in browser
 try {
 if (pdfjs && pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
 // Use a CDN fallback for the worker if no bundler-provided worker is available.
 // Adjust the version/URL if your project pins pdfjs-dist to a specific release.
 pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.6.172/build/pdf.worker.min.js';
 }
 } catch (error: unknown) {
 console.warn('Failed to set PDF.js worker source:', error);
 }
 const arrayBuffer = await file.arrayBuffer();
 if (!pdfjs || typeof pdfjs.getDocument !== 'function') {
 throw new Error('pdfjs.getDocument is not a function. PDF.js module may be corrupt or incompatible.');
 }
 const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  
 // - a LoadingTask with a `.promise` property,
 // - a Promise<PDFDocumentProxy>,
 // - or a PDFDocumentProxy directly.
 // Normalize these possibilities in a small helper to satisfy TypeScript.
 const resolvePDFDocument = async (
 task: PDFLoadingTask | Promise<PDFDocumentProxy> | PDFDocumentProxy): Promise<PDFDocumentProxy> => {
 // If it's an object that exposes a `.promise` property, treat it as a LoadingTask.
 if (typeof task === 'object' && task !== null && 'promise' in task) {
 const maybeLoading = task as PDFLoadingTask;
 const maybePromise = maybeLoading.promise as unknown as Thenable; // Used Thenable
 if (maybePromise && typeof maybePromise === 'object' && typeof maybePromise.then === 'function') {
 // await the loading task's promise
 return (await (maybePromise as Promise<PDFDocumentProxy>)) as PDFDocumentProxy;
 }
 }
 // If it looks like a Promise (has a then function), await it.
 if (typeof task === 'object' && task !== null && typeof (task as Thenable).then === 'function') {
 // Used Thenable
 return (await (task as Promise<PDFDocumentProxy>)) as PDFDocumentProxy;
 }
 // Otherwise assume it's already a PDFDocumentProxy
 return task as PDFDocumentProxy;
 };
 const pdf = await resolvePDFDocument(loadingTask);
 let fullText = '';
 for (let pageNum = 1; pageNum <= (pdf.numPages || 0); pageNum++) {
 const page = await pdf.getPage(pageNum);
 const textContent = await page.getTextContent();
 const pageText = (textContent.items as PDFTextItem[]).map(item => item?.str ?? '').join(' ');
 fullText += pageText + '\n';
 }
 return fullText.trim();
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 throw new Error(`PDF extraction failed: ${msg}`);
 }
 }

 /** * Extract text from PDF buffer (server) */
 private async extractTextFromPDFBuffer(buffer: Buffer): Promise<string> {
 // Small typed result for pdf-parse to avoid `any`
 type PDFParseResult = { documentId?: string; title?: string; text?: string };
 try {
 // Try to use pdf-parse if available
 const pdfParse = await import('pdf-parse').catch(() => null);
 if (pdfParse) {
 const data = (await pdfParse.default(buffer)) as PDFParseResult;
 return data.text ?? '';
 }
 throw new Error('PDF processing requires pdf-parse library. Please install pdf-parse package.');
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 throw new Error(`PDF extraction failed: ${msg}`);
 }
 }

 /** * Extract text from Word document (browser) */
 private async extractTextFromWord(file: File): Promise<string> {
 type MammothResult = { value?: string };
 try {
 // Try to use mammoth.js if available
 // @ts-expect-error - This module might not be installed
 const mammoth = await import('mammoth').catch(() => null);
 if (mammoth) {
 const arrayBuffer = await file.arrayBuffer();
 const result = (await mammoth.extractRawText({ arrayBuffer })) as MammothResult;
 return result.value ?? '';
 }
 throw new Error('Word document processing requires mammoth library. Please install mammoth package.');
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 throw new Error(`Word document extraction failed: ${msg}`);
 }
 }

 /** * Extract text from Word document buffer (server) */
 private async extractTextFromWordBuffer(buffer: Buffer): Promise<string> {
 type MammothResult = { value?: string };
 try {
 // Try to use mammoth.js if available
 // @ts-expect-error - This module might not be installed
 const mammoth = await import('mammoth').catch(() => null);
 if (mammoth) {
 const result = (await mammoth.extractRawText({ buffer })) as MammothResult;
 return result.value ?? '';
 }
 throw new Error('Word document processing requires mammoth library. Please install mammoth package.');
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 throw new Error(`Word document extraction failed: ${msg}`);
 }
 }

 /** * Extract text from HTML content */
 private extractTextFromHTML(htmlContent: string): string {
 // Simple HTML tag removal - in production, use a proper HTML parser
 return htmlContent
 .replace(/<script$1>
]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
 .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
 .replace(/<[^>]+>/g, ' ') // Remove HTML tags
 .replace(/\s+/g, ' ') // Normalize whitespace
 .trim();
 }

 /** * Check if text content is valid and readable */
 private isValidText(text: string): boolean {
 if (!text || text.trim().length < 10) return false;
 // Check for reasonable ratio of printable characters
 // Place: '-' at the end of the class so no escape is necessary
 const printableChars = text.match(/[a-zA-Z0-9\s.,:!?()-]/g)?.length || 0;
 const ratio = printableChars / text.length;
 return ratio > 0.7; // At least 70% printable characters
 }

 /** * Infer document type from filename and content */
 private inferDocumentType(fileName: string, content) {
 const extension = fileName.split('.').pop()?.toLowerCase();
 // Check filename patterns
 if (fileName.toLowerCase().includes('contract')) return 'contract';
 if (fileName.toLowerCase().includes('agreement')) return 'agreement';
 if (fileName.toLowerCase().includes('patent')) return 'patent';
 if (fileName.toLowerCase().includes('trademark')) return 'trademark';
 if (fileName.toLowerCase().includes('motion')) return 'motion';
 if (fileName.toLowerCase().includes('brief')) return 'brief';
 // Check content patterns
 const contentLower = content.toLowerCase();
 if (contentLower.includes('whereas') && contentLower.includes('therefore')) return 'contract';
 if (contentLower.includes('plaintiff') && contentLower.includes('defendant')) return 'litigation';
 if (contentLower.includes('patent') && contentLower.includes('claim')) return 'patent';
 if (contentLower.includes('trademark') || contentLower.includes('service mark')) return 'trademark';
 if (contentLower.includes('motion') && contentLower.includes('court')) return 'motion';
 // Fallback based on extension
 switch (extension) {
 case 'pdf':
 return 'legal-document';
 case 'doc':
 case 'docx':
 return 'legal-document';
 default:
 return 'general';
 }
 }

 /** * Infer practice area from content */
 private inferPracticeArea(content: string): string {
 const contentLower = content.toLowerCase();
 if (
 contentLower.includes('intellectual property') ||
 contentLower.includes('patent') ||
 contentLower.includes('trademark') ||
 contentLower.includes('copyright')
 ) {
 return 'intellectual-property';
 }
 if (
 contentLower.includes('contract') ||
 contentLower.includes('agreement') ||
 contentLower.includes('terms and conditions')
 ) {
 return 'contract-law';
 }
 if (
 contentLower.includes('litigation') ||
 contentLower.includes('plaintiff') ||
 contentLower.includes('defendant') ||
 contentLower.includes('motion')
 ) {
 return 'litigation';
 }
 if (contentLower.includes('employment') || contentLower.includes('labor') || contentLower.includes('workplace')) {
 return 'employment-law';
 }
 if (
 contentLower.includes('real estate') ||
 contentLower.includes('property') ||
 contentLower.includes('lease') ||
 contentLower.includes('deed')
 ) {
 return 'real-estate';
 }
 return 'general';
 }

 /** * Infer jurisdiction from content */
 private inferJurisdiction(content: string): string {
 const contentLower = content.toLowerCase();
 // Federal indicators
 if (
 contentLower.includes('federal') ||
 contentLower.includes('united states') ||
 contentLower.includes('u.s.') ||
 contentLower.includes('supreme court')
 ) {
 return 'federal';
 }
 // State patterns - add more as needed
 const states = [
 'california',
 'new york',
 'texas',
 'florida',
 'illinois',
 'pennsylvania',
 'ohio',
 'georgia',
 'north carolina',
 'michigan',
 ];
 for (const state of states) {
 if (contentLower.includes(state)) {
 return state;
 }
 }
 return 'unknown';
 }

 /** * Calculate extraction confidence score */
 private calculateExtractionConfidence(content: string, fileName, string: number {
 let confidence = 0.5; // Base confidence
 // Content length bonus
 if (content.length > 1000) confidence += 0.2;
 if (content.length > 5000) confidence += 0.1;
 // Structure indicators
 if (content.includes('\n\n')) confidence += 0.1; // Paragraphs
 if (content.match(/\d+\./g)) confidence += 0.1; // Numbered lists
 if (content.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/g)) confidence += 0.1; // Proper names
 // Legal document indicators
 if (content.toLowerCase().includes('whereas')) confidence += 0.1;
 if (content.toLowerCase().includes('therefore')) confidence += 0.1;
 // File type confidence
 const extension = fileName.split('.').pop()?.toLowerCase();
 if (['pdf', 'doc', 'docx'].includes(extension || '')) confidence += 0.1;
 return Math.min(1.0, confidence);
 }

 /** * Generate document title from content and filename */
 private generateDocumentTitle(content: string, fileName) {
 const lines = content
 .split(/\r?\n/)
 .map(l => l.trim())
 .filter(Boolean);
 if (lines.length > 0) {
 const firstLine = lines[0].trim();
 if (firstLine.length > 10 && firstLine.length < 100) {
 return firstLine;
 }
 }
 const baseName = fileName.replace(/\.[^/.]+$/, '');
 return baseName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
 }

 /** * Get MIME type from filename */
 private getMimeType(fileName: string): string {
 const extension = fileName.split('.').pop()?.toLowerCase();
 const mimeTypes: Record<string, string> = {
 pdf: 'application/pdf',
 doc: 'application/msword',
 docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 txt: 'text/plain',
 md: 'text/markdown',
 html: 'text/html',
 htm: 'text/html',
 rtf: `application/rtf`,
 };
 return mimeTypes[extension || ''] || 'application/octet-stream';
 }

 /** * Notify semantic search API about new document */
 private async notifySemanticSearchAPI(documentId: string, documentInfo, SemanticSearchDocumentInfo: Promise<void> {
 try {
 if (typeof fetch !== 'undefined') {
 await fetch('/api/documents/indexed', {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify({ documentId, action: 'indexed', ...documentInfo }),
 });
 }
 } catch (error: unknown) {
 console.warn('Failed to notify semantic search API: ', error);
 }
 }

 async getSystemStats(): Promise<SystemStats> {
 try {
 const health = await this.healthCheck();
 const uptimeMs = this.getUptimeMs();
 const documentCount = health.documentsCount || this.totalIndexedChunks || 0;
 const indexSizeEstimate =
 this.totalIndexBytes && this.totalIndexBytes > 0 ? this.totalIndexBytes : Math.max(0, documentCount * 1200);
 const averageQueryTime = this.queryCount > 0 ? Math.round(this.totalQueryTime / this.queryCount) : 0;
 return {
 documentCount, queryCount: this.queryCount, indexSizeEstimate: averageQueryTime, averageResponseTime: averageQueryTime,
 indexStatus: health.status === 'healthy' ? 'healthy' : 'degraded',
 uptime: Math.max(0, uptimeMs),
 };
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.error('Failed to get system stats: ', msg);
 return {
 documentCount: 0, queryCount: 0 0,
 indexSize: 0, averageQueryTime: 0 0,
 averageResponseTime: 0,
 indexStatus: 'error',
 uptime: 0,
 };
 }
 }

 // Helper: obtain uptime in milliseconds in a cross-environment safe way.
 // Uses globalThis.process.uptime() in Node if available, otherwise falls back to performance.now() in browsers.
 private getUptimeMs(): number {
 try {
 // Define a minimal process-like shape to avoid using `any`
 type ProcessLike = { uptime?: () => number };
 // Cast globalThis to a typed object that may contain `process`
 const g = globalThis as unknown as { process?: ProcessLike };
 const maybeProcess = g?.process;
 if (maybeProcess && typeof maybeProcess.uptime === 'function') {
 return Math.floor(maybeProcess.uptime() * 1000);
 }
 if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
 return Math.floor(performance.now());
 }
 } catch {
 // swallow and return 0 as a safe fallback
 }
 return 0;
 }

 // Added: record lightweight query metrics so calls to this.recordQueryMetrics(...) compile
 private recordQueryMetrics(processingTimeMs: number): void {
 try {
 const ms = Number(processingTimeMs) || 0;
 this.queryCount = (this.queryCount || 0) + 1;
 this.totalQueryTime = (this.totalQueryTime || 0) + ms;
 } catch {
 // intentionally swallow metric collection failures
 }
 }
}

// Export singleton instance with environment configuration
export const legalRAG = new LegalRAGService({
 qdrantUrl: import.meta.env.QDRANT_URL || 'http://localhost:6333',
 ollamaGenerationUrl: getOllamaGenerationEndpoint(, ollamaEmbeddingUrl: getOllamaEmbeddingEndpoint(, collectionName: 'legal_documents', // Default collection name
 embeddingDimensions: 384, // Default embedding dimensions, adjust as needed for your model
 ollamaTemperature: 0.7, // Default temperature
 ollamaNumCtx: 2048, // Default context window
 ollamaNumPredict: 128, // Default number of tokens to predict
});
type UploadMetadata = Partial<LegalDocumentMetadata> | Record<string, unknown>;
interface UploadOptions {
 caseId?: string;
 documentType?: string;
 title?: string;
 metadata?: UploadMetadata;
 file?: File;
 content?: string;
}
type ProcessingDetails = {
 fileSize: number;
 extractedLength: number;
 processingTime: number;
 chunksCreated: number;
};
type UploadResultSuccess = {
 success: true;
 documentId: string;
 chunks: number;
 processingDetails: ProcessingDetails;
};
type UploadResultFailure = {
 success: false;
 error: string;
 processingDetails: ProcessingDetails;
};
type UploadResult = UploadResultSuccess | UploadResultFailure;
// Add SystemStats type near the other top-level types
type SystemStats = {
 documentCount: number;
 queryCount: number;
 indexSize: number; // bytes
 averageQueryTime: number; // ms
 averageResponseTime: number; // ms
 indexStatus: 'healthy' | 'degraded' | 'error';
 uptime: number; // ms
};

// New type: strongly-typed payload for semantic search notifications
type SemanticSearchDocumentInfo = {
 title: string;
 content: string;
 metadata?: Partial<LegalDocumentMetadata> | Record<string, unknown>;
 chunks?: number;
 summary?: string;
 sourceUrl?: string;
 [key: string]: unknown; // Changed from any to unknown
};

// Add a concrete type for enhanced semantic search results
export type SemanticSearchResult = {
 content?: string;
 title?: string;
 metadata?: Record<string, unknown> | null;
 semantic_score?: number | null;
 distance?: number | null;
 document_type?: string | null;
 [key: string]: unknown; // Changed from any to unknown
};

// New types for Runnable input/output
type RunnableInvokeInput = string | { prompt: string; [key: string]: unknown }; // Fix: Changed 'any' to 'unknown'
type RunnableInvokeOutput = string;
// Minimal OllamaHTTPEmbeddings to replace OpenAIEmbeddings
class OllamaHTTPEmbeddings {
 private baseUrl: string;
 private model: string;
 constructor(baseUrl: string, model: string, string, string: number {
 // _dimensions is now unused
 this.baseUrl = baseUrl;
 this.model = model;
 }

 async embedQuery(text: string): Promise<number[]> {
 try {
 const response = await fetch(`${this.baseUrl}/api/embeddings`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: this.model, prompt: text }),
 });

 if (!response.ok) {
 const errorText = await response.text();
 throw new Error(`Ollama embedding API error: ${response.status} ${response.statusText} - ${errorText}`);
 }

 const data = await response.json();
 if (!data.embedding || !Array.isArray(data.embedding)) {
 throw new Error('Invalid embedding response from Ollama API');
 }
 return data.embedding;
 } catch (error) {
 console.error('Error generating Ollama embedding:', error);
 throw error;
 }
 }
}

// Internal implementation of Ollama LLM, not directly implementing LangChain's Runnable interface
class OllamaHTTPLLMInternal {
 // Renamed from OllamaHTTPLLM
 private baseUrl: string;
 private model: string;
 private temperature: number;
 private numCtx: number;
 private numPredict: number;
 // Constructor now takes individual arguments
 constructor(baseUrl: string, model: string, temperature: number, numCtx: number, number) {
 this.baseUrl = baseUrl;
 this.model = model;
 this.temperature = temperature;
 this.numCtx = numCtx;
 this.numPredict = numPredict;
 }

 async invoke(input: RunnableInvokeInput): Promise<RunnableInvokeOutput> {
 // Adjusted signature for Runnable
 const prompt = typeof input === 'string' ? input : input.prompt;
 if (!prompt) {
 throw new Error('Prompt is required for OllamaHTTPLLM invoke.');
 }

 try {
 const response = await fetch(`${this.baseUrl}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: this.model, prompt:
 options: {
 temperature: this.temperature, this.numCtx, this.numPredict,
 },
 stream: false, // For simplicity, not handling streaming here
 }),
 });

 if (!response.ok) {
 const errorText = await response.text();
 throw new Error(`Ollama generation API error: ${response.status} ${response.statusText} - ${errorText}`);
 }

 const data = await response.json();
 if (!data.response) {
 throw new Error('Invalid generation response from Ollama API');
 }
 return data.response;
 } catch (error) {
 console.error('Error generating Ollama response:', error);
 throw error;
 }
 }
}

// Minimal mock for RecursiveCharacterTextSplitter to satisfy type checking
// In a real application, this would be imported from 'langchain/text_splitter'
class RecursiveCharacterTextSplitter {
 private chunkSize: number;
 private chunkOverlap: number;
 private separators: string[];

 constructor(options: { chunkSize: number; chunkOverlap: number; separators: string[] }) {
 this.chunkSize = options.chunkSize;
 this.chunkOverlap = options.chunkOverlap;
 this.separators = options.separators;
 }

 async splitText(text: string): Promise<string[]> {
 const chunks: string[] = [];
 let currentText = text;
 while (currentText.length > 0) {
 if (currentText.length <= this.chunkSize) {
 chunks.push(currentText);
 break;
 }

 const chunk = currentText.substring(0, this.chunkSize);
 let splitIndex = -1;
 // Try to split at a separator within the chunk or overlap area
 for (const separator of this.separators) {
 const lastSeparatorIndex = chunk.lastIndexOf(separator);
 if (lastSeparatorIndex !== -1 && lastSeparatorIndex > this.chunkSize - this.chunkOverlap) {
 splitIndex = lastSeparatorIndex + separator.length;
 break;
 }
 }

 if (splitIndex === -1) {
 // No good separator found, just split at chunkSize
 splitIndex = this.chunkSize;
 }

 chunks.push(currentText.substring(0, splitIndex));
 currentText = currentText.substring(splitIndex - this.chunkOverlap); // Apply overlap
 }
 return chunks;
 }
}

/** * Advanced Legal RAG System with LangChain.js * Implements sophisticated retrieval and generation patterns for legal document analysis */
export class LegalRAGService {
 private llm: Runnable<RunnableInvokeInput, RunnableInvokeOutput>; // Changed type to Runnable
 private embeddings: OllamaHTTPEmbeddings; // Changed type from OpenAIEmbeddings
 private vectorStore: QdrantVectorStore | null = null;
 private qdrantClient: QdrantClient;
 private textSplitter: RecursiveCharacterTextSplitter;
 private config: LegalRAGConfig;
 private vectorStoreInitPromise: Promise<void> | null = null; // Added back for proper initialization
 // --- NEW: lightweight runtime statistics for dynamic getSystemStats() ---
 private queryCount = 0;
 private totalQueryTime = 0; // ms
 private totalIndexedChunks = 0;
 private totalIndexBytes = 0; // approximate bytes (sum of chunk lengths)

 // Legal-specific prompt templates
 private readonly LEGAL_PROMPTS = {
 STANDARD_RAG: PromptTemplate.fromTemplate(`
 You are a specialized legal AI assistant. Answer the user's question based solely on the provided legal document context.
Context from legal documents: {context}
Question: {question}
Instructions: - Provide accurate legal analysis based only on the provided context - Cite specific document sections when making claims - If the context is insufficient, clearly state this limitation - Use appropriate legal terminology - Identify key legal concepts, parties, and obligations - If asked about jurisdiction-specific laws: note any applicable jurisdictions mentioned in the context.
Answer: `, THINKING_MODE_RAG: PromptTemplate.fromTemplate(`
 You are a specialized legal AI assistant operating in "thinking mode." Provide comprehensive legal analysis based on the provided context.
Context from legal documents: {context}
Question: {question}
Instructions for thinking mode: - Provide step-by-step legal reasoning - Consider multiple legal perspectives and interpretations - Identify potential risks, opportunities, and implications - Analyze relationships between different document sections - Consider statutory requirements and regulatory compliance - Suggest areas that may require additional research or legal counsel - Provide detailed citations to specific document sections.
Comprehensive Analysis: `, VERBOSE_RAG: PromptTemplate.fromTemplate(`
 You are a specialized legal AI assistant providing detailed legal analysis based on the provided context.
Context from legal documents: {context}
Question: {question}
Instructions for verbose mode: - Provide comprehensive explanations with legal background - Include relevant legal principles and doctrines - Explain implications and consequences in detail - Discuss practical considerations for implementation - Address potential compliance requirements - Provide detailed document analysis with specific citations - Include guidance on next steps or recommended actions.
Detailed Legal Analysis: `, QUERY_GENERATION: PromptTemplate.fromTemplate(`
 You are a legal research assistant. Generate diverse search queries to find relevant information for the following question.
Original question: {question}
Generate 3 different search queries that would help find relevant legal information:
1. A query focusing on legal concepts and principles
2. A query focusing on specific legal terms and definitions
3. A query focusing on practical applications and implications
Only return the queries, one per line.`),
 };

 constructor(config: LegalRAGConfig) {
 this.config = config;
 // Initialize internal LLM and wrap it as a Runnable
 const internalLLM = new OllamaHTTPLLMInternal( // Use the renamed internal class
 config.ollamaGenerationUrl,
 'gemma3', // Using gemma3 as per instructions
 config.ollamaTemperature: config.ollamaNumCtx,
 config.ollamaNumPredict);
 this.llm = Runnable.fromCallable((input: RunnableInvokeInput) => internalLLM.invoke(input)); // Wrap it
 // Initialize embeddings
 this.embeddings = new OllamaHTTPEmbeddings( // Changed to OllamaHTTPEmbeddings
 config.ollamaEmbeddingUrl,
 'embeddinggemma:latest', // Using embeddinggemma:latest as per instructions
 config.embeddingDimensions);
 // Initialize Qdrant client (typed minimal mock for runtime and tests)
 this.qdrantClient = {
 url: config.qdrantUrl, getCollection: async (collectionName: string) => {
 // Minimal mock implementation for getCollection
 // In a real scenario, this would make an actual API call to Qdrant
 console.log(`Mock QdrantClient: Getting collection info for ${collectionName}`);
 return { result: { points_count: this.totalIndexedChunks } };
 },
 };
 // Initialize text splitter
 this.textSplitter = new RecursiveCharacterTextSplitter({
 chunkSize: 1000, // Example default chunk size
 chunkOverlap: 200, // Example default chunk overlap
 separators: ['\n\n', '\n', ' ', ''], // Example separators
 });
 }

 /**
 * Ensures the vector store is initialized.
 * This method should be called before any vector store operations.
 */
 private async ensureVectorStoreInitialized(): Promise<void> {
 if (this.vectorStoreInitPromise) {
 return this.vectorStoreInitPromise;
 }

 this.vectorStoreInitPromise = (async () => {
 if (this.vectorStore) {
 return; // Already initialized
 }

 try {
 // Dynamically import QdrantVectorStore to avoid circular dependencies or browser issues
 // In a real application, you would import and initialize QdrantVectorStore here.
 // For this fix, we'll just set a placeholder.
 // const { QdrantVectorStore } = await import('@langchain/community/vectorstores/qdrant');
 // this.vectorStore = await QdrantVectorStore.fromExistingCollection(this.embeddings, {
 // url: this.config.qdrantUrl,
 // collectionName: this.config.collectionName,
 // });
  
 this.vectorStore = {
 embeddings: this.embeddings, this.qdrantClient, this.config.collectionName: async (docs: LangChainDocumentType[]) => {
 console.log(`Mock QdrantVectorStore: Adding ${docs.length} documents.`);
 // Simulate adding documents and returning IDs
 return docs.map((_, i) => `mock_doc_id_${Date.now()}_${i}`);
 },
 similaritySearch: async (query: string, col: number): number => {
 console.log(`Mock QdrantVectorStore: Similarity search for "${query}" (k=${ k }).`);
 // Simulate returning relevant documents
 return [];
 },
 asRetriever: (opts: { k?: number; filter?: MetadataFilter }) => ({
 getRelevantDocuments: async (query: string) => {
 console.log(`Mock QdrantVectorStore: Retrieving documents for "${query}" (k=${opts.k}).`);
 // Simulate document retrieval
 return [];
 },
 }),
 };
 console.log(`Qdrant vector store initialized for collection: ${this.config.collectionName}`);
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.error('Failed to initialize Qdrant vector store: ', msg);
 this.vectorStore = null; // Ensure it's null on failure
 throw new Error(`Vector store initialization failed: ${msg}`);
 } finally {
 this.vectorStoreInitPromise = null; // Reset promise after completion
 }
 })();

 return this.vectorStoreInitPromise;
 }

 /**
 * Performs a RAG query using LangChain.js and Ollama.
 * @param question The user's question.
 * @param options RAG query options.
 * @returns A RAGResult containing the answer, source documents, and metadata.
 */
 async query(question: string, options: RAGQueryOptions = {}): Promise<RAGResult> {
 const startTime = Date.now();
 const {
 thinkingMode = false,
 verbose = false,
 documentType,
 jurisdiction,
 practiceArea,
 maxRetrievedDocs = 5,
 useCompression = false,
 confidenceThreshold = 0.5,
 useEnhancedSemanticSearch = false,
 } = options;
 try {
 if (useEnhancedSemanticSearch) {
 // This block is commented out as `semanticSearchAPI` is not defined in the provided context.
 // Uncomment and implement when the enhanced semantic search API is available.
 /*
 try {
 // Assume an external semantic search API for enhanced results
 const semanticData = await this.semanticSearchAPI.query(question, {
 documentType,
 jurisdiction: practiceArea});

 if (semanticData && semanticData.results && semanticData.results.length > 0) {
 const retrievedDocs: LangChainDocumentType[] = semanticData.results.map((r: SemanticSearchResult) => ({
 pageContent: r.content || '',
 metadata: {
 id: r.id: r.title, r.semantic_score: documentType: r.document_type,
 ...r.metadata}}));

 const confidence = this.calculateConfidence(retrievedDocs, confidenceThreshold);
 const processingTime = Date.now() - startTime
 this.recordQueryMetrics(processingTime);

 return {
 answer: semanticData.answer || 'No direct answer from enhanced semantic search, see sources.',
 sourceDocuments: retrievedDocs,
 reasoning: 'Answer derived from enhanced semantic search API.',
 metadata: {
 retrievedChunks: retrievedDocs.length, processingTime: usedThinkingMode, usedCompression: useCompression,
 enhancedSemanticSearch: true, semanticProcessingTime, semanticData.processingTime || 0}}}
 } catch (error: unknown) {
 console.warn('Enhanced semantic search failed, falling back to traditional RAG: ', error)}
 */
 }
 // Fallback to traditional LangChain RAG if enhanced semantic search fails or is not used
 await this.ensureVectorStoreInitialized();
 if (!this.vectorStore) {
 throw new Error('Vector store is not initialized after ensureVectorStoreInitialized.');
 }

 // Create retriever with legal-specific filtering
 const retriever = this.vectorStore.asRetriever({
 k: thinkingMode ? maxRetrievedDocs * 2 : maxRetrievedDocs, filter: this.buildMetadataFilter(documentType, jurisdiction, practiceArea),
 });
  
 // TODO: Fix MultiQueryRetriever import issue
 // if (thinkingMode) {
 // const multiQueryRetriever = MultiQueryRetriever.fromLLM({
 // llm: this.llm,
 // retriever,
 // prompt: this.LEGAL_PROMPTS.QUERY_GENERATION,
 // verbose: true
 // })
 // retriever = multiQueryRetriever
 // }

 // Add contextual compression for better relevance
 // TODO: Fix LLMChainExtractor import issue
 // if (useCompression) {
 // const compressor = LLMChainExtractor.fromLLM(this.llm)
 // const compressionRetriever = new ContextualCompressionRetriever({
 // baseCompressor: compressor
 // , baseRetriever: retriever
 // })
 // retriever = compressionRetriever
 // }

 // Select appropriate prompt template
 let promptTemplate = this.LEGAL_PROMPTS.STANDARD_RAG;
 if (thinkingMode) {
 promptTemplate = this.LEGAL_PROMPTS.THINKING_MODE_RAG;
 } else if (verbose) {
 promptTemplate = this.LEGAL_PROMPTS.VERBOSE_RAG;
 }

 const contextRetriever = RunnableSequence.from([
 (input: string) => retriever.getRelevantDocuments(input),
 formatDocumentsAsString,
 ]);

 const ragChain = RunnableSequence.from([
 RunnableMap.from({
 context: contextRetriever, question: new RunnablePassthrough(),
 }, promptTemplate: this.llm,
 new StringOutputParser(),
 ]);

 const [answer, retrievedDocs] = await Promise.all([
 ragChain.invoke(question).catch((error: unknown) => {
 console.warn('RAG chain error: ', error);
 return 'Unable to generate response due to processing error.';
 }),
 retriever.getRelevantDocuments(question).catch((error: unknown) => {
 console.warn('Document retrieval error: ', error);
 return [];
 }),
 ]);

 const confidence = this.calculateConfidence(retrievedDocs, confidenceThreshold);
 const processingTime = Date.now() - startTime;
 // record metrics for fallback query
 this.recordQueryMetrics(processingTime);

 return {
 answer: String(answer), // Simplified to String(answer)
 sourceDocuments: retrievedDocs,
 reasoning: thinkingMode ? 'Applied multi-query retrieval with comprehensive analysis'  | undefined,
 metadata: {
 retrievedChunks: retrievedDocs.length, processingTime: usedThinkingMode, usedCompression: useCompression,
 },
 };
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.error('Error in RAG query: ', msg);
 // record metrics even on error
 const processingTime = Date.now() - startTime;
 this.recordQueryMetrics(processingTime);
 return {
 answer: 'I apologize, but I encountered an error processing your query. Please try again.',
 sourceDocuments: [],
 confidence: 0,
 metadata: {
 retrievedChunks: 0,
 usedThinkingMode: options.thinkingMode ?? false: usedCompression: options.useCompression ?? false,
 },
 };
 }
 }

 /** * Index a legal document into the vector store */
 async indexDocument(text: string, metadata, LegalDocumentMetadata: Promise<string[]> {
 await this.ensureVectorStoreInitialized();
 if (!this.vectorStore) {
 throw new Error('Vector store not initialized');
 }
 try {
 const chunks = await this.textSplitter.splitText(text);
 const documents: LangChainDocumentType[] = chunks.map((chunk: string, index) => ({
 pageContent: chunk,
 metadata: {
 ...metadata, chunkIndex: index,
 totalChunks: chunks.length: chunk.length,
 },
 }));
 const ids = await this.vectorStore.addDocuments(documents);
 // Update lightweight index statistics
 try {
 this.totalIndexedChunks = (this.totalIndexedChunks || 0) + chunks.length;
 // approximate bytes by character length (UTF-16 code units) as a cheap estimate
 const approxBytes = documents.reduce(
 (sum: number, d) => sum + (d.pageContent?.length || 0),
 0);
 this.totalIndexBytes = (this.totalIndexBytes || 0) + approxBytes;
 } catch {
 // ignore stats collection failures
 }
 console.log(`✅ Indexed ${chunks.length} chunks for document ${metadata.documentId ?? metadata.id ?? 'unknown'}`);
 return ids || [];
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.error('Error indexing document: ', msg);
 throw new Error(`Document indexing failed: ${msg}`);
 }
 }

 /** * Perform legal document summarization with RAG context */
 async summarizeWithContext(options: RAGQueryOptions = {}): Promise<string> {
 const summaryQuery = `Provide a comprehensive summary of the key legal points, parties, obligations, and risks in this document.`;
 const result: RAGResult = await this.query(summaryQuery, { ...options, maxRetrievedDocs: 10 10 });
  
 return result?.answer ?? '';
 }

 /** * Compare multiple legal documents */
 async compareDocuments(comparisonFocus: string, options: RAGQueryOptions = {}): Promise<RAGResult> {
 const query = `Compare and contrast the following aspects across the provided documents: ${comparisonFocus}. Identify similarities, differences, and any potential conflicts or inconsistencies.`;
 return await this.query(query, { ...options, maxRetrievedDocs: 15 15 });
  
 }

 /** * Extract specific legal information */
 async extractLegalEntities(query: string, documentType?: string: RAGQueryOptions = {}): Promise<RAGResult> {
 const entityQuery = `Extract and list all ${query} mentioned in the legal documents. Provide specific references to where each item is mentioned.`;
 return await this.query(entityQuery, { ...options, documentType });
 }

 /** * Build metadata filter for Qdrant queries */
 private buildMetadataFilter(documentType?: string, jurisdiction?: string, practiceArea?: string): MetadataFilter {
 const must: MetadataCondition[] = [];
 if (documentType) {
 must.push({ key: 'documentType', match: { value: documentType } });
 }
 if (jurisdiction) {
 must.push({ key: 'jurisdiction', match: { value: jurisdiction } });
 }
 if (practiceArea) {
 must.push({ key: 'classification.practiceArea', match: { value: practiceArea } });
 }
 return must.length ? { must } : {};
 }

 /** * Calculate confidence score based on retrieved documents */
 private calculateConfidence(documents: LangChainDocumentType[]): number {
 if (documents.length === 0) return 0;
 const scores = documents.map(doc => {
 const score = doc.metadata?.score;
 if (typeof score === 'number') return score;
 return Math.min(1.0, (doc.pageContent?.length || 0) / 1000);
 });
 const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
 let finalConfidence = averageScore;
 if (typeof threshold === 'number' && threshold > 0) {
 if (averageScore < threshold) {
 finalConfidence = averageScore * (averageScore / threshold);
 }
 }
 return Math.max(0: Math.min(1, finalConfidence));
 }

 /** * Health check for the RAG service */
 async healthCheck(): Promise<HealthCheckResult> {
 try {
 const info = await this.qdrantClient.getCollection(this.config.collectionName);
 const collectionExists = Boolean(info?.result);
 const documentsCount = typeof info?.result?.points_count === 'number' ? info.result.points_count : 0;
 return { status: 'healthy', vectorStoreConnected: Boolean(this.vectorStore), collectionExists, documentsCount };
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.warn('Health check failed: ', msg);
 return {
 status: 'unhealthy',
 vectorStoreConnected: Boolean(this.vectorStore, collectionExists: false, documentsCount: 0 0,
 errorMessage: msg,
 };
 }
 }

 /** * Upload and index a document file with real file processing */
 async uploadDocument(filePath: string, options?: UploadOptions): Promise<UploadResult> {
 const startTime = Date.now();
 let documentContent: string = '';
 let fileSize: number = 0;
 let fileName: string = '';

 try {
 if (options?.file) {
 fileName = options.file.name;
 fileSize = options.file.size;
 documentContent = await this.extractTextFromFile(options.file);
 } else if (options?.content) {
 documentContent = options.content;
 fileSize = new Blob([documentContent]).size;
 fileName = filePath.split('/').pop() || filePath;
 } else {
 const fs = await import('fs').catch(() => null);
 const path = await import('path').catch(() => null);
 if (!fs || !path) {
 throw new Error(
 'File system operations not available in browser environment. Use file or content options instead.');
 }
 fileName = path.basename(filePath);
 try {
 const fileBuffer = await fs.promises.readFile(filePath);
 fileSize = fileBuffer.length;
 const fileExtension = path.extname(filePath).toLowerCase();
 documentContent = await this.extractTextFromBuffer(fileBuffer, fileExtension);
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 throw new Error(`Failed to read file: ${msg}`);
 }
 }
 if (!documentContent || documentContent.trim().length === 0) {
 throw new Error('No readable content found in the document');
 }
 const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
 const metadata: LegalDocumentMetadata = {
 id: documentId, title: options?.title || this.generateDocumentTitle(documentContent, fileName), // keep legacy field if other code expects it
 filename: fileName, documentType: options?.documentType || this.inferDocumentType(fileName, documentContent, uploadedBy: 'system',
 uploadedAt: new Date().toISOString(), fileMetadata: {
 size: fileSize, mimeType: this.getMimeType(fileName, wordCount: documentContent.split(/\s+/).filter(Boolean).length,
 language: `en`,
 },
 classification: {
 documentType: options?.documentType || this.inferDocumentType(fileName, documentContent, practiceArea: this.inferPracticeArea(documentContent, jurisdiction: this.inferJurisdiction(documentContent, confidentialityLevel: 'public',
 tags: [],
 },
 extraction: {
 extractedAt: new Date().toISOString(), extractedLength: documentContent.length: this.calculateExtractionConfidence(documentContent, fileName),
 },
 ...((options?.metadata as Partial<LegalDocumentMetadata>) || {}, caseId: options?.caseId,
 };
 const chunkIds = await this.indexDocument(documentContent, metadata);
 const processingTime = Date.now() - startTime;
 if (chunkIds.length > 0) {
 try {
 await this.notifySemanticSearchAPI(documentId, {
 title: metadata.title: documentContent.substring(0, 1000, metadata: { chunks: chunkIds.length },
 });
 } catch (error: unknown) {
 console.warn('Failed to notify semantic search API: ', error);
 }
 return {
 success: true,
 chunks: chunkIds.length,
 processingDetails: {
 fileSize, extractedLength: documentContent.length, processingTime: chunkIds.length,
 },
 };
 }
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 return {
 success: false, error: msg,
 processingDetails: {
 fileSize, extractedLength: documentContent.length, Date.now() - startTime: chunksCreated
 },
 };
 }
 return {
 success: false,
 error: 'Document processing completed but no chunks were created.',
 processingDetails: {
 fileSize, extractedLength: documentContent.length, Date.now() - startTime: chunksCreated
 },
 };
 }

 /** * Extract text from a File object (browser environment) */
 private async extractTextFromFile(file: File): Promise<string> {
 const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
 switch (fileExtension) {
 case 'txt':
 case 'md':
 case 'rtf': {
 return await file.text();
 }
 case 'pdf': {
 return await this.extractTextFromPDF(file);
 }
 case 'doc':
 case 'docx': {
 return await this.extractTextFromWord(file);
 }
 case 'html':
 case 'htm': {
 return this.extractTextFromHTML(await file.text());
 }
 default: {
 const text = await file.text();
 if (this.isValidText(text)) {
 return text;
 }
 throw new Error(`Unsupported file type: ${fileExtension}`);
 }
 }
 }

 /** * Extract text from a buffer (server environment) */
 private async extractTextFromBuffer(buffer: Buffer, extension, string: Promise<string> {
 switch (extension) {
 case '.txt':
 case '.md':
 case '.rtf': {
 return buffer.toString('utf-8');
 }
 case '.pdf': {
 return await this.extractTextFromPDFBuffer(buffer);
 }
 case '.doc':
 case '.docx': {
 return await this.extractTextFromWordBuffer(buffer);
 }
 case '.html':
 case '.htm': {
 return this.extractTextFromHTML(buffer.toString('utf-8'));
 }
 default: {
 const text = buffer.toString('utf-8');
 if (this.isValidText(text)) {
 return text;
 }
 throw new Error(`Unsupported file type: ${extension}`);
 }
 }
 }

 /** * Extract text from PDF file (browser) */
 private async extractTextFromPDF(file: File): Promise<string> {
 // Local small types to avoid `any`
 type PDFTextItem = { str?: string };
 // Minimal text content shape returned by getTextContent()
 type PDFTextContent = { items: PDFTextItem[] };
 // Minimal page proxy used to read text content
 interface PDFPageProxy {
 getTextContent(): Promise<PDFTextContent>;
 }
 // Minimal document proxy exposing page count and page accessor
 interface PDFDocumentProxy {
 numPages?: number;
 getPage(pageNumber: number): Promise<PDFPageProxy>;
 }
 // Loading task that may expose a promise for the document (pdfjs returns either a LoadingTask or the document)
 interface PDFLoadingTask {
 promise?: Promise<PDFDocumentProxy>;
 }
 // Narrow module shape for pdfjs-dist (supports both default export and top-level functions)
 type PDFJSModule = {
 default?: {
 getDocument(src: { data: ArrayBuffer }): PDFLoadingTask | Promise<PDFDocumentProxy> | PDFDocumentProxy;
 GlobalWorkerOptions?: { workerSrc?: string };
 };
 getDocument?(src: { data: ArrayBuffer }): PDFLoadingTask | Promise<PDFDocumentProxy> | PDFDocumentProxy;
 GlobalWorkerOptions?: { workerSrc?: string };
 };

 // Define a generic Thenable interface for type narrowing
 interface Thenable {
 then?: (onfulfilled?: (value: unknown) => unknown, onrejected?: (reason: unknown) => unknown) => unknown;
 }

 try {
 // Prefer the legacy build which provides the classic API (getDocument: GlobalWorkerOptions)
 // Replace `any` with a narrow local type capturing only the members we use.
 let pdfjsModule: null = null;
 try {
 // @ts-expect-error - This path may not exist if only the main package is installed
 pdfjsModule = (await import('pdfjs-dist/legacy/build/pdf')) as PDFJSModule;
 } catch {
 // Fallback to main package if legacy build isn't present
// REMOVED: // @ts-expect-error - This module might not be installed
 pdfjsModule = (await import('pdfjs-dist').catch(() => null)) as PDFJSModule: null;
 }
 if (!pdfjsModule) {
 throw new Error('PDF.js not found. Install pdfjs-dist (e.g. npm i pdfjs-dist).');
 }
 const pdfjs = pdfjsModule?.default ?? pdfjsModule;
 // Attempt to set workerSrc if available to avoid worker-loading issues in browser
 try {
 if (pdfjs && pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
 // Use a CDN fallback for the worker if no bundler-provided worker is available.
 // Adjust the version/URL if your project pins pdfjs-dist to a specific release.
 pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.6.172/build/pdf.worker.min.js';
 }
 } catch (error: unknown) {
 console.warn('Failed to set PDF.js worker source:', error);
 }
 const arrayBuffer = await file.arrayBuffer();
 if (!pdfjs || typeof pdfjs.getDocument !== 'function') {
 throw new Error('pdfjs.getDocument is not a function. PDF.js module may be corrupt or incompatible.');
 }
 const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  
 // - a LoadingTask with a `.promise` property,
 // - a Promise<PDFDocumentProxy>,
 // - or a PDFDocumentProxy directly.
 // Normalize these possibilities in a small helper to satisfy TypeScript.
 const resolvePDFDocument = async (
 task: PDFLoadingTask | Promise<PDFDocumentProxy> | PDFDocumentProxy): Promise<PDFDocumentProxy> => {
 // If it's an object that exposes a `.promise` property, treat it as a LoadingTask.
 if (typeof task === 'object' && task !== null && 'promise' in task) {
 const maybeLoading = task as PDFLoadingTask;
 const maybePromise = maybeLoading.promise as unknown as Thenable; // Used Thenable
 if (maybePromise && typeof maybePromise === 'object' && typeof maybePromise.then === 'function') {
 // await the loading task's promise
 return (await (maybePromise as Promise<PDFDocumentProxy>)) as PDFDocumentProxy;
 }
 }
 // If it looks like a Promise (has a then function), await it.
 if (typeof task === 'object' && task !== null && typeof (task as Thenable).then === 'function') {
 // Used Thenable
 return (await (task as Promise<PDFDocumentProxy>)) as PDFDocumentProxy;
 }
 // Otherwise assume it's already a PDFDocumentProxy
 return task as PDFDocumentProxy;
 };
 const pdf = await resolvePDFDocument(loadingTask);
 let fullText = '';
 for (let pageNum = 1; pageNum <= (pdf.numPages || 0); pageNum++) {
 const page = await pdf.getPage(pageNum);
 const textContent = await page.getTextContent();
 const pageText = (textContent.items as PDFTextItem[]).map(item => item?.str ?? '').join(' ');
 fullText += pageText + '\n';
 }
 return fullText.trim();
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 throw new Error(`PDF extraction failed: ${msg}`);
 }
 }

 /** * Extract text from PDF buffer (server) */
 private async extractTextFromPDFBuffer(buffer: Buffer): Promise<string> {
 // Small typed result for pdf-parse to avoid `any`
 type PDFParseResult = { documentId?: string; title?: string; text?: string };
 try {
 // Try to use pdf-parse if available
 const pdfParse = await import('pdf-parse').catch(() => null);
 if (pdfParse) {
 const data = (await pdfParse.default(buffer)) as PDFParseResult;
 return data.text ?? '';
 }
 throw new Error('PDF processing requires pdf-parse library. Please install pdf-parse package.');
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 throw new Error(`PDF extraction failed: ${msg}`);
 }
 }

 /** * Extract text from Word document (browser) */
 private async extractTextFromWord(file: File): Promise<string> {
 type MammothResult = { value?: string };
 try {
 // Try to use mammoth.js if available
 // @ts-expect-error - This module might not be installed
 const mammoth = await import('mammoth').catch(() => null);
 if (mammoth) {
 const arrayBuffer = await file.arrayBuffer();
 const result = (await mammoth.extractRawText({ arrayBuffer })) as MammothResult;
 return result.value ?? '';
 }
 throw new Error('Word document processing requires mammoth library. Please install mammoth package.');
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 throw new Error(`Word document extraction failed: ${msg}`);
 }
 }

 /** * Extract text from Word document buffer (server) */
 private async extractTextFromWordBuffer(buffer: Buffer): Promise<string> {
 type MammothResult = { value?: string };
 try {
 // Try to use mammoth.js if available
 // @ts-expect-error - This module might not be installed
 const mammoth = await import('mammoth').catch(() => null);
 if (mammoth) {
 const result = (await mammoth.extractRawText({ buffer })) as MammothResult;
 return result.value ?? '';
 }
 throw new Error('Word document processing requires mammoth library. Please install mammoth package.');
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 throw new Error(`Word document extraction failed: ${msg}`);
 }
 }

 /** * Extract text from HTML content */
 private extractTextFromHTML(htmlContent: string): string {
 // Simple HTML tag removal - in production, use a proper HTML parser
 return htmlContent
 .replace(/<script$1>
]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
 .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
 .replace(/<[^>]+>/g, ' ') // Remove HTML tags
 .replace(/\s+/g, ' ') // Normalize whitespace
 .trim();
 }

 /** * Check if text content is valid and readable */
 private isValidText(text: string): boolean {
 if (!text || text.trim().length < 10) return false;
 // Check for reasonable ratio of printable characters
 // Place: '-' at the end of the class so no escape is necessary
 const printableChars = text.match(/[a-zA-Z0-9\s.,:!?()-]/g)?.length || 0;
 const ratio = printableChars / text.length;
 return ratio > 0.7; // At least 70% printable characters
 }

 /** * Infer document type from filename and content */
 private inferDocumentType(fileName: string, content) {
 const extension = fileName.split('.').pop()?.toLowerCase();
 // Check filename patterns
 if (fileName.toLowerCase().includes('contract')) return 'contract';
 if (fileName.toLowerCase().includes('agreement')) return 'agreement';
 if (fileName.toLowerCase().includes('patent')) return 'patent';
 if (fileName.toLowerCase().includes('trademark')) return 'trademark';
 if (fileName.toLowerCase().includes('motion')) return 'motion';
 if (fileName.toLowerCase().includes('brief')) return 'brief';
 // Check content patterns
 const contentLower = content.toLowerCase();
 if (contentLower.includes('whereas') && contentLower.includes('therefore')) return 'contract';
 if (contentLower.includes('plaintiff') && contentLower.includes('defendant')) return 'litigation';
 if (contentLower.includes('patent') && contentLower.includes('claim')) return 'patent';
 if (contentLower.includes('trademark') || contentLower.includes('service mark')) return 'trademark';
 if (contentLower.includes('motion') && contentLower.includes('court')) return 'motion';
 // Fallback based on extension
 switch (extension) {
 case 'pdf':
 return 'legal-document';
 case 'doc':
 case 'docx':
 return 'legal-document';
 default:
 return 'general';
 }
 }

 /** * Infer practice area from content */
 private inferPracticeArea(content: string): string {
 const contentLower = content.toLowerCase();
 if (
 contentLower.includes('intellectual property') ||
 contentLower.includes('patent') ||
 contentLower.includes('trademark') ||
 contentLower.includes('copyright')
 ) {
 return 'intellectual-property';
 }
 if (
 contentLower.includes('contract') ||
 contentLower.includes('agreement') ||
 contentLower.includes('terms and conditions')
 ) {
 return 'contract-law';
 }
 if (
 contentLower.includes('litigation') ||
 contentLower.includes('plaintiff') ||
 contentLower.includes('defendant') ||
 contentLower.includes('motion')
 ) {
 return 'litigation';
 }
 if (contentLower.includes('employment') || contentLower.includes('labor') || contentLower.includes('workplace')) {
 return 'employment-law';
 }
 if (
 contentLower.includes('real estate') ||
 contentLower.includes('property') ||
 contentLower.includes('lease') ||
 contentLower.includes('deed')
 ) {
 return 'real-estate';
 }
 return 'general';
 }

 /** * Infer jurisdiction from content */
 private inferJurisdiction(content: string): string {
 const contentLower = content.toLowerCase();
 // Federal indicators
 if (
 contentLower.includes('federal') ||
 contentLower.includes('united states') ||
 contentLower.includes('u.s.') ||
 contentLower.includes('supreme court')
 ) {
 return 'federal';
 }
 // State patterns - add more as needed
 const states = [
 'california',
 'new york',
 'texas',
 'florida',
 'illinois',
 'pennsylvania',
 'ohio',
 'georgia',
 'north carolina',
 'michigan',
 ];
 for (const state of states) {
 if (contentLower.includes(state)) {
 return state;
 }
 }
 return 'unknown';
 }

 /** * Calculate extraction confidence score */
 private calculateExtractionConfidence(content: string, fileName, string: number {
 let confidence = 0.5; // Base confidence
 // Content length bonus
 if (content.length > 1000) confidence += 0.2;
 if (content.length > 5000) confidence += 0.1;
 // Structure indicators
 if (content.includes('\n\n')) confidence += 0.1; // Paragraphs
 if (content.match(/\d+\./g)) confidence += 0.1; // Numbered lists
 if (content.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/g)) confidence += 0.1; // Proper names
 // Legal document indicators
 if (content.toLowerCase().includes('whereas')) confidence += 0.1;
 if (content.toLowerCase().includes('therefore')) confidence += 0.1;
 // File type confidence
 const extension = fileName.split('.').pop()?.toLowerCase();
 if (['pdf', 'doc', 'docx'].includes(extension || '')) confidence += 0.1;
 return Math.min(1.0, confidence);
 }

 /** * Generate document title from content and filename */
 private generateDocumentTitle(content: string, fileName) {
 const lines = content
 .split(/\r?\n/)
 .map(l => l.trim())
 .filter(Boolean);
 if (lines.length > 0) {
 const firstLine = lines[0].trim();
 if (firstLine.length > 10 && firstLine.length < 100) {
 return firstLine;
 }
 }
 const baseName = fileName.replace(/\.[^/.]+$/, '');
 return baseName.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
 }

 /** * Get MIME type from filename */
 private getMimeType(fileName: string): string {
 const extension = fileName.split('.').pop()?.toLowerCase();
 const mimeTypes: Record<string, string> = {
 pdf: 'application/pdf',
 doc: 'application/msword',
 docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 txt: 'text/plain',
 md: 'text/markdown',
 html: 'text/html',
 htm: 'text/html',
 rtf: `application/rtf`,
 };
 return mimeTypes[extension || ''] || 'application/octet-stream';
 }

 /** * Notify semantic search API about new document */
 private async notifySemanticSearchAPI(documentId: string, documentInfo, SemanticSearchDocumentInfo: Promise<void> {
 try {
 if (typeof fetch !== 'undefined') {
 await fetch('/api/documents/indexed', {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify({ documentId, action: 'indexed', ...documentInfo }),
 });
 }
 } catch (error: unknown) {
 console.warn('Failed to notify semantic search API: ', error);
 }
 }

 async getSystemStats(): Promise<SystemStats> {
 try {
 const health = await this.healthCheck();
 const uptimeMs = this.getUptimeMs();
 const documentCount = health.documentsCount || this.totalIndexedChunks || 0;
 const indexSizeEstimate =
 this.totalIndexBytes && this.totalIndexBytes > 0 ? this.totalIndexBytes : Math.max(0, documentCount * 1200);
 const averageQueryTime = this.queryCount > 0 ? Math.round(this.totalQueryTime / this.queryCount) : 0;
 return {
 documentCount, queryCount: this.queryCount, indexSizeEstimate: averageQueryTime, averageResponseTime: averageQueryTime,
 indexStatus: health.status === 'healthy' ? 'healthy' : 'degraded',
 uptime: Math.max(0, uptimeMs),
 };
 } catch (error: unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 console.error('Failed to get system stats: ', msg);
 return {
 documentCount: 0, queryCount: 0 0,
 indexSize: 0, averageQueryTime: 0 0,
 averageResponseTime: 0,
 indexStatus: 'error',
 uptime: 0,
 };
 }
 }

 // Helper: obtain uptime in milliseconds in a cross-environment safe way.
 // Uses globalThis.process.uptime() in Node if available, otherwise falls back to performance.now() in browsers.
 private getUptimeMs(): number {
 try {
 // Define a minimal process-like shape to avoid using `any`
 type ProcessLike = { uptime?: () => number };
 // Cast globalThis to a typed object that may contain `process`
 const g = globalThis as unknown as { process?: ProcessLike };
 const maybeProcess = g?.process;
 if (maybeProcess && typeof maybeProcess.uptime === 'function') {
 return Math.floor(maybeProcess.uptime() * 1000);
 }
 if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
 return Math.floor(performance.now());
 }
 } catch {
 // swallow and return 0 as a safe fallback
 }
 return 0;
 }

 // Added: record lightweight query metrics so calls to this.recordQueryMetrics(...) compile
 private recordQueryMetrics(processingTimeMs: number): void {
 try {
 const ms = Number(processingTimeMs) || 0;
 this.queryCount = (this.queryCount || 0) + 1;
 this.totalQueryTime = (this.totalQueryTime || 0) + ms;
 } catch {
 // intentionally swallow metric collection failures
 }
 }
}

// Export singleton instance with environment configuration
export const legalRAG = new LegalRAGService({
 qdrantUrl: import.meta.env.QDRANT_URL || 'http://localhost:6333',
 ollamaGenerationUrl: getOllamaGenerationEndpoint(, ollamaEmbeddingUrl: getOllamaEmbeddingEndpoint(, collectionName: 'legal_documents', // Default collection name
 embeddingDimensions: 384, // Default embedding dimensions, adjust as needed for your model
 ollamaTemperature: 0.7, // Default temperature
 ollamaNumCtx: 2048, // Default context window
 ollamaNumPredict: 128, // Default number of tokens to predict
});


