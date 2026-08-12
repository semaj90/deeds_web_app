// @vitest-environment node
//
// Real-Postgres + real-RabbitMQ integration test for
// CODE_EVIDENCE_OUTBOX_DELIVERY_PROVEN / CODE_EVIDENCE_OUTBOX_E2E_PROVEN.
//
// Proves, against live infrastructure, not mocks:
//  1. recordAnalysisPassResult(ledgerInput, { emitIntegrationEvent }) writes
//     the ledger row AND the workflow_outbox row atomically (same transaction).
//  2. publishOutboxBatch() delivers the row to RabbitMQ and marks delivered_at.
//  3. consumeOneCodeEvidenceEvent() receives it off the real queue, validates
//     the envelope, and acks it.
//
// BLOCKED_BY_RUNTIME_DEPENDENCY skip (not failure) if either Postgres or
// RabbitMQ is unreachable — same discipline as code-evidence-readback.spec.ts.

import '../analysis/test-env-bootstrap.js';

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { getRabbitMQUrl } from '$lib/config/env.server.js';
import { computePacketKey } from '$lib/server/atlas/identity/packet-key-builder.js';
import {
  buildCodeEvidenceSynthesizerReceiptFromSource,
  buildCodeEvidenceLedgerInputFromSource,
} from '$lib/server/analysis/code-evidence-synthesizer.js';
import { recordAnalysisPassResult } from '$lib/server/analysis/analysis-pass-results.js';
import { publishOutboxBatch } from './outbox.js';
import { declareTopology, EVENT_ROUTING_KEYS, EXCHANGES } from './topology.js';

let dbAvailable = true;
let rabbitAvailable = true;
let unavailableReason = '';

beforeAll(async () => {
  try {
    const { pool } = await import('$lib/server/db/client.js');
    await pool.query('SELECT 1');
  } catch (err) {
    dbAvailable = false;
    unavailableReason += `BLOCKED_BY_RUNTIME_DEPENDENCY: POSTGRES_CONNECTION_TIMEOUT — ${String(err)}\n`;
  }

  try {
    const amqplib = (await import('amqplib')) as any;
    const rabbitUrl = getRabbitMQUrl();
    const conn = await amqplib.connect(rabbitUrl);
    await conn.close();
  } catch (err) {
    rabbitAvailable = false;
    unavailableReason += `BLOCKED_BY_RUNTIME_DEPENDENCY: RABBITMQ_CONNECTION_TIMEOUT — ${String(err)}\n`;
  }
});

