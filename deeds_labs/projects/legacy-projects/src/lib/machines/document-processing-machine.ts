// src/lib/machines/document-processing-machine.ts
import { createMachine, assign, interpret } from 'xstate';
import type { RabbitMQClient } from '$lib/server/queue/rabbitmq-client';
import { getRabbitMQClient } from '$lib/server/queue/rabbitmq-client';

// Placeholder for splitText function
function splitText(text: string, chunkSize: number = 512): string[] {
  console.warn('splitText is a placeholder function.');
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

export const documentProcessingMachine = createMachine({
  id: 'documentProcessing',
  initial: 'idle',

  context: {
    documentId: null as string | null,
    file: null as File | null,
    ocrResult: null as any | null, // Placeholder type
    parsedData: null as any | null, // Placeholder type
    embeddings: null as number[][] | null,
    indexingComplete: false,
    error: null as any | null,
    progress: 0
  },

  states: {
    idle: {
      on: {
        UPLOAD_DOCUMENT: {
          target: 'uploading',
          actions: assign(({ event }) => ({
            file: event.file,
            documentId: event.documentId
          }))
        }
      }
    },

    uploading: {
      entry: 'uploadToStorage', // This action is not defined in the provided snippet, will be a placeholder
      on: {
        UPLOAD_COMPLETE: 'queueing_ocr',
        UPLOAD_FAILED: 'error'
      }
    },

    queueing_ocr: {
      entry: 'queueOCRTask',
      on: {
        OCR_QUEUED: 'processing_ocr'
      }
    },

    processing_ocr: {
      entry: assign({ progress: 25 }), // Update progress here
      on: {
        OCR_COMPLETE: {
          target: 'extracting',
          actions: assign(({ event }) => ({
            ocrResult: event.result,
            progress: 25
          }))
        },
        OCR_FAILED: 'error'
      }
    },

    extracting: {
      entry: 'queueExtractTask',
      on: {
        EXTRACT_COMPLETE: {
          target: 'embedding',
          actions: assign(({ event }) => ({
            parsedData: event.data,
            progress: 50
          }))
        }
      }
    },

    embedding: {
      entry: 'queueEmbedTask',
      on: {
        EMBED_COMPLETE: {
          target: 'indexing',
          actions: assign(({ event }) => ({
            embeddings: event.embeddings,
            progress: 75
          }))
        }
      }
    },

    indexing: {
      entry: 'queueIndexTask',
      on: {
        INDEX_COMPLETE: {
          target: 'ready',
          actions: assign({
            indexingComplete: true,
            progress: 100
          })
        }
      }
    },

    ready: {
      entry: 'notifyComplete', // This action is not defined in the provided snippet, will be a placeholder
      on: {
        RESET: 'idle'
      }
    },

    error: {
      entry: assign(({ event }) => ({
        error: event.error
      })),
      on: {
        RETRY: 'uploading',
        RESET: 'idle'
      }
    }
  }
}, {
  actions: {
    uploadToStorage: () => {
      console.warn('uploadToStorage action is a placeholder.');
      // In a real implementation, this would handle file upload
      // For now, immediately send UPLOAD_COMPLETE
      // This needs to be handled by the interpreter, not directly here.
      // The machine will transition based on external events.
    },
    notifyComplete: () => {
      console.warn('notifyComplete action is a placeholder.');
    },
    queueOCRTask: async ({ context, sendBack }) => {
      const rabbitmq = getRabbitMQClient();
      await rabbitmq.publish('ocr_queue', {
        documentId: context.documentId,
        file: context.file // Note: In a real scenario, you might not pass the whole File object over RabbitMQ
      });
      sendBack({ type: 'OCR_QUEUED' });
    },

    queueExtractTask: async ({ context, sendBack }) => {
      const rabbitmq = getRabbitMQClient();
      await rabbitmq.publish('langextract_queue', {
        documentId: context.documentId,
        text: context.ocrResult.text
      });
      // Assuming an external worker will send EXTRACT_COMPLETE
    },

    queueEmbedTask: async ({ context, sendBack }) => {
      const rabbitmq = getRabbitMQClient();
      // Assuming parsedData has a 'chunks' property as per the markdown example
      await rabbitmq.publish('embedding_queue', {
        documentId: context.documentId,
        chunks: splitText(context.ocrResult.text) // Using ocrResult.text for chunking as parsedData might not have it directly
      });
      // Assuming an external worker will send EMBED_COMPLETE
    },

    queueIndexTask: async ({ context, sendBack }) => {
      const rabbitmq = getRabbitMQClient();
      await rabbitmq.publish('indexing_queue', {
        documentId: context.documentId,
        embeddings: context.embeddings,
        metadata: context.parsedData.metadata
      });
      // Assuming an external worker will send INDEX_COMPLETE
    }
  }
});