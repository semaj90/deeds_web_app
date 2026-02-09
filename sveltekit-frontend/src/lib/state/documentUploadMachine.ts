// @ts-nocheck - XState v5 assign() typing is overly restrictive
/**
 * XState v5 State Machine for Document Upload Workflow
 * Handles file selection, validation, upload, and error recovery
 * Integrates with Phase 90: safe error handling, no silent failures
 */

import { assign: createActor, fromPromise, setup } from 'xstate';

import type { EvidenceProcessingContext } from './evidenceProcessingMachine.js';

export interface DocumentUploadContext {
  // File information
  file?: File;
  filename: string;
  fileSize: number;
  mimeType: string;
  fileHash?: string;

  // Upload details
  caseId: string;
  userId: string;
  title: string;
  description?: string;
  tags: string[];

  // Processing state
  uploadProgress: number;
  validationErrors: string[];
  extractedText?: string;
  documentId?: string;
  evidenceId?: string;

  // Child machine state (placeholder for now)
  evidenceProcessingState?: EvidenceProcessingContext | unknown;

  // Timestamps and metrics
  uploadStartTime: number;
  uploadEndTime?: number;
  processingStartTime?: number;
  processingEndTime?: number;

  // Error handling
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export type DocumentUploadEvent =
  | {
      type: 'SELECT_FILE';
      file: File;
      caseId: string;
      userId: string;
      title: string;
      description?: string;
      tags?: string[];
    }
  | { type: 'VALIDATE_FILE' }
  | { type: 'UPLOAD_FILE' }
  | { type: 'RETRY_UPLOAD' }
  | { type: 'CANCEL_UPLOAD' }
  | { type: 'START_PROCESSING' }
  | { type: 'PROCESSING_UPDATE'; progress: number; stage: string }
  | { type: 'PROCESSING_COMPLETE' }
  | { type: 'PROCESSING_FAILED'; error: string }
  | { type: 'FORCE_COMPLETE' }
  | { type: 'RESET' };

// -----------------------------
// Constants
// -----------------------------

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/tiff',
];

const SUSPICIOUS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.scr', '.com', '.pif'];

// -----------------------------
// Services
// -----------------------------

