#!/usr/bin/env node
/**
 * MEM-POOL-CAP-01 benchmark: ArrayBuffer pool retention and throughput for tensorrt_bridge.node.
 *
 *   node --expose-gc scripts/atlas/pool-cap-benchmark-v1.mjs --addon <path> --label <name> [--workers 1,4,8]
 *
 * Read-only with respect to repo/DB/services: loads the addon, calls the CPU-only `scale()` export
 * (allocates one pooled output ArrayBuffer per call), and writes a JSON receipt under .tmp/atlas/.
 * Works with both the baseline (live) addon and the capped build: new telemetry fields are optional.
 */
import { createRequire } from 'node:module';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
import path from 'node:path';

const MiB = 1024 * 1024;
const arg = (n, d) => {
	const i = process.argv.indexOf(`--${n}`);
	return i > -1 ? process.argv[i + 1] : d;
};

function loadAddon(p) {
	const require = createRequire(import.meta.url);
	return require(path.resolve(p));
}

// worker threads reject --expose-gc in execArgv; enable it per-isolate instead
v8.setFlagsFromString('--expose-gc');
const forceGc = vm.runInNewContext('gc');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle() {
	for (let i = 0; i < 4; i++) {
		forceGc();
		await sleep(50);
	}
}
const mem = () => {
	const m = process.memoryUsage();
	return { rssMiB: +(m.rss / MiB).toFixed(1), externalMiB: +(m.external / MiB).toFixed(1), arrayBuffersMiB: +(m.arrayBuffers / MiB).toFixed(1) };
};
const pool = (addon) => {
	const s = addon.poolStats?.() ?? {};
	return {
		totalPooled: s.totalPooled ?? null,
		capacityBytesMiB: s.totalCapacityBytes != null ? +(s.totalCapacityBytes / MiB).toFixed(1) : null,
		idleMiB: s.idleBytes != null ? +(s.idleBytes / MiB).toFixed(1) : null,
		leasedMiB: s.leasedBytes != null ? +(s.leasedBytes / MiB).toFixed(1) : null,
		peakLeasedMiB: s.peakLeasedBytes != null ? +(s.peakLeasedBytes / MiB).toFixed(1) : null,
		allocationCount: s.allocationCount ?? null,
		reuseCount: s.reuseCount ?? null,
		rejectedPoolReturns: s.rejectedPoolReturns ?? null,
	};
};

async function workload(addonPath) {
	const addon = loadAddon(addonPath);
	const sizesMiB = [8, 16, 32]; // three power-of-two buckets
	const perBucket = 10; // > the 8-per-bucket count cap
	const out = { before: { mem: mem(), pool: pool(addon) } };
	const held = [];
	for (const mb of sizesMiB) {
		const n = (mb * MiB) / 4;
		const input = new Float32Array(n).fill(1);
		for (let i = 0; i < perBucket; i++) held.push(addon.scale(input, 2.0, n));
	}
	out.peakHeld = { mem: mem(), pool: pool(addon) };
	held.length = 0; // drop all references, let V8 finalizers run
	await settle();
	out.afterRelease = { mem: mem(), pool: pool(addon) };
	// reuse path: second round should hit the pool
	const input = new Float32Array((8 * MiB) / 4).fill(1);
	for (let i = 0; i < 5; i++) held.push(addon.scale(input, 2.0, (8 * MiB) / 4));
	held.length = 0;
	await settle();
	out.afterReuse = { mem: mem(), pool: pool(addon) };
	// oversized + tiny buffers, repeated acquire/release
	for (let i = 0; i < 20; i++) {
		const big = new Float32Array((64 * MiB) / 4);
		held.push(addon.scale(big, 1.5, big.length));
		if (held.length > 2) held.shift();
	}
	held.length = 0;
	await settle();
	out.afterOversized = { mem: mem(), pool: pool(addon) };
	// throughput / latency on the hot reuse path (1 MiB output)
	const small = new Float32Array((1 * MiB) / 4).fill(1);
	const lat = [];
	for (let i = 0; i < 400; i++) {
		const t = performance.now();
		const r = addon.scale(small, 1.0001, small.length);
		lat.push(performance.now() - t);
		if (r.length !== small.length) throw new Error('bad length');
	}
	lat.sort((a, b) => a - b);
	const q = (p) => +lat[Math.min(lat.length - 1, Math.floor(p * lat.length))].toFixed(3);
	out.hotPathMs = { p50: q(0.5), p95: q(0.95), p99: q(0.99), calls: lat.length };
	// parity checksum (deterministic)
	const probe = new Float32Array(1024).map((_, i) => (i % 17) / 16);
	const res = addon.scale(probe, 3.0, 1024);
	out.checksum = createHash('sha256').update(Buffer.from(res.buffer, res.byteOffset, res.byteLength)).digest('hex').slice(0, 16);
	return out;
}

if (!isMainThread) {
	workload(workerData.addon).then((r) => parentPort.postMessage(r), (e) => parentPort.postMessage({ error: String(e) }));
} else {
	const addonPath = arg('addon');
	const label = arg('label', 'run');
	const workers = (arg('workers', '1')).split(',').map(Number);
	if (!addonPath) {
		console.error('usage: --addon <path> --label <name> [--workers 1,4,8]');
		process.exit(2);
	}
		const stat = fs.statSync(addonPath);
	const receipt = {
		schema: 'atlas.pool-cap-benchmark.v1',
		label,
		addon: { path: addonPath, bytes: stat.size, mtime: stat.mtime.toISOString(), sha256: createHash('sha256').update(fs.readFileSync(addonPath)).digest('hex') },
		node: { version: process.version, abi: process.versions.modules, platform: process.platform },
		runs: {},
		canonicalWrites: false,
	};
	for (const w of workers) {
		const t0 = performance.now();
		const results = await Promise.all(
			Array.from({ length: w }, () => new Promise((resolve) => {
				const wk = new Worker(new URL(import.meta.url), { workerData: { addon: addonPath }, resourceLimits: { maxOldGenerationSizeMb: 512 } });
				wk.once('message', resolve);
				wk.once('error', (e) => resolve({ error: String(e) }));
			})),
		);
		const ok = results.filter((r) => !r.error);
		receipt.runs[`workers_${w}`] = {
			wallMs: +(performance.now() - t0).toFixed(0),
			failures: results.length - ok.length,
			errors: results.filter((r) => r.error).map((r) => r.error).slice(0, 2),
			// per-thread pools are thread_local: report per worker and the sum of idle after release
			afterRelease: ok.map((r) => r.afterRelease),
			afterOversized: ok.map((r) => r.afterOversized),
			hotPathMs: ok.map((r) => r.hotPathMs),
			checksums: [...new Set(ok.map((r) => r.checksum))],
			rssAtEndMiB: mem().rssMiB,
			processPeakRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(0),
			rssAfterWorkersExitMiB: await (async () => { await sleep(1500); forceGc(); await sleep(500); return mem().rssMiB; })(),
		};
	}
	const outDir = path.resolve('.tmp/atlas');
	fs.mkdirSync(outDir, { recursive: true });
	const file = path.join(outDir, `pool-cap-benchmark-${label}.json`);
	fs.writeFileSync(file, JSON.stringify(receipt, null, 1));
	console.log(JSON.stringify({ file, summary: Object.fromEntries(Object.entries(receipt.runs).map(([k, v]) => [k, { failures: v.failures, errors: v.errors, checksums: v.checksums, firstWorkerAfterRelease: v.afterRelease[0]?.pool, firstWorkerHotMs: v.hotPathMs[0] }])) }, null, 1));
}
