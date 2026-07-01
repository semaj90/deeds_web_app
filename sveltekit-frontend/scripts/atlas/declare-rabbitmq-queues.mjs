#!/usr/bin/env node
import amqp from 'amqplib';
import { execSync } from 'child_process';

// Live container resolver: use docker inspect if .env is stale
async function resolveRabbitMQCredentials() {
  const fromEnv = {
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT || '5672'),
    user: process.env.RABBITMQ_USER || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
  };

  try {
    // Cold-start: attempt live container credential resolution
    const inspectCmd = 'docker inspect legal-ai-rabbitmq --format="{{json .Config.Env}}"';
    const envOutput = execSync(inspectCmd, { encoding: 'utf-8' });
    const envArray = JSON.parse(envOutput);

    const envMap = {};
    for (const envVar of envArray) {
      const [key, value] = envVar.split('=');
      envMap[key] = value;
    }

    // Override from live container if available
    const resolved = {
      host: envMap.RABBITMQ_HOST || fromEnv.host,
      port: envMap.RABBITMQ_PORT ? parseInt(envMap.RABBITMQ_PORT) : fromEnv.port,
      user: envMap.RABBITMQ_USER || fromEnv.user,
      password: envMap.RABBITMQ_PASSWORD || fromEnv.password,
    };

    console.log(`✅ RabbitMQ credentials resolved from live container`);
    return resolved;
  } catch (err) {
    console.log(`⚠️  Live container resolution failed, using .env: ${err.message.split('\n')[0]}`);
    return fromEnv;
  }
}

const creds = await resolveRabbitMQCredentials();
const connection = await amqp.connect({
  hostname: creds.host,
  port: creds.port,
  username: creds.user,
  password: creds.password,
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

const DLX = 'dlx.dead-letter';

await channel.assertExchange(DLX, 'topic', { durable: true });

for (const queueName of QUEUES) {
  const info = await channel.assertQueue(queueName, {
    durable: true,
    arguments: {
      'x-message-ttl': 300000,
      'x-dead-letter-exchange': DLX,
      'x-dead-letter-routing-key': queueName,
    },
  });

  console.log(`✅ ${queueName} (${info.messageCount} msgs, ${info.consumerCount} consumers)`);
}

await channel.close();
await connection.close();

console.log(`\n✅ Queue declaration complete`);
process.exit(0);