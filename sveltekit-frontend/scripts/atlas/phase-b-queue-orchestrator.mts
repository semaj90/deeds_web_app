#!/usr/bin/env node
/**
 * Phase B Queue Orchestrator
 *
 * Chains the 3-stage enrichment pipeline via RabbitMQ queues:
 * 1. Gemma4 summarization → produces summaries
 * 2. EmbeddingGemma embeddings → consumes summaries, produces embeddings
 * 3. Cache push → consumes embeddings, pushes to Redis/Qdrant
 *
 * Monitors progress and logs statistics.
 *
 * Usage:
 *   npx tsx scripts/atlas/phase-b-queue-orchestrator.mts [--interval=30]
 */

import amqp from 'amqplib';

const INTERVAL = parseInt(
  process.argv.find(arg => arg.startsWith('--interval='))?.split('=')[1] || '30'
) * 1000; // Convert to milliseconds

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';

const QUEUES = [
  'atlas.enrichment.gemma4',
  'atlas.enrichment.embedding',
  'atlas.enrichment.cache_push',
];

interface QueueStats {
  name: string;
  messages: number;
  consumers: number;
  timestamp: string;
}

async function getQueueStats(): Promise<QueueStats[]> {
  let connection;
  let channel;

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    const stats: QueueStats[] = [];

    for (const queue of QUEUES) {
      try {
        const q = await channel.checkQueue(queue);
        stats.push({
          name: queue,
          messages: q.messageCount,
          consumers: q.consumerCount,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        stats.push({
          name: queue,
          messages: 0,
          consumers: 0,
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (channel) await channel.close();
    if (connection) await connection.close();

    return stats;
  } catch (err) {
    console.error(`❌ Connection error: ${err}`);
    return [];
  }
}

function formatProgressBar(current: number, total: number, width: number = 30): string {
  const pct = total === 0 ? 0 : (current / total) * 100;
  const filled = Math.round((width * current) / total);
  const empty = width - filled;
  return `[${('█').repeat(filled)}${('░').repeat(empty)}] ${pct.toFixed(1)}%`;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase B Queue Orchestrator (RabbitMQ DAG Monitor)             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`RabbitMQ: ${RABBITMQ_URL}`);
  console.log(`Polling interval: ${INTERVAL / 1000}s\n`);
  console.log('Monitoring queue depths and consumer counts...\n');

  let lastStats: QueueStats[] = [];

  const printStats = (stats: QueueStats[]) => {
    console.clear();
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Phase B Queue Orchestrator (RabbitMQ DAG Monitor)             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log(`[${new Date().toISOString()}]\n`);

    const totalTarget = 57112;

    for (const stat of stats) {
      const stage = stat.name.replace('atlas.enrichment.', '');
      const progress = formatProgressBar(totalTarget - stat.messages, totalTarget, 40);

      console.log(`📦 ${stage.padEnd(15)} ${progress}  ${stat.messages.toString().padStart(6)} waiting  ${stat.consumers} consumer(s)`);
    }

    // Calculate overall progress
    const gemma4Stat = stats.find(s => s.name === 'atlas.enrichment.gemma4');
    const completedGemma4 = totalTarget - (gemma4Stat?.messages || 0);
    const overallProgress = formatProgressBar(completedGemma4, totalTarget, 40);

    console.log(`\n🚀 Overall Progress:  ${overallProgress}  ${completedGemma4}/${totalTarget} packets\n`);

    // Estimated time remaining (at ~3 packets/min for Gemma4)
    if (gemma4Stat && gemma4Stat.messages > 0) {
      const ppm = 3; // packets per minute
      const minsRemaining = gemma4Stat.messages / ppm;
      const hrsRemaining = Math.floor(minsRemaining / 60);
      const remMins = minsRemaining % 60;

      console.log(`⏱️  Estimated time remaining (Gemma4): ~${hrsRemaining}h ${Math.floor(remMins)}m\n`);
    }

    console.log('💡 Commands:');
    console.log('   Start Gemma4:    npm run phase-b:queue:consumer:gemma4');
    console.log('   Start Embedding: npm run phase-b:queue:consumer:embedding');
    console.log('   Start Cache:     npm run phase-b:queue:consumer:cache-push (future)');
    console.log('\nPress Ctrl+C to stop monitoring.');
  };

  // Initial stats
  let stats = await getQueueStats();
  printStats(stats);
  lastStats = stats;

  // Poll periodically
  const interval = setInterval(async () => {
    stats = await getQueueStats();
    if (JSON.stringify(stats) !== JSON.stringify(lastStats)) {
      printStats(stats);
      lastStats = stats;
    }
  }, INTERVAL);

  // Graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n\n🛑 Monitoring stopped.');
    process.exit(0);
  });
}

main();