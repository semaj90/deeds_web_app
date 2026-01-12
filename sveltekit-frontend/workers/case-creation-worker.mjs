#!/usr/bin/env node
/**
 * RabbitMQ Worker: Case Creation Consumer
 * Processes case_creation jobs from the queue
 *
 * Usage:
 *   node workers/case-creation-worker.mjs
 *
 * Features:
 * - Fair dispatch (prefetch=1)
 * - Manual message acknowledgment
 * - Retry logic with exponential backoff
 * - Graceful shutdown
 */

import amqp from 'amqplib';

const QUEUE_NAME = 'case_creation_queue';
const RABBITMQ_URL = 'amqp://localhost:5672';
const MAX_RETRIES = 3;

/**
 * Process case creation job
 */
async function processCaseCreation(job) {
	const { jobId, payload } = job;

	console.log(`📋 Processing case creation job ${jobId}...`);

	try {
		// Call SvelteKit API to create case
		const response = await fetch('http://localhost:5175/api/cases', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...payload,
				jobId,
				source: 'rabbitmq_worker'
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Case creation failed: ${error}`);
		}

		const result = await response.json();
		console.log(`✅ Case created successfully:`, result.id);

		return result;
	} catch (error) {
		console.error(`❌ Error processing job ${jobId}:`, error);
		throw error;
	}
}

/**
 * Start worker
 */
async function startWorker() {
	try {
		// Connect to RabbitMQ
		const connection = await amqp.connect(RABBITMQ_URL);
		console.log('✅ Connected to RabbitMQ');

		const channel = await connection.createChannel();
		console.log('✅ Channel created');

		// Assert queue
		await channel.assertQueue(QUEUE_NAME, {
			durable: true,
			arguments: {
				'x-max-priority': 10
			}
		});

		// Fair dispatch: Don't send new message until current is acknowledged
		channel.prefetch(1);

		console.log(`👷 Worker ready. Waiting for jobs in ${QUEUE_NAME}...`);

		// Consume messages
		channel.consume(
			QUEUE_NAME,
			async (msg) => {
				if (!msg) return;

				try {
					const job = JSON.parse(msg.content.toString());
					const retryCount = (msg.properties.headers?.['x-retry-count'] || 0);

					// Process job
					await processCaseCreation(job);

					// Acknowledge success
					channel.ack(msg);
				} catch (error) {
					console.error('❌ Job processing failed:', error);

					const retryCount = (msg.properties.headers?.['x-retry-count'] || 0);

					if (retryCount < MAX_RETRIES) {
						// Retry with exponential backoff
						const delay = Math.pow(2, retryCount) * 1000;

						console.log(`🔄 Retrying job in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

						setTimeout(() => {
							channel.nack(msg, false, true); // Requeue
						}, delay);
					} else {
						// Max retries exceeded, move to dead letter queue
						console.error(`💀 Job failed after ${MAX_RETRIES} retries. Moving to DLQ.`);
						channel.nack(msg, false, false); // Don't requeue
					}
				}
			},
			{ noAck: false } // Manual acknowledgment
		);

		// Graceful shutdown
		const shutdown = async () => {
			console.log('\n🛑 Shutting down worker...');

			await channel.close();
			await connection.close();

			console.log('✅ Worker stopped gracefully');
			process.exit(0);
		};

		process.on('SIGINT', shutdown);
		process.on('SIGTERM', shutdown);
	} catch (error) {
		console.error('❌ Worker startup failed:', error);
		process.exit(1);
	}
}

// Start worker
startWorker();
