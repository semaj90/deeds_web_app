#!/usr/bin/env node
import amqplib from 'amqplib';

const [,, cmd, target] = process.argv;
if (!cmd || !target) {
  console.error('Usage: node scripts/publish-control.mjs <start|stop|restart> <service|all>');
  process.exit(1);
}

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';

async function main() {
  const conn = await amqplib.connect(RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange('orchestrator.control', 'topic', { durable: false });
  const payload = { cmd, target };
  ch.publish('orchestrator.control', 'cmd', Buffer.from(JSON.stringify(payload)));
  console.log('Sent control:', payload);
  await ch.close();
  await conn.close();
}

main().catch(e => { console.error('Control publish failed:', e.message); process.exit(1); });
