/**
 * Node.js Cluster Wrapper for SvelteKit Production
 *
 * Forks CLUSTER_WORKERS worker processes sharing the same port.
 * Set CLUSTER_WORKERS=1 (or omit) to run single-process mode.
 *
 * Usage:
 *   node server.js                    # single-process (default)
 *   CLUSTER_WORKERS=4 node server.js  # 4 workers
 *   CLUSTER_WORKERS=auto node server.js  # cpus - 2
 */

import cluster from 'node:cluster';
import { cpus } from 'node:os';
import { createServer } from 'node:http';

const WORKER_COUNT_ENV = process.env.CLUSTER_WORKERS || '1';
const HEALTH_PORT = parseInt(process.env.CLUSTER_HEALTH_PORT || '9191', 10);
const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 60_000;
const SHUTDOWN_GRACE_MS = 15_000;

function getWorkerCount() {
	if (WORKER_COUNT_ENV === 'auto') return Math.max(1, cpus().length - 2);
	const n = parseInt(WORKER_COUNT_ENV, 10);
	return Number.isFinite(n) && n >= 1 ? n : 1;
}

const workerCount = getWorkerCount();

// ── Single-process mode (default) ──────────────────────────────────
if (workerCount <= 1) {
	// Set environment so hooks.server.ts knows this is worker 1
	process.env.CLUSTER_WORKER_ID = '1';
	process.env.CLUSTER_IS_PRIMARY = 'false';

	const app = await import('./build/index.js');
	console.log(`[Cluster] Single-process mode (pid ${process.pid})`);
	// SvelteKit adapter-node starts its own listener
	if (typeof app.default === 'function') app.default();
	// eslint-disable-next-line no-unreachable
} else if (cluster.isPrimary) {
	// ── Primary process ──────────────────────────────────────────────
	console.log(`[Cluster] Primary ${process.pid} starting ${workerCount} workers`);

	/** @type {Map<number, { restarts: number[], pid: number }>} */
	const workerMeta = new Map();

	for (let i = 0; i < workerCount; i++) {
		forkWorker(i + 1);
	}

	function forkWorker(workerId) {
		const worker = cluster.fork({
			CLUSTER_WORKER_ID: String(workerId),
			CLUSTER_IS_PRIMARY: 'false',
		});

		const meta = workerMeta.get(workerId) || { restarts: [], pid: 0 };
		meta.pid = worker.process.pid;
		workerMeta.set(workerId, meta);

		console.log(`[Cluster] Worker ${workerId} started (pid ${worker.process.pid})`);

		worker.on('exit', (code, signal) => {
			console.warn(`[Cluster] Worker ${workerId} exited (code=${code}, signal=${signal})`);

			if (shuttingDown) return;

			// Rate-limit restarts
			const now = Date.now();
			meta.restarts = meta.restarts.filter(t => now - t < RESTART_WINDOW_MS);
			if (meta.restarts.length >= MAX_RESTARTS) {
				console.error(`[Cluster] Worker ${workerId} exceeded ${MAX_RESTARTS} restarts in ${RESTART_WINDOW_MS / 1000}s — not restarting`);
				return;
			}
			meta.restarts.push(now);

			console.log(`[Cluster] Restarting worker ${workerId}...`);
			forkWorker(workerId);
		});
	}

	// ── Cluster health endpoint ────────────────────────────────────
	const healthServer = createServer((_req, res) => {
		const workers = [];
		for (const [id, worker] of Object.entries(cluster.workers || {})) {
			const meta = workerMeta.get(Number(id)) || { restarts: [], pid: 0 };
			workers.push({
				id: Number(id),
				pid: worker?.process?.pid,
				state: worker?.isDead() ? 'dead' : 'alive',
				restarts: meta.restarts.length,
			});
		}

		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({
			primary: process.pid,
			workerCount,
			uptime: process.uptime(),
			workers,
		}));
	});

	healthServer.listen(HEALTH_PORT, () => {
		console.log(`[Cluster] Health endpoint: http://localhost:${HEALTH_PORT}/cluster-health`);
	});

	// ── Graceful shutdown ──────────────────────────────────────────
	let shuttingDown = false;

	function shutdown(signal) {
		if (shuttingDown) {
			console.log(`[Cluster] ${signal} received again — forcing exit`);
			process.exit(1);
		}
		shuttingDown = true;
		console.log(`[Cluster] ${signal} received — shutting down ${workerCount} workers`);

		// Forward signal to all workers
		for (const worker of Object.values(cluster.workers || {})) {
			if (worker && !worker.isDead()) {
				worker.process.kill(signal);
			}
		}

		// Hard deadline
		const hardTimer = setTimeout(() => {
			console.error('[Cluster] Shutdown timeout — forcing exit');
			process.exit(1);
		}, SHUTDOWN_GRACE_MS);
		hardTimer.unref();

		// Wait for all workers to exit
		let exited = 0;
		cluster.on('exit', () => {
			exited++;
			if (exited >= workerCount) {
				healthServer.close();
				console.log('[Cluster] All workers exited');
				process.exit(0);
			}
		});
	}

	process.once('SIGTERM', () => shutdown('SIGTERM'));
	process.once('SIGINT', () => shutdown('SIGINT'));

} else {
	// ── Worker process ───────────────────────────────────────────────
	const workerId = process.env.CLUSTER_WORKER_ID || '?';
	console.log(`[Cluster] Worker ${workerId} (pid ${process.pid}) loading SvelteKit...`);

	const app = await import('./build/index.js');
	if (typeof app.default === 'function') app.default();
}
