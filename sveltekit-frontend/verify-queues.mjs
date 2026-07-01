import amqp from 'amqplib';

const connection = await amqp.connect({
  hostname: 'localhost',
  port: 5672,
  username: 'legal_admin',
  password: 'secret123',
});

const channel = await connection.createChannel();

const QUEUES = [
  'agentic_tasks',
  'enrichment_pipeline',
  'vector_indexing',
  'cache_invalidation',
  'evidence_processing',
  'report_generation',
  'notification_queue',
];

console.log('✅ Verifying queues exist:');
for (const queueName of QUEUES) {
  try {
    const info = await channel.checkQueue(queueName);
    console.log(`  ✅ ${queueName}: ${info.messageCount} msgs, ${info.consumerCount} consumers`);
  } catch (err) {
    console.log(`  ❌ ${queueName}: ${err.message}`);
  }
}

await channel.close();
await connection.close();
process.exit(0);