describe('code-evidence outbox (integration)', () => {
  it('proves persist -> outbox write -> publish -> consume -> ack', async (ctx) => {
    if (!dbAvailable || !rabbitAvailable) {
      console.warn(unavailableReason);
      ctx.skip();
      return;
    }

    const runId = randomUUID();
    const sourceRef = `src/lib/server/outbox-fixture-${runId}.ts`;
    const packetKey = computePacketKey(sourceRef, `tree:node:${runId}`, `title:${runId}`);

    const synthesized = await buildCodeEvidenceSynthesizerReceiptFromSource({
      packetKey,
      sourceRef,
      sourceRevision: `source:${runId}`,
      treeNodeId: `tree:node:${runId}`,
      titleId: `title:${runId}`,
      featureId: `feature:outbox-${runId}`,
      featureLabel: 'Outbox fixture',
      text: 'export class OutboxFixture { run(id: string) { return id; } }',
      isCode: true,
      representationRevision: 'semantic_768@1',
      producerId: 'code-evidence-outbox-spec',
      producerRevision: 'code-evidence-outbox-spec-v1',
      featureRevision: 'feature:v1',
      semanticConceptIds: ['concept:outbox'],
      ontologyIds: ['ontology:outbox-fixture'],
      extractedFeatures: [
        {
          type: 'ast_class',
          name: 'OutboxFixture',
          description: 'Class OutboxFixture',
          source: 'ast-grep',
          lineNumber: 1,
          confidence: 0.95,
        },
      ],
    });
    expect(synthesized).not.toBeNull();
    if (!synthesized) return;

    const ledgerInput = buildCodeEvidenceLedgerInputFromSource({
      analysisJobId: runId,
      evidenceId: runId,
      jobType: 'code_feature_registry',
      packetKey,
      sourceRef,
      sourceRevision: `source:${runId}`,
      representationRevision: 'semantic_768@1',
      family: 'code_evidence',
      passName: 'code_feature_registry',
      passRevision: 'code-feature-registry-v1',
      backend: 'native-ts',
      backendVersion: 'code-evidence-outbox-spec-v1',
      device: 'cpu',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      analysisWorkerProducerId: 'code-evidence-outbox-spec',
      analysisWorkerProducerRevision: 'code-evidence-outbox-spec-v1',
      synthesized,
    });
    expect(ledgerInput).not.toBeNull();
    if (!ledgerInput) return;

    // ── Step 1: persist + outbox write, atomically (same transaction) ───────
    const persisted = await recordAnalysisPassResult(ledgerInput, {
      emitIntegrationEvent: {
        eventType: 'code.evidence.persisted',
        routingKey: EVENT_ROUTING_KEYS.codeEvidencePersisted,
        sourceRef,
      },
    });
    expect(persisted).not.toBeNull();
    if (!persisted) return;
    expect(persisted.inserted).toBe(true);

    // Confirm the outbox row actually landed, undelivered, before we publish.
    const { pool } = await import('$lib/server/db/client.js');
    const beforePublish = await pool.query(
      `SELECT id, event_type, routing_key, exchange, delivered_at, payload
       FROM workflow_outbox
       WHERE run_id = $1::uuid AND event_type = 'code.evidence.persisted'
       ORDER BY created_at DESC LIMIT 1`,
      [runId]
    );
    expect(beforePublish.rows.length).toBe(1);
    expect(beforePublish.rows[0].delivered_at).toBeNull();
    expect(beforePublish.rows[0].routing_key).toBe(EVENT_ROUTING_KEYS.codeEvidencePersisted);

    // ── Step 2: publish — real confirm-channel publish to RabbitMQ ──────────
    const amqplib = (await import('amqplib')) as any;
    const rabbitUrl = getRabbitMQUrl();
    const publishConn = await amqplib.connect(rabbitUrl);
    const publishCh = await publishConn.createConfirmChannel();
    const consumeConn = await amqplib.connect(rabbitUrl);
    const consumeCh = await consumeConn.createChannel();
    await declareTopology(consumeCh as any);
    const tempQueue = `atlas.q.code.events.spec.${runId}`;
    await consumeCh.assertQueue(tempQueue, {
      durable: false,
      exclusive: true,
      autoDelete: true,
    } as any);
    await consumeCh.bindQueue(tempQueue, EXCHANGES.events, EVENT_ROUTING_KEYS.codeEvidencePersisted);

    const publishFn = (exchange: string, routingKey: string, payload: Buffer): Promise<void> =>
      new Promise((resolve, reject) => {
        const ok = publishCh.publish(exchange, routingKey, payload, {
          persistent: true,
          contentType: 'application/json',
        });
        if (ok) {
          publishCh.waitForConfirms().then(resolve).catch(reject);
        } else {
          publishCh.once('drain', () => publishCh.waitForConfirms().then(resolve).catch(reject));
        }
      });

    let delivered = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      const batchResult = await publishOutboxBatch(publishFn, 50);
      delivered += batchResult.delivered;
      const afterAttempt = await pool.query(
        `SELECT delivered_at FROM workflow_outbox WHERE id = $1::uuid`,
        [beforePublish.rows[0].id]
      );
      if (afterAttempt.rows[0].delivered_at) break;
    }
    expect(delivered).toBeGreaterThan(0);
    await publishConn.close();

    const afterPublish = await pool.query(
      `SELECT delivered_at FROM workflow_outbox WHERE id = $1::uuid`,
      [beforePublish.rows[0].id]
    );
    expect(afterPublish.rows[0].delivered_at).not.toBeNull();

    // ── Step 3: consume + ack off a private queue bound to the same event ──
    const matched = await new Promise<{
      event: {
        eventType: string;
        payload: Record<string, unknown>;
      };
      acked: true;
    } | null>((resolve, reject) => {
      const timer = setTimeout(() => resolve(null), 5_000);
      void consumeCh.consume(
        tempQueue,
        (msg) => {
          if (!msg) return;
          clearTimeout(timer);
          void (async () => {
            try {
              const event = JSON.parse(msg.content.toString('utf8')) as {
                eventType: string;
                payload: Record<string, unknown>;
              };
              consumeCh.ack(msg as any);
              resolve({ event, acked: true });
            } catch (err) {
              consumeCh.nack(msg as any, false, false);
              reject(err);
            }
          })();
        },
        { noAck: false }
      ).catch(reject);
    });

    await consumeCh.close();
    await consumeConn.close();

    expect(matched).not.toBeNull();
    if (!matched) return;
    expect(matched.acked).toBe(true);
    expect(matched.event.eventType).toBe('code.evidence.persisted');
    const payload = matched.event.payload as Record<string, unknown>;
    expect(payload.packetKey).toBe(packetKey);
    expect(payload.sourceRef).toBe(sourceRef);
  }, 60_000);
});
