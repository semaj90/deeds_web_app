#!/usr/bin/env node
/**
 * Phase 2E: RabbitMQ Job Publisher
 *
 * Publishes GPU topology jobs to RabbitMQ for:
 * - KMeans clustering
 * - SOM training
 * - PageRank computation
 *
 * This demonstrates the job publish pattern for the GPU worker consumers
 * which will run in WSL2 with the .venv-cu130 PyTorch environment.
 *
 * Usage:
 *   node scripts/atlas/p2e-rabbitmq-job-publish.mjs --dry --limit=100
 *   node scripts/atlas/p2e-rabbitmq-job-publish.mjs --limit=100
 */

import amqp from 'amqplib';

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '100'
);

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';

const QUEUES = {
  kmeans: 'topology.kmeans',
  som: 'topology.som',
  pagerank: 'topology.pagerank'
};

async function publishJobs() {
  try {
    console.log('\n📦 Phase 2E: RabbitMQ Job Publisher\n');
    console.log(`RabbitMQ: ${RABBITMQ_URL}`);
    console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);
    console.log(`Job count: ${limit} packets per job\n`);

    // Create synthetic packet keys for demonstration
    // In production, these come from Postgres query
    const packetKeys = Array.from({ length: limit }, (_, i) =>
      `packet:${String(i + 1).padStart(6, '0')}`
    );

    console.log(`✓ Generated ${packetKeys.length} sample packet keys\n`);

    // Build job payloads matching GPU worker expectations
    const jobPayloads = {
      kmeans: {
        run_id: `p2e-kmeans-${Date.now()}`,
        job_type: 'kmeans_clustering',
        packet_keys: packetKeys,
        metadata: {
          k: 10,
          max_iter: 50,
          tol: 1e-4,
          random_seed: 42,
          feature_schema_version: 'feature-envelope-v1',
          model_version: 'topology-p2e-v1'
        },
        requested_at: new Date().toISOString()
      },
      som: {
        run_id: `p2e-som-${Date.now()}`,
        job_type: 'som_training',
        packet_keys: packetKeys,
        metadata: {
          grid_size: 10,
          learning_rate: 0.5,
          epochs: 20,
          random_seed: 42,
          feature_schema_version: 'feature-envelope-v1',
          model_version: 'topology-p2e-v1'
        },
        requested_at: new Date().toISOString()
      },
      pagerank: {
        run_id: `p2e-pagerank-${Date.now()}`,
        job_type: 'pagerank_scoring',
        packet_keys: packetKeys,
        metadata: {
          damping: 0.85,
          iterations: 30,
          tol: 1e-4,
          random_seed: 42,
          feature_schema_version: 'feature-envelope-v1',
          model_version: 'topology-p2e-v1'
        },
        requested_at: new Date().toISOString()
      }
    };

    console.log('📝 Job Payloads:');
    Object.entries(jobPayloads).forEach(([worker, job]) => {
      console.log(`  ${worker.padEnd(12)} (${job.packet_keys.length} packets) → ${QUEUES[worker]}`);
    });
    console.log('');

    if (isDryRun) {
      console.log('Sample KMeans payload:');
      console.log(JSON.stringify(jobPayloads.kmeans, null, 2).split('\n').slice(0, 15).join('\n'));
      console.log('  ...\n');
      console.log('✨ DRY-RUN COMPLETE\n');
      process.exit(0);
    }

    // Connect to RabbitMQ
    console.log('🔌 Connecting to RabbitMQ...');
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // Declare queues
    console.log(`📋 Declaring ${Object.keys(QUEUES).length} queues...`);
    for (const queue of Object.values(QUEUES)) {
      await channel.assertQueue(queue, { durable: true });
    }
    console.log('✓ Queues declared\n');

    // Publish jobs
    console.log('📡 Publishing jobs...\n');
    let published = 0;

    for (const [worker, job] of Object.entries(jobPayloads)) {
      const queue = QUEUES[worker];
      const message = Buffer.from(JSON.stringify(job));

      await channel.sendToQueue(queue, message, {
        persistent: true,
        contentType: 'application/json',
        headers: {
          'x-run-id': job.run_id,
          'x-job-type': job.job_type
        }
      });

      published++;
      console.log(`  ✓ ${worker.padEnd(12)} → ${queue}`);
    }

    console.log(`\nTotal published: ${published} jobs\n`);

    // Verify queues have messages
    console.log('📊 Queue Status:');
    for (const [name, queue] of Object.entries(QUEUES)) {
      const queueInfo = await channel.checkQueue(queue);
      console.log(`  ${name.padEnd(12)} : ${queueInfo.messageCount} message(s)`);
    }

    console.log('\n✨ Phase 2E Publisher COMPLETE!\n');
    console.log('Next: Start GPU consumers with:');
    console.log('  $ wsl -d Ubuntu source /mnt/c/Users/james/Videos/deeds-web-app/.venv-cu130/bin/activate');
    console.log('  $ python /mnt/c/Users/james/Videos/deeds-web-app/python-workers/consumer_topology_kmeans.py');
    console.log('  $ python /mnt/c/Users/james/Videos/deeds-web-app/python-workers/consumer_topology_som.py');
    console.log('  $ python /mnt/c/Users/james/Videos/deeds-web-app/python-workers/consumer_topology_pagerank.py\n');

    await channel.close();
    await connection.close();

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

publishJobs();