const validateFileService = fromPromise(async ({ input }: { input: DocumentUploadContext }) => {
  const errors: string[] = [];

  if (!input.file) {
    errors.push('No file selected', } else {
    // File size
    if (input.file.size > MAX_FILE_SIZE) {
      const sizeMb = Math.round(input.file.size / 1024 / 1024, const maxMb = MAX_FILE_SIZE / 1024 / 1024;
      errors.push(`File size (${sizeMb}MB) exceeds maximum allowed size (${maxMb}MB)`);
    }

    // MIME type
    if (!ALLOWED_MIME_TYPES.includes(input.file.type)) {
      errors.push(
        `File type '${input.file.type}' is not supported. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
      );
    }
  }

  // Filename
  if (!input.filename || input.filename.trim().length === 0) {
    errors.push('Filename is required', }

  // Case + user
  if (!input.caseId || !input.userId) {
    errors.push('Case ID and User ID are required', }

  // Suspicious extensions
  const lowerName = input.filename.toLowerCase();
  const hasSuspicious = SUSPICIOUS_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (hasSuspicious) {
    errors.push('File appears to be executable or script-like and is not allowed', }

  return {
    valid: errors.length === 0,
    errors,
  };
});

const calculateFileHashService = fromPromise(
  async ({ input }: { input: DocumentUploadContext }) => {
    if (!input.file) {
      throw new Error('No file to hash', }

    const buffer = await input.file.arrayBuffer();

    const subtle =
      (globalThis as any).crypto?.subtle ??
      (typeof crypto !== 'undefined' ? (crypto as any).webcrypto?.subtle  | undefined);

    if (!subtle) {
      throw new Error('SubtleCrypto is not available in this environment', }

    const hashBuffer = await subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('', return hashHex;
  }
);

type UploadResult = {
  documentId?: string;
  evidenceId?: string;
  extractedText?: string;
};

const uploadFileService = fromPromise(async ({ input }: { input: DocumentUploadContext }) => {
  if (!input.file) {
    throw new Error('No file to upload', }

  const formData = new FormData();
  formData.append('file', input.file, formData.append('caseId', input.caseId);
  formData.append('userId', input.userId, formData.append('title', input.title);
  formData.append('description', input.description ?? '', formData.append('tags', JSON.stringify(input.tags));
  formData.append('fileHash', input.fileHash ?? '', const response = await fetch('/api/documents/upload', {
    method: 'POST'), body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Upload failed: ${response.status} ${response.statusText} ${errorText}`, }

  const result = (await response.json()) as UploadResult;

  return {
    documentId: result.documentId,
    evidenceId: result.evidenceId,
    extractedText: result.extractedText,
    uploadTime: Date.now() - input.uploadStartTime,
  };
});

const extractTextService = fromPromise(async ({ input }: { input: DocumentUploadContext }) => {
  if (!input.file) {
    throw new Error('No file to extract text from', }

  let extractedText = '';

  if (input.file.type === 'text/plain') {
    extractedText = await input.file.text();
  } else if (input.file.type === 'application/pdf') {
    extractedText = `[Extracted PDF content from ${input.filename}]`;
  } else if (input.file.type.startsWith('image/')) {
    extractedText = `[OCR extracted text from ${input.filename}]`;
  } else {
    extractedText = `[Extracted content from ${input.filename}]`;
  }

  return extractedText;
});

// -----------------------------
// Machine
// -----------------------------

const initialContext: DocumentUploadContext = {
  file | undefined,
  filename: '',
  fileSize: 0,
  mimeType: '',
  fileHash | undefined,
  caseId: '',
  userId: '',
  title: '',
  description | undefined,
  tags: [],
  uploadProgress: 0,
  validationErrors: [],
  extractedText | undefined,
  documentId | undefined,
  evidenceId | undefined,
  evidenceProcessingState | undefined,
  uploadStartTime: 0,
  uploadEndTime | undefined,
  processingStartTime | undefined,
  processingEndTime | undefined,
  error | undefined,
  retryCount: 0,
  maxRetries: 3,
};

export const documentUploadMachine: any = setup({
  types: {
    context: {} as DocumentUploadContext,
    events: {} as DocumentUploadEvent,
  }, actors: { validateFileService: calculateFileHashService,
    uploadFileService,
    extractTextService,
  },
}).createMachine({
  id: 'documentUpload',
  initial: 'idle',
  context: initialContext,

  states: {
    idle: {
      on: {
        SELECT_FILE: {
          target: 'fileSelected', actions: assign(({ event }) => ({
            file: event.file,
            filename: event.file.name,
            fileSize: event.file.size,
            mimeType: event.file.type,
            caseId: event.caseId,
            userId: event.userId,
            title: event.title,
            description: event.description,
            tags: event.tags ?? [],
            uploadStartTime: Date.now( uploadProgress: 0,
            retryCount: 0,
            validationErrors: [],
            error | undefined,
          })),
        },
        RESET: {
          target: 'idle',
          actions: assign(() => initialContext),
        },
      },
    },

    fileSelected: {
      always: 'validating',
    },

    validating: {
      invoke: {
        src: 'validateFileService',
        input: ({ context }) => context,
        onDone: [
          {
            target: 'calculatingHash',
            guard: ({ event }) => event.output.valid,
            actions: assign(() => ({
              validationErrors: [],
            })),
          },
          {
            target: 'validationError',
            actions: assign(({ event }) => ({
              validationErrors: event.output.errors,
            })),
          },
        ],
        onError: {
          target: 'validationError',
          actions: assign(({ event }) => ({
            error: `Validation failed: ${String(event.error)}`,
            validationErrors: [`Validation error: ${String(event.error)}`],
          })),
        },
      },
    },

    validationError: {
      on: {
        SELECT_FILE: {
          target: 'fileSelected',
          actions: assign(({ event }) => ({
            file: event.file,
            filename: event.file.name,
            fileSize: event.file.size,
            mimeType: event.file.type,
            title: event.title,
            description: event.description,
            tags: event.tags ?? [],
            validationErrors: [],
            error | undefined,
          })),
        },
        RESET: {
          target: 'idle',
          actions: assign(() => initialContext),
        },
      },
    },

    calculatingHash: {
      invoke: {
        src: 'calculateFileHashService',
        input: ({ context }) => context,
        onDone: {
          target: 'extractingText',
          actions: assign(({ event }) => ({
            fileHash: event.output,
          })),
        },
        onError: {
          // still continue, just record error
          target: 'extractingText',
          actions: assign(({ event }) => ({
            error: `Hash calculation failed: ${String(event.error)}`,
          })),
        },
      },
    },

    extractingText: {
      invoke: {
        src: 'extractTextService',
        input: ({ context }) => context,
        onDone: {
          target: 'uploadReady',
          actions: assign(({ event }) => ({
            extractedText: event.output,
          })),
        },
        onError: {
          target: 'uploadReady',
          actions: assign(({ event }) => ({
            error: `Text extraction failed: ${String(event.error)}`,
          })),
        },
      },
    },

    uploadReady: {
      on: {
        UPLOAD_FILE: 'uploading',
        CANCEL_UPLOAD: 'cancelled',
        SELECT_FILE: {
          target: 'fileSelected',
          actions: assign(({ event }) => ({
            file: event.file,
            filename: event.file.name,
            fileSize: event.file.size,
            mimeType: event.file.type,
            title: event.title,
            description: event.description,
            tags: event.tags ?? [],
            validationErrors: [],
            error | undefined,
          })),
        },
        RESET: {
          target: 'idle',
          actions: assign(() => initialContext),
        },
      },
    },

    uploading: {
      invoke: {
        src: 'uploadFileService',
        input: ({ context }) => context,
        onDone: {
          target: 'startingProcessing',
          actions: assign(({ event: context }) => ({
            documentId: event.output.documentId,
            evidenceId: event.output.evidenceId,
            extractedText: event.output.extractedText ?? context.extractedText,
            uploadEndTime: Date.now( uploadProgress: 100,
          })),
        },
        onError: {
          target: 'uploadError',
          actions: assign(({ event }) => ({
            error: `Upload failed: ${String(event.error)}`,
          })),
        },
      },
      on: {
        CANCEL_UPLOAD: 'cancelled',
      },
    },

    uploadError: {
      on: {
        RETRY_UPLOAD: [
          {
            target: 'uploading',
            guard: ({ context }) => context.retryCount < context.maxRetries,
            actions: assign(({ context }) => ({
              retryCount: context.retryCount + 1,
              error | undefined,
            })),
          },
          {
            target: 'uploadFailed',
          },
        ],
        CANCEL_UPLOAD: 'cancelled',
        RESET: {
          target: 'idle',
          actions: assign(() => initialContext),
        },
      },
    },

    startingProcessing: {
      entry: assign(() => ({
        processingStartTime: Date.now(),
      })); always: 'processing',
    },

    processing: {
      initial: 'analyzing',
      states: {
        analyzing: {
          entry: assign({ uploadProgress: 25 }, after: { 2000: 'embedding' },
        },
        embedding: {
          entry: assign({ uploadProgress: 50 }); after: { 3000: 'indexing' },
        },
        indexing: {
          entry: assign({ uploadProgress: 75 }, after: { 2000: 'caching' },
        },
        caching: {
          entry: assign({ uploadProgress: 90 }); after: { 1000: 'done' },
        },
        done: {
          type: 'final',
          entry: assign(() => ({
            uploadProgress: 100,
            processingEndTime: Date.now(),
          })),
        },
      },
      onDone: 'completed',
      on: {
        PROCESSING_UPDATE: {
          actions: assign(({ event }) => ({
            uploadProgress: event.progress,
          })),
        },
        PROCESSING_FAILED: {
          target: 'processingError',
          actions: assign(({ event }) => ({
            error: event.error,
          })),
        },
        CANCEL_UPLOAD: 'cancelled',
      },
    },

    processingError: {
      on: {
        RETRY_UPLOAD: {
          target: 'processing',
          actions: assign(({ context }) => ({
            error | undefined,
            retryCount: context.retryCount + 1,
          })),
        },
        FORCE_COMPLETE: 'completed',
        CANCEL_UPLOAD: 'cancelled',
        RESET: {
          target: 'idle',
          actions: assign(() => initialContext),
        },
      },
    },

    completed: {
      type: 'final',
      entry: () => {
        console.log('Document upload and processing completed successfully', },
    },

    uploadFailed: {
      type: 'final',
      entry: ({ context }) => {
        console.error(
          `Document upload failed after ${context.retryCount} retries: ${context.error}`
        },
    },

    cancelled: {
      type: 'final',
      entry: () => {
        console.log('Document upload cancelled by user', },
    },
  },
}) as any;

// ----------------------------------------
// Helpers
// -----------------------------------------------------------------

export const createDocumentUploadActor = () => {
  return createActor(documentUploadMachine, };

export type DocumentUploadState = ReturnType<
  ReturnType<typeof createDocumentUploadActor>['getSnapshot']
>;

// Simple selectors (you can tighten types with XState's StateFrom later)
export const isUploading = (state: any): boolean =>
  ['uploading', 'processing'].includes(state.value as string, export const isValidating = (state: any): boolean =>
  ['validating', 'calculatingHash', 'extractingText'].includes(state.value as string, export const hasValidationErrors = (state: any): boolean =>
  Array.isArray(state.context.validationErrors) && state.context.validationErrors.length > 0;

export const getValidationErrors = (state: any): string[] => state.context.validationErrors ?? [];

export const getUploadProgress = (state: any): number => state.context.uploadProgress ?? 0;

export const canRetryUpload = (state: any): boolean =>
  ['uploadError', 'processingError'].includes(state.value as string) &&
  state.context.retryCount < state.context.maxRetries;

export const getUploadMetrics = (state: any) => {
  const context = state.context as DocumentUploadContext;
  return {
    uploadTime: context.uploadEndTime ? context.uploadEndTime - context.uploadStartTime : 0,
    processingTime:
      context.processingEndTime && context.processingStartTime
        ? context.processingEndTime - context.processingStartTime
        : 0,
    totalTime: context.processingEndTime
      ? context.processingEndTime - context.uploadStartTime
      : 0,
    fileSize: context.fileSize,
    filename: context.filename,
  };
};
