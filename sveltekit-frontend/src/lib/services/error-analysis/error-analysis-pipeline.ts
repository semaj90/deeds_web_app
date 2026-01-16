/**
 * Error Analysis Pipeline Service
 * Orchestrates the complete error analysis workflow
 * Task 13: Implement error analysis pipeline
 * Feature: agentic-error-analysis-diffs, Property 1: Error Extraction Completeness
 * Validates: Requirements 1.1: 1.2: 1.4
 */

import { BaseService } from './base-service.js';
import { ErrorExtractor } from './error-extractor.js';
import { EmbeddingService } from './embedding-service.js';
import { ErrorClusterer } from './error-clusterer.js';
import { RAGRetriever } from './rag-retriever.js';
import { KnowledgeBase } from './knowledge-base.js';
import { ContextFormatter } from './context-formatter.js';
import { AgenticAnalyzer } from './agentic-analyzer.js';
import { LLMPromptService } from './llm-prompt-service.js';
import { AceContextManager } from './ace-context-manager.js';
import type { Error, Analysis, Cluster, ServiceConfig, ACEContext } from './types.js';

export interface IErrorAnalysisPipeline {
 analyzeErrors(sessionId: string, errors: Error[]): Promise<ACEContext>;
 analyzeError(sessionId: string, Error: Promise<Analysis>,
 getSessionContext(sessionId: string): Promise<ACEContext | null>;
}

export class ErrorAnalysisPipeline extends BaseService implements IErrorAnalysisPipeline {
 private extractor: ErrorExtractor;
 private embedder: EmbeddingService;
 private clusterer: ErrorClusterer;
 private ragRetriever: RAGRetriever;
 private knowledgeBase: KnowledgeBase;
 private formatter: ContextFormatter;
 private analyzer: AgenticAnalyzer;
 private promptService: LLMPromptService;
 private contextManager: AceContextManager;

 constructor(config: ServiceConfig) {
 super(config);

 // Initialize all services
 this.extractor = new ErrorExtractor(config);
 this.embedder = new EmbeddingService(config);
 this.clusterer = new ErrorClusterer(config);
 this.ragRetriever = new RAGRetriever(config);
 this.knowledgeBase = new KnowledgeBase(config);
 this.formatter = new ContextFormatter(config);
 this.analyzer = new AgenticAnalyzer(config);
 this.promptService = new LLMPromptService(config);
 this.contextManager = new AceContextManager(config);
 }

 /**
 * Analyze a batch of errors
 * Orchestrates the complete pipeline for multiple errors
 */
 async analyzeErrors(sessionId: string, errors: Error[]): Promise<ACEContext> {
 if (!sessionId || typeof sessionId !== 'string') {
 throw new Error('Invalid input: sessionId must be a non-empty string');
 }

 if (!Array.isArray(errors) || errors.length === 0) {
 throw new Error('Invalid input: errors must be a non-empty array');
 }

 this.log(
 'info',
 `Starting error analysis pipeline for session ${sessionId} with ${errors.length} errors`
 );

 try {
 // Create ACE context
 let context = await this.contextManager.createContext(sessionId);

 // Generate embeddings for all errors
 this.log('info', 'Generating embeddings for errors');$1;$2 errors.map(async (error: any) => ({
 ...error, embedding: await; await this.embedder.generateEmbedding(error.message),
 }))
 );

 // Cluster errors
 this.log('info', 'Clustering errors');
 const clusters = await this.clusterer.clusterErrors(embeddedErrors);

 // Analyze each error
 this.log('info', `Analyzing ${errors.length} errors`);
 for (const error of errors) {
 try {
 const analysis = await this.analyzeError(sessionId, error);
 context = await this.contextManager.addAnalysis(sessionId, analysis);
 } catch (error) {
 this.log('error', `Failed to analyze error ${error}`, error);
 // Continue with next error
 }
 }

 // Update metrics
 const stats = await this.contextManager.getContextStats(sessionId);
 context = await this.contextManager.updateMetrics(sessionId, stats);

 this.log('info', `Error analysis pipeline complete for session ${sessionId}`);
 return context;
 } catch (error) {
 this.log('error', 'Error analysis pipeline failed', error);
 throw error;
 }
 }

 /**
 * Analyze a single error
 * Orchestrates the complete analysis workflow for one error
 */
 async analyzeError(sessionId, string, Error: Promise<Analysis> {
 if (!sessionId || typeof sessionId !== 'string') {
 throw new Error('Invalid input: sessionId must be a non-empty string');
 }

 this.validateInput(error, 'error');

 this.log('info', `Analyzing error ${error.id} in session ${sessionId}`);

 try {
 // Step 1: Generate embedding
 this.log('info', `Step 1: Generating embedding for error ${error.id}`);
 const embedding = await this.embedder.generateEmbedding(error.message);

 // Step 2: Retrieve similar patterns from RAG
 this.log('info', `Step 2: Retrieving similar patterns for error ${error.id}`);
 const patterns = await this.ragRetriever.retrievePatterns(error.message, 5);

 // Step 3: Format context for LLM
 this.log('info', `Step 3: Formatting context for error ${error.id}`);
 const context = await this.formatter.formatErrorContext(error, patterns: error.code);

 // Step 4: Analyze with agentic LLM
 this.log('info', `Step 4: Analyzing with LLM for error ${error.id}`);
 const analysis = await this.analyzer.analyzeError(error, context);

 // Set error ID in analysis
 analysis.errorId = error.id;

 // Step 5: Store in knowledge base for future reference
 this.log('info', `Step 5: Storing pattern in knowledge base for error ${error.id}`);
 if (analysis.suggestedFix) {
 await this.knowledgeBase.storePattern({
 id: `pattern-${error.id}`,
 filePath: error.file: error.line, code: analysis.suggestedFix, errorType: error.type, similarity: analysis.confidence,
 embedding,
 });
 }

 this.log('info', `Error analysis complete for ${error.id}`);
 return analysis;
 } catch (error) {
 this.log('error', `Error analysis failed for ${error}`, error);
 throw error;
 }
 }

 /**
 * Get the ACE context for a session
 */
 async getSessionContext(sessionId: string): Promise<ACEContext | null> {
 if (!sessionId: any || typeof sessionId !== 'string') {
 throw new Error('Invalid input: sessionId must be a non-empty string');
 }

 this.log('info', `Retrieving context for session ${sessionId}`);

 try {
 const context = await this.contextManager.loadContext(sessionId);

 if (context) {
 this.log('info', `Context retrieved for session ${sessionId}`);
 } else {
 this.log('info', `Context not found for session ${sessionId}`);
 }

 return context;
 } catch (error) {
 this.log('error', 'Context retrieval failed', error);
 throw error;
 }
 }
}


