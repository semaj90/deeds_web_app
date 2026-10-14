/**
 * atlas-work-event-inbox.ts — In-memory inbox prototype for idempotency tests.
 *
 * Implements KAFKA-10 / KAFKA-11:
 * - Process-local prototype semantics:
 *   - Duplicate detection on (eventId, payloadChecksum)
 *   - Replay idempotency: identical eventId + identical payloadChecksum -> skip execution, return REPLAY
 *   - Collision rejection: identical eventId + different payloadChecksum -> reject with CONFLICT, record in dead-letter
 * - Reconciles accepted events into existing invalidation functions without duplicating
 *   task eligibility, OpenSpec controller ranking, or workboard models.
 */

import { AtlasWorkEventV1Schema, type AtlasWorkEventV1 } from './atlas-work-event.js';

export type InboxProcessStatus = 'PROCESSED' | 'REPLAY' | 'CONFLICT' | 'DEAD_LETTER';

export interface InboxRecord {
  eventId: string;
  eventType: string;
  payloadChecksum: string;
  status: InboxProcessStatus;
  canonicalSourceId: string;
  sourceRevision?: string;
  attempts: number;
  processedAt: number;
  errorMessage?: string;
}

export interface InboxProcessResult {
  status: InboxProcessStatus;
  eventId: string;
  reconciliationTriggered?: boolean;
  error?: string;
}

export type EventReconciliationHandler = (event: AtlasWorkEventV1) => Promise<void> | void;

export class AtlasWorkEventInbox {
  // In-memory or database-backed inbox records keyed by eventId
  private records = new Map<string, InboxRecord>();
  private reconciliationHandler?: EventReconciliationHandler;

  constructor(reconciliationHandler?: EventReconciliationHandler) {
    this.reconciliationHandler = reconciliationHandler;
  }

  public getRecord(eventId: string): InboxRecord | undefined {
    return this.records.get(eventId);
  }

  /**
 * Process an incoming work event through the in-memory validation gate.
   */
  public async processEvent(event: AtlasWorkEventV1): Promise<InboxProcessResult> {
    const validated = AtlasWorkEventV1Schema.safeParse(event);
    if (!validated.success) {
      return {
        status: 'CONFLICT',
        eventId: typeof event?.eventId === 'string' ? event.eventId : 'INVALID_EVENT',
        error: 'INVALID_EVENT_ENVELOPE_OR_PAYLOAD_CHECKSUM',
      };
    }
    event = validated.data;
    const existing = this.records.get(event.eventId);

    if (existing) {
      if (existing.payloadChecksum === event.payloadChecksum) {
        // Safe duplicate replay
        existing.attempts++;
        return {
          status: 'REPLAY',
          eventId: event.eventId,
          reconciliationTriggered: false,
        };
      } else {
        // Conflict: identical event ID but mutated payload
        existing.status = 'CONFLICT';
        existing.errorMessage = `PAYLOAD_CHECKSUM_CONFLICT: expected ${existing.payloadChecksum}, got ${event.payloadChecksum}`;
        existing.attempts++;
        return {
          status: 'CONFLICT',
          eventId: event.eventId,
          error: existing.errorMessage,
        };
      }
    }

    // New event: register in inbox
    const newRecord: InboxRecord = {
      eventId: event.eventId,
      eventType: event.eventType,
      payloadChecksum: event.payloadChecksum,
      status: 'PROCESSED',
      canonicalSourceId: event.canonicalSourceId,
      sourceRevision: event.sourceRevision,
      attempts: 1,
      processedAt: Date.now(),
    };

    try {
      if (this.reconciliationHandler) {
        await this.reconciliationHandler(event);
      }
      this.records.set(event.eventId, newRecord);
      return {
        status: 'PROCESSED',
        eventId: event.eventId,
        reconciliationTriggered: true,
      };
    } catch (err: any) {
      newRecord.status = 'DEAD_LETTER';
      newRecord.errorMessage = err?.message ?? String(err);
      this.records.set(event.eventId, newRecord);
      return {
        status: 'DEAD_LETTER',
        eventId: event.eventId,
        error: newRecord.errorMessage,
      };
    }
  }
}
