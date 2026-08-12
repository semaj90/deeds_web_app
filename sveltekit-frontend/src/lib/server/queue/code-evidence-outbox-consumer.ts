import { getRabbitChannel } from './rabbitmq-connection.js';
import { declareTopology, QUEUES } from './topology.js';
import {
	type CodeEvidencePersistedEventV1,
} from './integration-events.js';
import {
	parseCodeEvidencePersistedEvent,
	verifyCodeEvidenceReadback,
} from './code-evidence-event-processing.js';
import { readCodeEvidenceLedgerEntry } from '$lib/server/analysis/code-evidence-readback.js';

export interface ConsumedCodeEvidenceEvent {
  event: CodeEvidencePersistedEventV1;
  readback: Awaited<ReturnType<typeof readCodeEvidenceLedgerEntry>>;
  acked: true;
}

/**
 * Consume exactly one message from the code-evidence events queue, validate
 * its envelope, verify canonical Postgres readback, and ack it. Resolves
 * null if nothing arrives within timeoutMs.
 */
export async function consumeOneCodeEvidenceEvent(
  timeoutMs = 5000
): Promise<ConsumedCodeEvidenceEvent | null> {
  const ch = await getRabbitChannel();
  // rabbitmq-connection.ts's AmqpChannel interface doesn't declare
  // assertExchange/bindQueue (only assertQueue) — the real amqplib channel
  // has them at runtime; cast to satisfy declareTopology's own interface,
  // matching the existing amqplib-interop cast convention in this codebase
  // (e.g. outbox-boot.ts's `amqplib as any`).
  await declareTopology(ch as any);
  ch.prefetch(1);

  return await new Promise((resolve, reject) => {
    let settled = false;
    let consumerTag: string | undefined;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);

    ch.consume(
      QUEUES.codeEvents,
      (msg: { content: Buffer } | null) => {
        if (settled || !msg) return;
        settled = true;
        clearTimeout(timer);

        void (async () => {
          try {
            const raw = JSON.parse(msg.content.toString('utf8')) as Record<string, unknown>;
            const event = parseCodeEvidencePersistedEvent(raw);
            const readback = await verifyCodeEvidenceReadback(event);
            ch.ack(msg as any);
            resolve({ event, readback, acked: true });
          } catch (err) {
            ch.nack(msg as any, false, false);
            reject(err);
          }
        })();
      },
      { noAck: false }
    ).then((ok: { consumerTag: string }) => {
      consumerTag = ok.consumerTag;
    });

    void consumerTag; // retained for future cancel() support, unused today
  });
}
