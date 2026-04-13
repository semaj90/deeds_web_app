/**
 * Audio Upload State Machine - XState v5
 * Manages audio file upload workflow with SSE progress streaming
 *
 * States:
 * - idle: Waiting for file selection
 * - uploading: Uploading file to server
 * - streaming: Listening to SSE progress events
 * - complete: Upload and processing complete
 * - error: Upload or processing failed
 */
import { setup, assign, fromPromise } from 'xstate';

export interface AudioUploadContext {
  file: File | null;
  caseId: string | null;
  evidenceId: string | null;
  uploadProgress: number;
  processingStage: 'upload' | 'transcription' | 'analysis' | 'indexing' | 'complete' | 'error';
  stageMessage: string;
  overallProgress: number;
  result: {
    transcription?: string;
    language?: string;
    entities?: number;
    tags?: string[];
  } | null;
  error: string | null;
}

export type AudioUploadEvent =
  | { type: 'SELECT_FILE'; file: File; caseId?: string }
  | { type: 'UPLOAD' }
  | { type: 'PROGRESS'; stage: string; progress: number; message: string; details?: any }
  | { type: 'COMPLETE'; result: any }
  | { type: 'ERROR'; error: string }
  | { type: 'RETRY' }
  | { type: 'RESET' };

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function isSelectFileEvent(evt: unknown): evt is Extract<AudioUploadEvent, { type: 'SELECT_FILE' }> {
  const e = asRecord(evt);
  return e.type === 'SELECT_FILE' && e.file instanceof File;
}

function extractEvidenceIdFromInvoke(evt: unknown): string | null {
  const e = asRecord(evt);
  const maybe = (e.data ?? e.output) as unknown;
  if (typeof maybe === 'object' && maybe !== null) {
    const m = asRecord(maybe);
    if ('evidenceId' in m && typeof m.evidenceId === 'string') {
      return m.evidenceId;
    }
  }
  return null;
}

function extractErrorMessageFromInvoke(evt: unknown): string | null {
  const e = asRecord(evt);
  const maybe = (e.data ?? e.error ?? e) as unknown;
  if (typeof maybe === 'object' && maybe !== null) {
    const m = asRecord(maybe);
    if ('message' in m && typeof m.message === 'string') return m.message;
  }
  if (typeof evt === 'string') return evt;
  return null;
}

const uploadAudio = fromPromise(async ({ input }: { input: AudioUploadContext }) => {
  if (!input.file) {
    throw new Error('No file selected');
  }

  const formData = new FormData();
  formData.append('audio', input.file);
  if (input.caseId) {
    formData.append('caseId', input.caseId);
  }

  const response = await fetch('/api/audio/upload', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any).error || `HTTP ${response.status}`);
  }

  const result = await response.json() as { evidenceId: string };
  return result;
}) as any;

const streamProgress = fromPromise(async ({ input }: { input: AudioUploadContext }) => {
  if (!input.evidenceId) {
    throw new Error('No evidence ID');
  }

  // This actor sets up the EventSource but the actual progress events
  // are dispatched via custom events to be picked up by the component
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`/api/audio/progress/${input.evidenceId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Dispatch custom event for component to pick up
        window.dispatchEvent(new CustomEvent('audio:progress', { detail: data }));

        if (data.stage === 'complete') {
          eventSource.close();
          resolve(data);
        } else if (data.stage === 'error') {
          eventSource.close();
          reject(new Error(data.message));
        }
      } catch (err) {
        console.error('Failed to parse progress event:', err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      reject(new Error('Connection to server lost'));
    };
  });
}) as any;

export const audioUploadMachine = setup({
  types: {
    context: {} as AudioUploadContext,
    events: {} as AudioUploadEvent
  },
  actors: {
    uploadAudio,
    streamProgress
  }
}).createMachine({
  id: 'audioUpload',
  initial: 'idle',
  context: {
    file: null,
    caseId: null,
    evidenceId: null,
    uploadProgress: 0,
    processingStage: 'upload',
    stageMessage: '',
    overallProgress: 0,
    result: null,
    error: null
  },
  states: {
    idle: {
      on: {
        SELECT_FILE: {
          target: 'uploading',
          actions: assign({
            file: ({ event }) => isSelectFileEvent(event) ? event.file : null,
            caseId: ({ event }) => {
              const e = asRecord(event);
              return typeof e.caseId === 'string' ? e.caseId : null;
            },
            error: () => null
          })
        }
      }
    },
    uploading: {
      entry: assign({
        uploadProgress: 0,
        processingStage: () => 'upload' as const,
        stageMessage: () => 'Uploading audio file...'
      }),
      invoke: {
        id: 'uploadAudio',
        src: 'uploadAudio',
        input: ({ context }) => context,
        onDone: {
          target: 'streaming',
          actions: assign({
            evidenceId: ({ event }) => extractEvidenceIdFromInvoke(event),
            uploadProgress: 100,
            error: null
          })
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => extractErrorMessageFromInvoke(event) ?? 'Upload failed'
          })
        }
      }
    },
    streaming: {
      entry: assign({
        processingStage: () => 'transcription' as const,
        stageMessage: () => 'Transcribing audio...'
      }),
      invoke: {
        id: 'streamProgress',
        src: 'streamProgress',
        input: ({ context }) => context,
        onDone: {
          target: 'complete',
          actions: assign({
            result: ({ event }) => {
              const e = asRecord(event);
              const data = (e.data ?? e.output) as any;
              return data?.details || null;
            },
            overallProgress: 100,
            processingStage: () => 'complete' as const,
            stageMessage: () => 'Processing complete'
          })
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => extractErrorMessageFromInvoke(event) ?? 'Processing failed'
          })
        }
      },
      on: {
        PROGRESS: {
          actions: assign({
            processingStage: ({ event }) => {
              const e = asRecord(event);
              return typeof e.stage === 'string' ? e.stage as any : 'upload';
            },
            overallProgress: ({ event }) => {
              const e = asRecord(event);
              return typeof e.progress === 'number' ? e.progress : 0;
            },
            stageMessage: ({ event }) => {
              const e = asRecord(event);
              return typeof e.message === 'string' ? e.message : '';
            }
          })
        }
      }
    },
    complete: {
      type: 'final',
      on: {
        RESET: {
          target: 'idle',
          actions: assign({
            file: null,
            caseId: null,
            evidenceId: null,
            uploadProgress: 0,
            processingStage: () => 'upload' as const,
            stageMessage: '',
            overallProgress: 0,
            result: null,
            error: null
          })
        }
      }
    },
    error: {
      on: {
        RETRY: {
          target: 'uploading',
          actions: assign({
            error: null
          })
        },
        RESET: {
          target: 'idle',
          actions: assign({
            file: null,
            caseId: null,
            evidenceId: null,
            uploadProgress: 0,
            processingStage: () => 'upload' as const,
            stageMessage: '',
            overallProgress: 0,
            result: null,
            error: null
          })
        }
      }
    }
  }
});

export default audioUploadMachine;
