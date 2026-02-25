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

// Service definitions for XState v5
// Note: fromPromise in v5 doesn't receive input - it's a simple promise factory
const validateFilesService = fromPromise(
  async () => {
  // TODO: Implement validation logic
  return [];
  }
);

const uploadFilesService = fromPromise(
  async () => {
  // Access context via event.input in the machine invoke
  return { success: true };
  }
);

const processFilesService = fromPromise(
  async () => {
  // TODO: Implement processing logic
  return { processedFiles: [], summary: { totalFiles: 0, successfulProcessing: 0, extractedTextLength: 0 } };
  }
);

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
        src: validateFilesService,
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
        src: uploadFilesService,
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
        src: processFilesService,
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



