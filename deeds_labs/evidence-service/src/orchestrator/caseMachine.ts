import { createMachine, assign, fromPromise } from 'xstate';
import { db } from '../db/drizzle.js';
import { evidences } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { publishJob } from '../mq/producer.js';
import { QUEUES } from '../mq/connect.js';

export interface EvidenceContext {
  evidenceId: string;
  caseId?: string;
  ocrText?: string;
  error?: string;
}

export const evidenceProcessingMachine = createMachine({
  id: 'evidenceProcessing',
  initial: 'pending',
  context: ({ input }: { input: EvidenceContext }) => input,
  states: {
    pending: {
      on: {
        START_OCR: 'ocr',
      },
    },
    ocr: {
      invoke: {
        src: fromPromise(async ({ input }: { input: EvidenceContext }) => {
          await publishJob(QUEUES.OCR, { evidenceId: input.evidenceId });
          return input;
        }),
        onDone: {
          target: 'embedding',
          actions: assign(({ event }) => event.output),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => String(event.error),
          }),
        },
      },
    },
    embedding: {
      invoke: {
        src: fromPromise(async ({ input }: { input: EvidenceContext }) => {
          const [evidence] = await db.select().from(evidences).where(eq(evidences.id, input.evidenceId));
          const text = evidence?.ocrText || '';
          await publishJob(QUEUES.EMBED, { evidenceId: input.evidenceId, text });
          return { ...input, ocrText: text };
        }),
        onDone: {
          target: 'analysis',
          actions: assign(({ event }) => event.output),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => String(event.error),
          }),
        },
      },
    },
    analysis: {
      invoke: {
        src: fromPromise(async ({ input }: { input: EvidenceContext }) => {
          // Entity extraction and summarization happen in parallel
          await Promise.all([
            publishJob(QUEUES.ENTITY, { evidenceId: input.evidenceId, text: input.ocrText }),
            publishJob(QUEUES.SUMMARIZE, { evidenceId: input.evidenceId, text: input.ocrText }),
          ]);
          return input;
        }),
        onDone: 'completed',
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => String(event.error),
          }),
        },
      },
    },
    completed: {
      type: 'final',
    },
    failed: {
      type: 'final',
    },
  },
});
