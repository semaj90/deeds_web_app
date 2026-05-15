#!/usr/bin/env node

/**
 * MapReduce Runner — Standalone Node.js Process
 *
 * WHY .mjs AND NOT .ts:
 * This file is spawned via child_process.fork() from SvelteKit.
 * Vite dev server transforms worker_threads internally, causing spawned
 * Workers to become zombies (created but never execute). By forking this
 * as a separate Node.js process, we bypass Vite's module transformation
 * entirely. Node.js cannot run .ts files natively — we'd need tsx/ts-node
 * which adds startup latency. Plain .mjs is the most reliable approach.
 *
 * ARCHITECTURE:
 *   SvelteKit API (Vite) --fork()--> mapreduce-runner.mjs --Worker()--> mapreduce-worker.mjs
 *   (Vite transforms)                (pure Node.js)                     (pure Node.js)
 *
 * IPC PROTOCOL:
 *   Parent → Runner: { type: 'start', jobId: string, concurrency: number, batchSize: number }
 *   Runner → Parent: { type: 'ready' }
 *   Runner → Parent: { type: 'worker-message', workerId: number, data: any }
 *   Runner → Parent: { type: 'worker-error', workerId: number, error: string }
 *   Runner → Parent: { type: 'worker-exit', workerId: number, code: number }
 *   Runner → Parent: { type: 'all-done' }
 *
 * @module mapreduce-runner
 */

import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {string} Absolute path to the worker script */
const workerPath = path.join(__dirname, 'mapreduce-worker.mjs');

/**
 * @typedef {Object} StartMessage
 * @property {'start'} type
 * @property {string} jobId - UUID of the MapReduce job
 * @property {number} concurrency - Number of worker threads to spawn
 * @property {number} batchSize - Chunks per worker batch
 */

/**
 * @typedef {Object} WorkerExitMessage
 * @property {'worker-exit'} type
 * @property {number} workerId
 * @property {number} code - Exit code (0 = success)
 */

/** @type {Worker[]} Active worker threads */
const workers = [];

/** @type {number} Safety timeout in ms (10 minutes) */
const SAFETY_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Handle incoming IPC messages from the parent SvelteKit process
 * @param {StartMessage} msg
 */
process.on('message', async (msg) => {
	if (msg.type !== 'start') return;

	const { jobId, concurrency = 4, batchSize = 32 } = msg;
	console.log(`[Runner] Starting ${concurrency} workers for job ${jobId}`);
	console.log(`[Runner] Worker path: ${workerPath}`);
	console.log(`[Runner] Batch size: ${batchSize}`);

	let completedWorkers = 0;

	for (let i = 0; i < concurrency; i++) {
		/** @type {Worker} */
		const worker = new Worker(workerPath, {
			workerData: {
				workerId: i,
				jobId,
				batchSize,
				fp16Mode: false
			}
		});

		worker.on('message', (/** @type {any} */ m) => {
			process.send({ type: 'worker-message', workerId: i, data: m });
		});

		worker.on('error', (/** @type {Error} */ err) => {
			console.error(`[Runner] Worker ${i} error:`, err.message);
			process.send({ type: 'worker-error', workerId: i, error: err.message });
		});

		worker.on('exit', (/** @type {number} */ code) => {
			completedWorkers++;
			console.log(`[Runner] Worker ${i} exited (code ${code}), ${completedWorkers}/${concurrency} done`);
			process.send({ type: 'worker-exit', workerId: i, code });

			if (completedWorkers >= concurrency) {
				console.log('[Runner] All workers finished');
				process.send({ type: 'all-done' });
				setTimeout(() => process.exit(0), 1000);
			}
		});

		workers.push(worker);
	}

	console.log(`[Runner] ${workers.length} workers spawned`);

	// Safety timeout: kill all workers after SAFETY_TIMEOUT_MS
	setTimeout(() => {
		console.log('[Runner] Safety timeout reached — terminating workers');
		workers.forEach(w => w.terminate());
		process.exit(1);
	}, SAFETY_TIMEOUT_MS);
});

// Signal to parent that we're ready to receive start command
process.send({ type: 'ready' });
console.log('[Runner] Ready, waiting for start command...');
