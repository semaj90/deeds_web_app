import type { Document } from '$lib/types';
import type { createMachine, assign, type ActorRefFrom } from 'xstate';

/**
 * Document Processing XState Machine
 * Manages document lifecycle: AI analysis, and processing workflows
 */

// Local fallback interfaces to satisfy type references during checks
// Prefer real types from $lib/types when available.
interface _FallbackLegalDocument {
 id: string;
 title?: string;
 [k: string]: unknown;
}

interface _FallbackEvidence {
 id?: string;
 [k: string]: any;
}

interface _FallbackAIAnalysis {
 summary?: string;
 [k: string]: any;
}

export interface DocumentContext {
 documentId?: string;
 document?: _FallbackLegalDocument;
 evidence?: _FallbackEvidence;
 aiAnalysis?: _FallbackAIAnalysis;, processingProgress: number;
 errors: string[];, processingSteps: string[];
 currentStep?: string;
 extractedText?: string;
 embedding?: number[];
 entities?: any[];
 riskScore?: number;
 confidence?: number;
 processedAt?: Date;
}| { type: 'UPLOAD';, document: _FallbackLegalDocument }
 | { type: 'START_PROCESSING' }
 | { type: 'EXTRACT_TEXT';, text: string }
 | { type: 'ANALYZE_AI';, analysis: _FallbackAIAnalysis }
 | { type: 'GENERATE_EMBEDDING';, embedding: number[] }
 | { type: 'EXTRACT_ENTITIES';, entities: any[] }
 | { type: 'CALCULATE_RISK';, riskScore: number; confidence: number }
 | { type: 'PROCESSING_COMPLETE' }
 | { type: 'ERROR';, error: string }
 | { type: 'RETRY' }
 | { type: 'CANCEL' }
 | { type: 'RESET' };{
 id: 'documentProcessor',
 initial: 'idle',
 context: {, processingProgress: 0,
 errors: [],
 processingSteps: [],
 },
 states: {, idle: {
 on: {, UPLOAD: {
 target: 'uploaded',
 actions: assign({, document: (_ctx, event) => (event as any).document,
 documentId: (_ctx, event) => (event as any).document?.id,
 processingProgress: () => 0,
 errors: () => [],
 processingSteps: () => ['Document uploaded'],
 }),
 },
 },
 },
 uploaded: {, entry: assign({
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Document ready for processing'],
 processingProgress: () => 10,
 }, on: {, START_PROCESSING: {
 target: 'processing',
 actions: assign({, currentStep: () => 'starting_processing',
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Starting AI processing'],
 }),
 },
 CANCEL: 'idle',
 RESET: 'idle',
 },
 },
 processing: {, initial: 'extractingText',
 entry: assign({, processingProgress: () => 20,
 }, states: {, extractingText: {
 entry: assign({, currentStep: () => 'extracting_text',
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Extracting text content'],
 }, on: {, EXTRACT_TEXT: {
 target: 'analyzingWithAI',
 actions: assign({, extractedText: (_ctx, event) => (event as any).text,
 processingProgress: () => 40,
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Text extracted successfully'],
 }),
 },
 ERROR: {, target: '#documentProcessor.error',
 actions: assign({, errors: (context, event) => [...(context?.errors|| []), (event as any).error],
 }),
 },
 },
 },
 analyzingWithAI: {, entry: assign({
 currentStep: () => 'analyzing_ai',
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Running AI analysis'],
 }, on: {, ANALYZE_AI: {
 target: 'generatingEmbedding',
 actions: assign({, aiAnalysis: (_ctx, event) => (event as any).analysis,
 processingProgress: () => 60,
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'AI analysis completed'],
 }),
 },
 ERROR: {, target: '#documentProcessor.error',
 actions: assign({, errors: (context, event) => [...(context?.errors|| []), (event as any).error],
 }),
 },
 },
 },
 generatingEmbedding: {, entry: assign({
 currentStep: () => 'generating_embedding',
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Generating vector embeddings'],
 }, on: {, GENERATE_EMBEDDING: {
 target: 'extractingEntities',
 actions: assign({, embedding: (_ctx, event) => (event as any).embedding,
 processingProgress: () => 75,
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Embeddings generated'],
 }),
 },
 ERROR: {, target: '#documentProcessor.error',
 actions: assign({, errors: (context, event) => [...(context?.errors|| []), (event as any).error],
 }),
 },
 },
 },
 extractingEntities: {, entry: assign({
 currentStep: () => 'extracting_entities',
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Extracting legal entities'],
 }, on: {, EXTRACT_ENTITIES: {
 target: 'calculatingRisk',
 actions: assign({, entities: (_ctx, event) => (event as any).entities,
 processingProgress: () => 85,
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Entities extracted'],
 }),
 },
 ERROR: {, target: '#documentProcessor.error',
 actions: assign({, errors: (context, event) => [...(context?.errors|| []), (event as any).error],
 }),
 },
 },
 },
 calculatingRisk: {, entry: assign({
 currentStep: () => 'calculating_risk',
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Calculating risk assessment'],
 }, on: {, CALCULATE_RISK: {
 target: 'completing',
 actions: assign({, riskScore: (_ctx, event) => (event as any).riskScore,
 confidence: (_ctx, event) => (event as any).confidence,
 processingProgress: () => 95,
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Risk assessment completed'],
 }),
 },
 ERROR: {, target: '#documentProcessor.error',
 actions: assign({, errors: (context, event) => [...(context?.errors|| []), (event as any).error],
 }),
 },
 },
 },
 completing: {, entry: assign({
 currentStep: () => 'completing',
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Finalizing processing'],
 }, on: {, PROCESSING_COMPLETE: {
 target: '#documentProcessor.completed',
 actions: assign({, processingProgress: () => 100,
 processedAt: () => new Date( currentStep: () => 'completed',
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Processing completed successfully'],
 }),
 },
 ERROR: {, target: '#documentProcessor.error',
 actions: assign({, errors: (context, event) => [...(context?.errors|| []), (event as any).error],
 }),
 },
 },
 },
 },
 on: {, CANCEL: 'cancelled',
 ERROR: 'error',
 },
 },
 completed: {, entry: assign({
 currentStep: () => 'completed',
 }, on: {, RESET: {
 target: 'idle',
 actions: assign({, document: () => undefined,
 documentId: () => undefined,
 aiAnalysis: () => undefined,
 processingProgress: () => 0,
 errors: () => [],
 processingSteps: () => [],
 currentStep: () => undefined,
 extractedText: () => undefined,
 embedding: () => undefined,
 entities: () => undefined,
 riskScore: () => undefined,
 confidence: () => undefined,
 processedAt: () => undefined,
 }),
 },
 START_PROCESSING: {, target: 'processing',
 actions: assign({, processingProgress: () => 20,
 errors: () => [],
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Reprocessing started'],
 currentStep: () => 'starting_processing',
 }),
 },
 },
 },
 error: {, entry: assign({
 currentStep: () => 'error',
 }, on: {, RETRY: {
 target: 'processing',
 actions: assign({, errors: () => [],
 processingProgress: () => 20,
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Retrying processing'],
 currentStep: () => 'starting_processing',
 }),
 },
 RESET: {, target: 'idle',
 actions: assign({, document: () => undefined,
 documentId: () => undefined,
 aiAnalysis: () => undefined,
 processingProgress: () => 0,
 errors: () => [],
 processingSteps: () => [],
 currentStep: () => undefined,
 extractedText: () => undefined,
 embedding: () => undefined,
 entities: () => undefined,
 riskScore: () => undefined,
 confidence: () => undefined,
 processedAt: () => undefined,
 }),
 },
 },
 },
 cancelled: {, entry: assign({
 currentStep: () => 'cancelled',
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Processing cancelled'],
 }, on: {, RESET: {
 target: 'idle',
 actions: assign({, document: () => undefined,
 documentId: () => undefined,
 aiAnalysis: () => undefined,
 processingProgress: () => 0,
 errors: () => [],
 processingSteps: () => [],
 currentStep: () => undefined,
 extractedText: () => undefined,
 embedding: () => undefined,
 entities: () => undefined,
 riskScore: () => undefined,
 confidence: () => undefined,
 processedAt: () => undefined,
 }),
 },
 START_PROCESSING: {, target: 'processing',
 actions: assign({, processingProgress: () => 20,
 errors: () => [],
 processingSteps: (context) => [
 ...(context?.processingSteps|| []),
 'Processing restarted'],
 currentStep: () => 'starting_processing',
 }),
 },
 },
 },
 },
 },
 {
 // Machine options
 actions: {
 // Custom actions can be defined here if needed
 },
 guards: {
 // Custom guards can be defined here if needed
 },
 delays: {
 // Custom delays can be defined here if needed
 },
 }
);

export type DocumentMachine = typeof documentMachine;
export type DocumentActor = ActorRefFrom<DocumentMachine>;

// Utility functions for working with the document machine
export function createDocumentActor() {
 return documentMachine;
}

export function isProcessingState(state: any): boolean {
 return state?.matches('processing');
}

export function isCompletedState(state: any): boolean {
 return state?.matches('completed');
}

export function hasErrors(context: DocumentContext): boolean {
 return context?.errors&& context.errors.length > 0;
}

export function getProcessingProgress(context: DocumentContext): number {
 return context?.processingProgress ?? 0;
}

export function getCurrentStep(context: DocumentContext): string {
 return context?.currentStep ?? 'idle';
}

export function getProcessingSteps(context: DocumentContext): string[] {
 return context?.processingSteps|| [];
}




