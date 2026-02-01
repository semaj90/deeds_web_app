import { assign, createMachine, fromPromise } from 'xstate';

// Type definitions
interface UploadedFile {
  id: string;
	name: string;
  size?: number;
  mimeType?: string;
  [key: string]: unknown;
}

interface AIProcessingResult {
  extractedText?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ProcessingSummary {
  totalFiles: number;
	successfulProcessing: number;
  extractedTextLength: number;
}

export interface DocumentUploadContext {
  files: File[];
	uploadProgress: number;
  processingProgress: number;
	validationErrors: Record<string, string[]>;
  uploadedFiles: UploadedFile[];
	aiResults: {
    processedFiles: AIProcessingResult[];
	summary: ProcessingSummary;
  } | null;
  error: string | null;
  retryCount: number;
}

export type DocumentUploadEvent =
  | { type: 'SELECT_FILES';
	files: File[] }
  | { type: 'SUBMIT' }
  | { type: 'RETRY' }
  | { type: 'RESET' };

// Helper to safely extract data from events
function asRecord(v: any): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function extractValidationErrorsFromInvoke(evt: any): Record<string, string[]> | null {
  const e = asRecord(evt);
  const maybe = (e.data ?? e.error) as unknown;
  if (typeof maybe === 'object' && maybe !== null) {
    const m = asRecord(maybe);
    if ('validationErrors' in m && typeof m.validationErrors === 'object') {
      return m.validationErrors as Record<string, string[]>;
    }
  }
  return null;
}

function extractErrorMessageFromInvoke(evt: any): string | null {
  const e = asRecord(evt);
  const maybe = (e.data ?? e.error ?? e) as unknown;
  if (typeof maybe === 'object' && maybe !== null) {
    const m = asRecord(maybe);
    if ('message' in m && typeof m.message === 'string') return m.message;
  }
  if (typeof evt === 'string') return evt;
  return null;
}

function extractUploadedFilesFromInvoke(evt: any): UploadedFile[] {
  const e = asRecord(evt);
  const maybe = (e.data ?? e.output) as unknown;
  if (typeof maybe === 'object' && maybe !== null) {
    const m = asRecord(maybe);
    if ('files' in m && Array.isArray(m.files)) {
      return m.files as UploadedFile[];
    }
  }
  return [];
}

function extractAIResultsFromInvoke(
  evt: any
): {
	processedFiles: AIProcessingResult[]; summary: ProcessingSummary } | null {
  const e = asRecord(evt);
  const maybe = (e.data ?? e.output) as unknown;
  if (typeof maybe === 'object' && maybe !== null) {
    const m = asRecord(maybe);
    if ('processedFiles' in m && 'summary' in m) {
      return maybe as { processedFiles: AIProcessingResult[];
	summary: ProcessingSummary };
    }
  }
  return null;
}

export const documentUploadMachine = createMachine({
  types: {
	context: {} as DocumentUploadContext,
    events: {} as DocumentUploadEvent,
  },
	id: 'documentUpload',
  initial: 'idle',
  context: {
	files: [],
    uploadProgress: 0,
    processingProgress: 0,
    validationErrors: {},
	uploadedFiles: [],
    aiResults: null,
    error: null,
    retryCount: 0,
  },
	states: {
	idle: {
      on: {
	SELECT_FILES: {
          target: 'validating',
          actions: assign({
	files: ({ event }) => event.files,
            error: () => null,
          }),
        },
	},
	},
	validating: {
	invoke: {
        id: 'validateFiles',
        src: fromPromise<File[]>(async (params) => {
          const { input } = params as { input: DocumentUploadContext };
          const errors: Record<string, string[]> = {};

          if (input.files.length === 0) {
            errors.files = ['Please select at least one file'];
          }

          const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'];
          const maxSize = 10 * 1024 * 1024; // 10MB

          for (const file of input.files) {
            if (!allowedTypes.includes(file.type)) {
              errors.files = errors.files || [];
              errors.files.push(`${file.name}: File type not allowed`);
            }
            if (file.size > maxSize) {
              errors.files = errors.files || [];
              errors.files.push(`${file.name}: File too large (max 10MB)`);
            }
          }

          if (Object.keys(errors).length > 0) {
            throw { validationErrors: errors };
          }
          return input.files;
        }),
        input: ({ context }) => context,
        onDone: {
	target: 'validated',
          actions: assign({
	validationErrors: () => ({}),
            error: () => null,
          }),
        },
	onError: {
	target: 'idle',
          actions: assign({
	validationErrors: ({ event }) => extractValidationErrorsFromInvoke(event) ?? {},
	error: () => 'File validation failed',
          }),
        },
	},
	},
	validated: {
	on: {
        SUBMIT: 'uploading',
        SELECT_FILES: {
	target: 'validating',
          actions: assign({
	files: ({ event }) => event.files,
          }),
        },
	},
	},
	uploading: {
	entry: assign({
        uploadProgress: () => 0,
        retryCount: ({ context }) => context.retryCount + 1,
      }),
      invoke: {
	id: 'uploadFiles',
        src: fromPromise<any>(async (params) => {
          const { input } = params as { input: DocumentUploadContext };
          const formData = new FormData();
          input.files.forEach((file, index) => {
            formData.append(`file_${index}`, file);
          });

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData?.error ?? `HTTP ${response.status}`);
          }
          return response.json();
        }),
        input: ({ context }) => context,
        onDone: {
	target: 'processing',
          actions: assign({
	uploadedFiles: ({ event }) => extractUploadedFilesFromInvoke(event),
            uploadProgress: () => 100,
            error: () => null,
          }),
        },
	onError: [
          {
            guard: ({ context }) => context.retryCount < 3,
            target: 'retrying',
            actions: assign({
	error: ({ event }) => extractErrorMessageFromInvoke(event) ?? 'Upload failed',
            }),
          },
	{
            target: 'failed',
            actions: assign({
	error: ({ event }) =>
                extractErrorMessageFromInvoke(event) ?? 'Upload failed after retries',
            }),
          },
	],
      },
	},
	processing: {
	entry: assign({ processingProgress: () => 0 }),
      invoke: {
	id: 'processFiles',
        src: fromPromise<{
	processedFiles: AIProcessingResult[]; summary: ProcessingSummary }>(
          async (params) => {
            const { input } = params as { input: DocumentUploadContext };
            const processingResults: AIProcessingResult[] = [];

            for (const file of input.uploadedFiles) {
              const response = await fetch('/api/ai/process-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	fileId: file.id, analysisType: 'full' }),
              });

              if (!response.ok) {
                throw new Error(`Processing failed for ${file.name}`);
              }
              const result = (await response.json()) as AIProcessingResult;
              processingResults.push(result);
            }

            return {
              processedFiles: processingResults,
              summary: {
	totalFiles: input.uploadedFiles.length,
                successfulProcessing: processingResults.length,
                extractedTextLength: processingResults.reduce(
                  (acc, r) => acc + (r.extractedText?.length ?? 0),
                  0
                ),
              },
	};
          }
        ),
        input: ({ context }) => context,
        onDone: {
	target: 'completed',
          actions: assign({
	aiResults: ({ event }) => extractAIResultsFromInvoke(event),
            processingProgress: () => 100,
            error: () => null,
          }),
        },
	onError: {
	target: 'failed',
          actions: assign({
	error: ({ event }) => extractErrorMessageFromInvoke(event) ?? 'Processing failed',
          }),
        },
	},
	},
	retrying: {
	after: {
        2000: 'uploading',
      },
	on: {
	RETRY: 'uploading',
      },
	},
	completed: {
	type: 'final',
      on: {
	RESET: {
          target: 'idle',
          actions: assign({
	files: () => [],
            uploadProgress: () => 0,
            processingProgress: () => 0,
            validationErrors: () => ({}),
            uploadedFiles: () => [],
            aiResults: () => null,
            error: () => null,
            retryCount: () => 0,
          }),
        },
	},
	},
	failed: {
	on: {
        RETRY: 'uploading',
        RESET: {
	target: 'idle',
          actions: assign({
	error: () => null,
            retryCount: () => 0,
          }),
        },
	},
	},
	},
	});

export default documentUploadMachine;



