import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

type HammingResult = {
	schema: string;
	authority: string;
	backend: 'AVX2' | 'AVX512' | 'SCALAR';
	candidateOrdinals: Uint32Array;
	distances: Uint16Array;
};

type Payload = {
	query: Uint8Array;
	packedCandidates: Uint8Array;
	candidateOrdinals: Uint32Array;
};

const nativeAddonPath = process.env.ATLAS_NATIVE_CORE_NODE_PATH;
if (!nativeAddonPath || !existsSync(nativeAddonPath)) {
	throw new Error('ATLAS_NATIVE_CORE_NODE_PATH must name an existing platform-compatible addon');
}

// This is a local, CPU-only benchmark. Do not emit Langfuse telemetry.
process.env.LANGFUSE_ENABLED = 'false';

const { ComputePool } = await import('../../src/lib/server/workers/compute-pool.js');

function makePayload(count: number): Payload {
	const query = Uint8Array.from({ length: 16 }, (_, index) => (index * 19 + 7) & 0xff);
	const packedCandidates = new Uint8Array(count * 16);
	for (let index = 0; index < packedCandidates.length; index += 1) {
		packedCandidates[index] = (index * 31 + 17) & 0xff;
	}
	const candidateOrdinals = Uint32Array.from({ length: count }, (_, index) => index * 3 + 11);
	return { query, packedCandidates, candidateOrdinals };
}

function scalarDistance(query: Uint8Array, candidate: Uint8Array): number {
	let distance = 0;
	for (let index = 0; index < 16; index += 1) {
		let value = query[index] ^ candidate[index];
		while (value !== 0) {
			distance += 1;
			value &= value - 1;
		}
	}
	return distance;
}

function assertParity(result: HammingResult, payload: Payload): void {
	if (result.schema !== 'atlas.hamming128.worker-result.v1'
		|| result.authority !== 'PROPOSAL_ONLY'
		|| result.candidateOrdinals.length !== payload.candidateOrdinals.length
		|| result.distances.length !== payload.candidateOrdinals.length) {
		throw new Error('HAMMING128_WORKER_RESULT_SHAPE_INVALID');
	}
	for (let index = 0; index < result.distances.length; index += 1) {
		const offset = index * 16;
		const expected = scalarDistance(payload.query, payload.packedCandidates.subarray(offset, offset + 16));
		if (result.candidateOrdinals[index] !== payload.candidateOrdinals[index]
			|| result.distances[index] !== expected) {
			throw new Error(`HAMMING128_SCALAR_PARITY_MISMATCH:${index}`);
		}
	}
}

async function runAndMeasure(pool: InstanceType<typeof ComputePool>, payload: Payload, repetitions: number) {
	const run = () => pool.run<HammingResult>('hamming128.proposal', payload);
	for (let index = 0; index < 8; index += 1) assertParity(await run(), payload);
	const samples: number[] = [];
	let latest: HammingResult | undefined;
	for (let index = 0; index < repetitions; index += 1) {
		const startedAt = performance.now();
		latest = await run();
		const elapsedMs = performance.now() - startedAt;
		assertParity(latest, payload);
		samples.push(elapsedMs);
	}
	samples.sort((left, right) => left - right);
	return {
		backend: latest?.backend ?? 'SCALAR',
		candidateCount: payload.candidateOrdinals.length,
		repetitions,
		p50Ms: Number(samples[Math.floor(samples.length * 0.5)].toFixed(3)),
		p95Ms: Number(samples[Math.floor(samples.length * 0.95)].toFixed(3)),
	};
}

async function main(): Promise<void> {
	const originalAddonPath = process.env.ATLAS_NATIVE_CORE_NODE_PATH;
	const nativePool = new ComputePool(1, 8, 4 * 1024 * 1024);
	const cases: Array<{ count: number; backend: string }> = [];
	try {
		for (const count of [0, 1, 31, 32, 33, 64, 4096]) {
			const payload = makePayload(count);
			const result = await nativePool.run<HammingResult>('hamming128.proposal', payload);
			assertParity(result, payload);
			if (result.backend === 'SCALAR') throw new Error('NATIVE_SIMD_BACKEND_NOT_SELECTED');
			cases.push({ count, backend: result.backend });
		}

		const overLimit = makePayload(4097);
		let rejectedOverLimit = false;
		try {
			await nativePool.run<HammingResult>('hamming128.proposal', overLimit);
		} catch (error) {
			rejectedOverLimit = String(error).includes('HAMMING128_PROPOSAL_SHAPE_INVALID');
		}
		if (!rejectedOverLimit) throw new Error('HAMMING128_4097_LIMIT_NOT_REJECTED');

		const payload = makePayload(4096);
		const native = await runAndMeasure(nativePool, payload, 100);
		if (native.backend === 'SCALAR') throw new Error('NATIVE_SIMD_BENCHMARK_FELL_BACK_TO_SCALAR');
		await nativePool.dispose();

		process.env.ATLAS_NATIVE_CORE_NODE_PATH = 'C:/__atlas_deliberately_missing__/atlas_native_core.node';
		const scalarPool = new ComputePool(1, 8, 4 * 1024 * 1024);
		try {
			const scalar = await runAndMeasure(scalarPool, payload, 100);
			if (scalar.backend !== 'SCALAR') throw new Error('SCALAR_ORACLE_BACKEND_NOT_SELECTED');
			console.log(JSON.stringify({
				workerPool: 'ComputePool(1)',
				adversarialOverLimit: '4097_REJECTED',
				edgeCases: cases,
				native,
				scalar,
				parity: 'PASS',
				authority: 'PROPOSAL_ONLY',
				telemetry: 'disabled',
				gpu: 'not invoked',
			}, null, 2));
		} finally {
			await scalarPool.dispose();
		}
	} finally {
		await nativePool.dispose();
		if (originalAddonPath === undefined) delete process.env.ATLAS_NATIVE_CORE_NODE_PATH;
		else process.env.ATLAS_NATIVE_CORE_NODE_PATH = originalAddonPath;
	}
}

await main();
