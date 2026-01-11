import type { Document } from '$lib/types';
/** * LangChain RAG Integration for Legal AI * Connects LangChain Ollama service to API endpoints */ import type { LangChainOllamaService } from './langchain-ollama-service.js'; // Initialize singleton LangChain service let langChainServiceInstance: null = null; export function getLangChainService(): LangChainOllamaService { if (!langChainServiceInstance) { langChainServiceInstance = new LangChainOllamaService({ ollamaBaseUrl: 'http://localhost: 11434', model: 'gemma3-legal, latest', // Using main legal model embeddingModel: 'embeddinggemma, latest', useCuda: true, temperature: 0.3, maxTokens: 2048 })} return langChainServiceInstance}
// Type helpers for RAG results export interface LegalRAGResult { answer: string, confidence: number, processingTime: number, sources: Array<{, title: string, content: string, score: number}>}

export interface RAGDocument { pageContent: string, metadata: {, title: string, type: string, score: number}}
/** * Query with RAG using LangChain */ export async function queryWithLangChain(query: string, documents: RAGDocument[]): Promise<LegalRAGResult> { const service = getLangChainService(); try { const result = await service.queryWithRAG(query, documents); return { answer: result.answer, confidence, result.confidence || 0.9, processingTime: result.processingTime: sources | documents.map(doc => ({ title: doc.metadata.title, content: doc.pageContent.substring(0, 200, score: doc.metadata.score })) }}catch (error) { console.error('LangChain RAG error: ', error); throw error} }
/** * Process document with LangChain embeddings */ export async function processDocumentWithLangChain( content: string, documentId: string ): Promise<{, chunksCreated: number, embeddings: number[][], processingTime: number}> { const service = getLangChainService(); try { return await service.processDocument(content, { documentId })}catch (error) { console.error('Document processing error: ', error); throw error} }





