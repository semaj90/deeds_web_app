#!/usr/bin/env node

/**
 * RabbitMQ CPU Worker for Embeddings
 *
 * Consumes from embeddings.cpu queue
 * Runs embeddinggemma:latest via Ollama on CPU (no GPU contention)
 * Responds via reply-to queue
 *
 * Usage:
 *   node scripts/workers/embedding-cpu-worker.mjs
 *   node scripts/workers/embedding-cpu-worker.mjs --rabbitmq amqp://...
 */

import amqp from 'amqplib';
import fetch from 'node-fetch';
import { env } from 'process';

const RABBITMQ_URL = env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const OLLAMA_URL = env.OLLAMA_URL || 'http://127.0.0.1:11434';
const QUEUE = 'embeddings.cpu';
const MAX_RETRIES = 3;

let channel = null;
let connection = null;

async function embedText(text) {
	try {
		const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				prompt: text
			}),
			timeout: 30000
		});

		if (!response.ok) {
			throw new Error(`Ollama returned ${response.status}`);
		}

		const data = await response.json();
		return data.embedding || null;
	} catch (error) {
		console.error('[embed-worker] Error:', error.message);
		throw error;
	}
}

async function processJob(msg) {
	if (!msg) return;

	try {
		const job = JSON.parse(msg.content.toString());
		console.log(`[embed-worker] Processing job ${job.id} (${job.text.length} chars)`);

		// Embed the text
		const embedding = await embedText(job.text);

		// Send response back
		if (msg.properties.replyTo) {
			const response = JSON.stringify({
				id: job.id,
				embedding,
				status: 'success'
			});

			channel.sendToQueue(msg.properties.replyTo, Buffer.from(response), {
				correlationId: msg.properties.correlationId
			});

			console.log(`[embed-worker] Response sent to ${msg.properties.replyTo}`);
		}

		// Acknowledge job
		channel.ack(msg);
	} catch (error) {
		console.error('[embed-worker] Job failed:', error.message);

		// Reject and optionally requeue
		const job = JSON.parse(msg.content.toString());
		const retryCount = (msg.properties.headers?.['retry-count'] || 0) + 1;

		if (retryCount < MAX_RETRIES) {
			console.log(`[embed-worker] Retrying job ${job.id} (attempt ${retryCount}/${MAX_RETRIES})`);
			channel.nack(msg, false, true); // Requeue
		} else {
			console.error(`[embed-worker] Max retries exceeded for job ${job.id}`);
			channel.nack(msg, false, false); // Dead-letter
		}
	}
}

async function start() {
	try {
		console.log(`[embed-worker] Connecting to ${RABBITMQ_URL}`);
		connection = await amqp.connect(RABBITMQ_URL);

		channel = await connection.createChannel();
		await channel.assertQueue(QUEUE, { durable: true });

		// Fair dispatch: only process one job at a time
		await channel.prefetch(1);

		console.log(`[embed-worker] Listening on queue: ${QUEUE}`);

		await channel.consume(QUEUE, processJob, { noAck: false });

		// Handle signals
		process.on('SIGINT', async () => {
			console.log('[embed-worker] Shutting down...');
			await channel.close();
			await connection.close();
			process.exit(0);
		});
	} catch (error) {
		console.error('[embed-worker] Fatal error:', error);
		process.exit(1);
	}
}

start().catch((err) => {
	console.error('[embed-worker] Startup failed:', err);
	process.exit(1);
});
