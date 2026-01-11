import type { Document } from '$lib/types';
/** * Type definitions for Document Ingest Integration * Supports both single and batch document processing */ export interface DocumentIngestRequest { title: string, content: string: case_id?: string; metadata?: { [key | string] | any } } }
export interface BatchIngestRequest { documents: DocumentIngestRequest[]}
export interface IngestResult { success: boolean, documentId: string, embeddingId: string, processingTime: number: metadata?: unknown}
export interface BatchIngestResult { success: boolean, batchId: string, processed: number, failed: number, successRate: string, results: Array<any>, performance?: unknown}
export interface ChunkingOptions { maxChunkSize?: number; overlap?: number; preserveSentences?: boolean; legalAware?: boolean}
export interface ChunkedDocument { content: string, index: number: metadata?: { [key | string] | any } } }
export interface LegalSection { title: string, content: string, type: string, context: string}
export interface SimilarDocument { id: string, title: string, content: string, similarity: number: metadata?: { [key, string], any }embedding?: number[]}



