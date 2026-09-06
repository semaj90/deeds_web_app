#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

if (process.env.NODE_ENV === 'production') {
  console.error(JSON.stringify({ status: 'BLOCKED_PRODUCTION_ENVIRONMENT' }, null, 2));
  process.exit(2);
}

const { publishMessage } = await import('../../src/lib/server/queue/rabbitmq-client.js');
const { measureJsonMessageBytes } = await import(
  '../../src/lib/server/queue/message-size-policy-v1.js'
);
const { flushLangfuse } = await import('../../src/lib/server/observability/langfuse.js');
const amqp = await import('amqplib');

const reportPath = path.resolve(
  process.cwd(),
  '..',
  'docs',
  'reports',
  'queue-large-payload-disposable-canary-v1.json',
);
const exchange = `atlas.queue05.canary.${process.pid}.${Date.now()}`;
const connect = (amqp as { default?: { connect(url: string): Promise<any> }; connect?(url: string): Promise<any> }).default?.connect
  ?? (amqp as { connect?(url: string): Promise<any> }).connect;
if (!connect) throw new Error('AMQP connect function unavailable');

const connection = await connect(process.env.RABBITMQ_URL ?? 'amqp://127.0.0.1:5672');
const channel = await connection.createChannel();
let exchangeDeclared = false;
let exchangeDeleted = false;
let channelClosed = false;
let connectionClosed = false;

try {
  await channel.assertExchange(exchange, 'topic', { durable: false, autoDelete: true });
  exchangeDeclared = true;

  // publishMessage dynamically resolves the normal manager singleton. Supplying
  // only this isolated channel avoids manager initialization and all consumers.
  const { rabbitmq } = await import('../../src/lib/server/queue/rabbitmq-manager-fixed.js');
  (rabbitmq as unknown as { channel: unknown }).channel = channel;

  const documentPayload = {
    documentId: `queue05-canary-document-${process.pid}`,
    text: 'x'.repeat(64 * 1024),
    collection: 'legal_documents',
    metadata: { canary: 'QUEUE-05-LIVE-PUBLISHER-PROFILE-01' },
  };
  const vectorPayload = {
    id: `queue05-canary-vector-${process.pid}`,
    vector: Array.from({ length: 768 }, (_, index) => ((index % 31) - 15) / 31),
    collection: 'legal_documents',
    payload: { canary: 'QUEUE-05-LIVE-PUBLISHER-PROFILE-01' },
  };

  const documentResult = await publishMessage(exchange, 'document.embed', documentPayload);
  const vectorResult = await publishMessage(exchange, 'vector.index.document', vectorPayload);
  if (!documentResult.ok || !vectorResult.ok) {
    throw new Error(`Disposable publisher canary failed: ${JSON.stringify({ documentResult, vectorResult })}`);
  }

  await flushLangfuse();
  await channel.deleteExchange(exchange);
  exchangeDeleted = true;
  await channel.close();
  channelClosed = true;
  await connection.close();
  connectionClosed = true;

  const report = {
    schema: 'atlas.queue-large-payload-disposable-canary.v1',
    status: 'QUEUE05_DISPOSABLE_PUBLISHER_CANARY_PROVEN',
    canaryExchange: exchange,
    queueBound: false,
    consumerStarted: false,
    deletedExchange: exchangeDeleted,
    samples: [
      {
        routingKey: 'document.embed',
        payloadKind: 'LEGACY_DOCUMENT_EMBED',
        payloadBytes: measureJsonMessageBytes(documentPayload),
        published: true,
      },
      {
        routingKey: 'vector.index.document',
        payloadKind: 'LEGACY_VECTOR_INDEX',
        dimension: vectorPayload.vector.length,
        payloadBytes: measureJsonMessageBytes(vectorPayload),
        published: true,
      },
    ],
    langfuseFlushRequested: true,
    canonicalWritesPerformed: false,
    postgresWritesPerformed: false,
    qdrantWritesPerformed: false,
    valkeyWritesPerformed: false,
    note: 'This proves real channel serialization and trace emission through an unbound disposable exchange. It is not production traffic and does not authorize legacy publisher migration.',
    nextGate: 'QUEUE-05-LIVE-PUBLISHER-PROFILE-01',
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    exchangeDeleted: report.deletedExchange,
    samples: report.samples,
    reportPath,
  }, null, 2));
} finally {
  if (exchangeDeclared && !exchangeDeleted) {
    await channel.deleteExchange(exchange).catch(() => undefined);
  }
  if (!channelClosed) await channel.close().catch(() => undefined);
  if (!connectionClosed) await connection.close().catch(() => undefined);
}
