import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import type { SemanticRpcMessage, SemanticRpcResponse } from './semantic-rpc.js';
import { SemanticRpcEnvelope } from './semantic-rpc.js';

export interface OutboxEntry {
  messageId: string;
  runId: string;
  method: string;
  destination: string;
  payload: Record<string, unknown>;
  contractVersion: string;
  idempotencyKey: string;
  status: 'pending' | 'delivered' | 'failed' | 'expired';
  attemptCount: number;
  createdAt: string;
  deliveredAt: string | null;
}

export interface InboxEntry {
  messageId: string;
  source: string;
  method: string;
  payload: Record<string, unknown>;
  contractVersion: string;
  idempotencyKey: string;
  receivedAt: string;
  processedAt: string | null;
  processingStatus: 'pending' | 'processed' | 'failed';
}

export class SemanticRpcOutbox {
  async enqueue(message: SemanticRpcMessage): Promise<void> {
    await db.execute(
      sql`
        INSERT INTO semantic_rpc_outbox (
          message_id, run_id, method, destination, payload,
          contract_version, idempotency_key, status, attempt_count,
          created_at, delivered_at
        ) VALUES (
          ${message.messageId}, ${message.runId}, ${message.method},
          ${message.destination}, ${JSON.stringify(message.payload)},
          ${message.contractVersion}, ${message.idempotencyKey},
          'pending', 0, ${message.createdAt}, NULL
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `
    );
  }

  async getPending(limit: number = 100): Promise<OutboxEntry[]> {
    const results = await db.execute(
      sql`
        SELECT
          message_id, run_id, method, destination, payload,
          contract_version, idempotency_key, status, attempt_count,
          created_at, delivered_at
        FROM semantic_rpc_outbox
        WHERE status = 'pending'
          AND attempt_count < 5
          AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at ASC
        LIMIT ${limit}
      `
    );

    return results.rows.map((row: any) => ({
      messageId: row.message_id,
      runId: row.run_id,
      method: row.method,
      destination: row.destination,
      payload: row.payload,
      contractVersion: row.contract_version,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      deliveredAt: row.delivered_at
    }));
  }

  async markDelivered(messageId: string, response: SemanticRpcResponse): Promise<void> {
    await db.execute(
      sql`
        UPDATE semantic_rpc_outbox
        SET status = CASE
              WHEN ${response.status === 'success'} THEN 'delivered'
              WHEN ${response.status === 'timeout'} THEN 'expired'
              ELSE 'failed'
            END,
            delivered_at = NOW(),
            attempt_count = attempt_count + 1
        WHERE message_id = ${messageId}
      `
    );
  }

  async markFailed(messageId: string, error: string): Promise<void> {
    await db.execute(
      sql`
        UPDATE semantic_rpc_outbox
        SET status = 'failed',
            attempt_count = attempt_count + 1
        WHERE message_id = ${messageId}
      `
    );
  }
}

export class SemanticRpcInbox {
  async record(message: SemanticRpcMessage, source: string): Promise<void> {
    await db.execute(
      sql`
        INSERT INTO semantic_rpc_inbox (
          message_id, source, method, payload, contract_version,
          idempotency_key, received_at, processed_at, processing_status
        ) VALUES (
          ${message.messageId}, ${source}, ${message.method},
          ${JSON.stringify(message.payload)}, ${message.contractVersion},
          ${message.idempotencyKey}, NOW(), NULL, 'pending'
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `
    );
  }

  async getPending(limit: number = 100): Promise<InboxEntry[]> {
    const results = await db.execute(
      sql`
        SELECT
          message_id, source, method, payload, contract_version,
          idempotency_key, received_at, processed_at, processing_status
        FROM semantic_rpc_inbox
        WHERE processing_status = 'pending'
        ORDER BY received_at ASC
        LIMIT ${limit}
      `
    );

    return results.rows.map((row: any) => ({
      messageId: row.message_id,
      source: row.source,
      method: row.method,
      payload: row.payload,
      contractVersion: row.contract_version,
      idempotencyKey: row.idempotency_key,
      receivedAt: row.received_at,
      processedAt: row.processed_at,
      processingStatus: row.processing_status
    }));
  }

  async markProcessed(messageId: string): Promise<void> {
    await db.execute(
      sql`
        UPDATE semantic_rpc_inbox
        SET processing_status = 'processed',
            processed_at = NOW()
        WHERE message_id = ${messageId}
      `
    );
  }

  async markFailed(messageId: string): Promise<void> {
    await db.execute(
      sql`
        UPDATE semantic_rpc_inbox
        SET processing_status = 'failed',
            processed_at = NOW()
        WHERE message_id = ${messageId}
      `
    );
  }
}

export class SemanticRpcDispatcher {
  private outbox: SemanticRpcOutbox;
  private inbox: SemanticRpcInbox;

  constructor() {
    this.outbox = new SemanticRpcOutbox();
    this.inbox = new SemanticRpcInbox();
  }

  async sendMessage(message: SemanticRpcMessage): Promise<void> {
    // Validate message format
    if (!SemanticRpcEnvelope.validate(message)) {
      throw new Error('Invalid semantic RPC message format');
    }

    // Enqueue for delivery
    await this.outbox.enqueue(message);
  }

  async receiveMessage(message: SemanticRpcMessage, source: string): Promise<void> {
    // Check if already processed (idempotency)
    if (!SemanticRpcEnvelope.validate(message)) {
      throw new Error('Invalid semantic RPC message format');
    }

    // Check expiration
    if (SemanticRpcEnvelope.isExpired(message)) {
      throw new Error('Message expired');
    }

    // Record in inbox
    await this.inbox.record(message, source);
  }

  async getPendingOutbox(limit?: number): Promise<OutboxEntry[]> {
    return this.outbox.getPending(limit);
  }

  async getPendingInbox(limit?: number): Promise<InboxEntry[]> {
    return this.inbox.getPending(limit);
  }
}
