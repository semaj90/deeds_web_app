import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeSpz } from './spz-decode-core.js';
import { createSpzWorkerHandler, type SpzWorkerRequest, type SpzWorkerResponse } from './spz-decode-core.js';
import { SpzDecodeClient, type SpzWorkerLike } from './spz-decode-client.js';
import { SpzError } from './spz-loader.js';

const fixturePath = resolve(process.cwd(), 'src/lib/splat/fixtures/niantic-official-degree1-3pt.spz');
const fixtureBytes = (): Uint8Array => new Uint8Array(readFileSync(fixturePath));
	const officialFixtureBytes = (degree: number): Uint8Array =>
		new Uint8Array(readFileSync(resolve(process.cwd(), `src/lib/splat/fixtures/niantic-official-degree${degree}-${degree === 0 ? '5' : '3'}pt.spz`)));
const copyBuffer = (): ArrayBuffer => {
	const b = fixtureBytes();
	return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/**
 * Fake worker that runs the real worker handler. postMessage clones the request with structuredClone and a
 * transfer list, which detaches the sender's buffers the same way a real postMessage does.
 */
class FakeWorker implements SpzWorkerLike {
	onmessage: ((ev: MessageEvent<SpzWorkerResponse>) => void) | null = null;
	onerror: ((ev: ErrorEvent) => void) | null = null;
	terminated = false;
	private readonly handle = createSpzWorkerHandler((msg, transfer) => {
		const cloned = structuredClone(msg, { transfer: transfer ?? [] }) as SpzWorkerResponse;
		queueMicrotask(() => this.onmessage?.({ data: cloned } as MessageEvent<SpzWorkerResponse>));
	});
	postMessage(msg: SpzWorkerRequest, transfer: ArrayBuffer[] = []): void {
		const cloned = structuredClone(msg, { transfer }) as SpzWorkerRequest;
		void this.handle(cloned);
	}
	terminate(): void {
		this.terminated = true;
	}
	crash(): void {
		this.onerror?.({ message: 'simulated worker crash' } as ErrorEvent);
	}
}

describe('SPZ worker decode (core handler through a fake worker)', () => {
	it('returns the same decode as the main thread, including both checksums', async () => {
		const client = new SpzDecodeClient(() => new FakeWorker());
		const job = client.decode(copyBuffer());
		const worker = await job.result;
		const direct = await decodeSpz(fixtureBytes());
		expect(worker.numPoints).toBe(3);
		expect(worker.sourceSha256).toBe(direct.sourceSha256);
		expect(worker.decodedSha256).toBe(direct.decodedSha256);
		expect(Array.from(worker.positions)).toEqual(Array.from(direct.positions));
		expect(Array.from(worker.rotations)).toEqual(Array.from(direct.rotations));
		client.dispose();
	});

	it.each([0, 1, 2, 3, 4])('matches CPU parser output for official SH degree %i', async (degree) => {
		const client = new SpzDecodeClient(() => new FakeWorker());
		const source = officialFixtureBytes(degree);
		const direct = await decodeSpz(source);
		const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
		const worker = await client.decode(buffer).result;
		expect(worker.shDegree).toBe(degree);
		expect(worker.decodedSha256).toBe(direct.decodedSha256);
		expect(Array.from(worker.sh)).toEqual(Array.from(direct.sh));
		client.dispose();
	});

	it('isolates concurrent request IDs and results', async () => {
		const client = new SpzDecodeClient(() => new FakeWorker());
		const first = client.decode(copyBuffer());
		const second = client.decode(copyBuffer());
		expect(first.id).not.toBe(second.id);
		const [a, b] = await Promise.all([first.result, second.result]);
		expect(a.sourceSha256).toBe(b.sourceSha256);
		expect(a.positions).not.toBe(b.positions);
		client.dispose();
	});

	it('returns typed arrays with the expected shapes and finite values', async () => {
		const client = new SpzDecodeClient(() => new FakeWorker());
		const p = await client.decode(copyBuffer()).result;
		expect(p.positions.length).toBe(p.numPoints * 3);
		expect(p.rotations.length).toBe(p.numPoints * 4);
		expect(p.scales.length).toBe(p.numPoints * 3);
		expect(p.alphas.length).toBe(p.numPoints);
		expect(p.sh.length).toBe(p.numPoints * p.shCoeffs * 3);
		for (const v of p.positions) expect(Number.isFinite(v)).toBe(true);
		for (const v of p.scales) expect(Number.isFinite(v)).toBe(true);
		for (const v of p.rotations) expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-6);
		client.dispose();
	});

	it('detaches the sender buffer after the transfer', async () => {
		const client = new SpzDecodeClient(() => new FakeWorker());
		const buf = copyBuffer();
		expect(buf.byteLength).toBeGreaterThan(0);
		const job = client.decode(buf);
		expect(buf.byteLength).toBe(0);
		await job.result;
		client.dispose();
	});

	it('drops a result when cancelled during decode', async () => {
		const client = new SpzDecodeClient(() => new FakeWorker());
		const job = client.decode(copyBuffer());
		client.cancel(job.id);
		await expect(job.result).rejects.toMatchObject({ code: 'SPZ_CANCELLED' });
		client.dispose();
	});

	it('rejects corrupt input with the loader error code', async () => {
		const client = new SpzDecodeClient(() => new FakeWorker());
		const garbage = new Uint8Array(64).fill(7).buffer;
		await expect(client.decode(garbage).result).rejects.toBeInstanceOf(SpzError);
		await expect(client.decode(new Uint8Array(64).fill(7).buffer).result).rejects.toMatchObject({ code: 'SPZ_BAD_MAGIC' });
		client.dispose();
	});

	it('rejects pending jobs on worker crash and starts a fresh worker for the next decode', async () => {
		const workers: FakeWorker[] = [];
		const client = new SpzDecodeClient(() => {
			const w = new FakeWorker();
			workers.push(w);
			return w;
		});
		const job = client.decode(copyBuffer());
		workers[0].crash();
		await expect(job.result).rejects.toMatchObject({ code: 'SPZ_WORKER_FAILED' });
		expect(workers[0].terminated).toBe(true);
		const next = await client.decode(copyBuffer()).result;
		expect(next.numPoints).toBe(3);
		expect(workers).toHaveLength(2);
		client.dispose();
	});

	it('rejects pending jobs on dispose and terminates the worker', async () => {
		const w = new FakeWorker();
		const client = new SpzDecodeClient(() => w);
		const job = client.decode(copyBuffer());
		client.dispose();
		await expect(job.result).rejects.toMatchObject({ code: 'SPZ_CLIENT_DISPOSED' });
		expect(w.terminated).toBe(true);
	});

	it('rejects the decode promise when posting to the worker fails', async () => {
		const worker: SpzWorkerLike = {
			postMessage() { throw new Error('post failed'); },
			terminate() {},
			onmessage: null,
			onerror: null
		};
		const client = new SpzDecodeClient(() => worker);
		await expect(client.decode(copyBuffer()).result).rejects.toMatchObject({ code: 'SPZ_WORKER_POST_FAILED' });
		client.dispose();
	});

	it('enforces the point cap inside the worker', async () => {
		const client = new SpzDecodeClient(() => new FakeWorker());
		await expect(client.decode(copyBuffer(), 2).result).rejects.toMatchObject({ code: 'SPZ_TOO_MANY_POINTS' });
		client.dispose();
	});
});
