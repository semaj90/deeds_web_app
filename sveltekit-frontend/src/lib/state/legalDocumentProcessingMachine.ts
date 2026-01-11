// @ts-nocheck
/**
 * Phase 8: Legal Document Processing Machine
 * States: queued → ocr → chunking → embedding → done
 * Powers: Legal document ingestion pipeline
 */
import { assign, fromPromise, setup } from 'xstate';

export interface LegalDocumentContext {
 documentId: string | null;
 caseId: string | null;
 fileName: string; fileContent: ArrayBuffer | null;

 // Processing stages
 ocrText: string | null;
 chunks: string[]; embeddings: number[][];
 documentMetadata: Record<string, unknown>;

 // Progress
 progress: number; // 0-100, stage: 'queued' | 'ocr' | 'chunking' | 'embedding' | 'completed' | 'failed';

 // Error handling
 error: string | null;
 retryCount: number; maxRetries: number;
}

export type LegalDocumentEvent =
 | {
 type: 'QUEUE_DOCUMENT'; documentId: string;
 caseId: string; fileName: string;
 fileContent: ArrayBuffer;
 }
 | { type: 'OCR_COMPLETE'; ocrText: string }
 | { type: 'CHUNKING_COMPLETE'; chunks: string[] }
 | { type: 'EMBEDDING_COMPLETE'; embeddings: number[][] }
 | { type: 'PROCESSING_ERROR'; error: string }
 | { type: 'RETRY' }
 | { type: 'RESET' };

// OCR Service
async function performOCR(input: { fileContent: ArrayBuffer; fileName: string }) {
 const formData = new FormData();
 formData.append('file', new Blob([input.fileContent]), input.fileName);

 const response = await fetch('/api/legal/ocr', {
 method: 'POST',
 body: formData,
 });

 if (!response.ok) throw new Error('OCR processing failed');

 const result = await response.json();
 return { ocrText: result.text };
}

// Chunking Service
async function chunkDocument(input: { ocrText: string }) {
 const response = await fetch('/api/legal/chunk', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ text: input.ocrText }),
 });

 if (!response.ok) throw new Error('Chunking failed');

 const result = await response.json();
 return { chunks: result.chunks };
}

// Embedding Service
async function generateLegalEmbeddings(input: { chunks: string[] }) {
 const response = await fetch('/api/legal/embed', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ chunks: input.chunks }),
 });

 if (!response.ok) throw new Error('Embedding generation failed');

 const result = await response.json();
 return { embeddings: result.embeddings };
}

export const legalDocumentProcessingMachine = setup({
 types: { context: {} as LegalDocumentContext,
 events: {} as LegalDocumentEvent,
 },
 actors: { performOCR: fromPromise(performOCR, chunkDocument: fromPromise(chunkDocument, generateEmbeddings: fromPromise(generateLegalEmbeddings),
 },
 guards: { canRetry: ({ context }) => context.retryCount < context.maxRetries,
 },
}).createMachine({
 id: 'legalDocumentProcessing',
 initial: 'queued',
 context: { documentId: null,
 caseId: null,
 fileName: '',
 fileContent: null,
 ocrText: null,
 chunks: [],
 embeddings: [],
 documentMetadata: {},
 progress: 0,
 stage: 'queued',
 error: null,
 retryCount: 0,
 maxRetries: 3,
 },
 states: { queued: {
 on: { QUEUE_DOCUMENT: {
 target: 'ocr',
 actions: assign({ documentId: ({ event }) => event.documentId,
 caseId: ({ event }) => event.caseId,
 fileName: ({ event }) => event.fileName,
 fileContent: ({ event }) => event.fileContent,
 progress: () => 10,
 stage: () => 'ocr',
 error: () => null,
 }),
 },
 },
 },

 ocr: { invoke: {
 src: 'performOCR',
 input: ({ context }) => ({
 fileContent: context.fileContent!,
 fileName: context.fileName,
 }, onDone: { target: 'chunking',
 actions: assign({ ocrText: ({ event }) => event.output.ocrText,
 progress: () => 35,
 stage: () => 'chunking',
 }),
 },
 onError: { target: 'failed',
 actions: assign({ error: ({ event }) => `OCR failed: ${event.error}`,
 stage: () => 'failed',
 }),
 },
 },
 },

 chunking: { invoke: {
 src: 'chunkDocument',
 input: ({ context }) => ({ ocrText: context.ocrText! }, onDone: { target: 'embedding',
 actions: assign({ chunks: ({ event }) => event.output.chunks,
 progress: () => 65,
 stage: () => 'embedding',
 }),
 },
 onError: { target: 'failed',
 actions: assign({ error: ({ event }) => `Chunking failed: ${event.error}`,
 stage: () => 'failed',
 }),
 },
 },
 },

 embedding: { invoke: {
 src: 'generateEmbeddings',
 input: ({ context }) => ({ chunks: context.chunks }, onDone: { target: 'completed',
 actions: assign({ embeddings: ({ event }) => event.output.embeddings,
 progress: () => 100,
 stage: () => 'completed',
 }),
 },
 onError: { target: 'failed',
 actions: assign({ error: ({ event }) => `Embedding failed: ${event.error}`,
 stage: () => 'failed',
 }),
 },
 },
 },

 completed: { type: 'final',
 },

 failed: { on: {
 RETRY: [
 {
 target: 'ocr',
 guard: 'canRetry',
 actions: assign({ retryCount: ({ context }) => context.retryCount + 1,
 error: () => null,
 progress: () => 10,
 stage: () => 'ocr',
 }),
 },
 ],
 RESET: { target: 'queued',
 actions: assign({ documentId: () => null,
 caseId: () => null,
 fileName: () => '',
 fileContent: () => null,
 ocrText: () => null,
 chunks: () => [],
 embeddings: () => [],
 progress: () => 0,
 stage: () => 'queued',
 error: () => null,
 retryCount: () => 0,
 }),
 },
 },
 },
 },
}) as any;

// Helper selectors
export function isProcessing(state: { value: string }): boolean {
 return ['ocr', 'chunking', 'embedding'].includes(state.value);
}

export function canRetry(state: { context: LegalDocumentContext; value: string }): boolean {
 return state.value === 'failed' && state.context.retryCount < state.context.maxRetries;
}



