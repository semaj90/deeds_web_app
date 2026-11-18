import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { existsSync } from 'node:fs';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createSam2SubprocessRunnerV1, parseRunnerOutput } from './sam2-subprocess-runner-v1.js';

// A real 1x1 PNG (signature + IHDR + IDAT + IEND) is enough for the magic-byte check.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

type FakeOptions = { stdout?: string; code?: number; neverClose?: boolean };

function fakeChild(opts: FakeOptions, seen: { stdin: string; killed: boolean }) {
	const child = new EventEmitter() as EventEmitter & ChildProcessWithoutNullStreams;
	const out = new PassThrough();
	const err = new PassThrough();
	child.stdout = out as never;
	child.stderr = err as never;
	const chunks: string[] = [];
	child.stdin = new Writable({
		write(chunk, _enc, cb) { chunks.push(chunk.toString()); cb(); },
		final(cb) { seen.stdin = chunks.join(''); cb(); },
	}) as never;
	child.kill = (() => { seen.killed = true; return true; }) as never;
	setImmediate(() => {
		if (opts.neverClose) return;
		if (opts.stdout !== undefined) out.write(opts.stdout);
		out.end();
		err.end();
		child.emit('close', opts.code ?? 0);
	});
	return child;
}

describe('sam2 subprocess runner port', () => {
	it('reports the runner failure instead of an unhandled error when stdin hits EPIPE', async () => {
		const seen = { stdin: '', killed: false };
		const runner = createSam2SubprocessRunnerV1({
			python: 'py', script: 's', config: 'c', checkpoint: 'k',
			spawnFn: () => {
				const child = fakeChild({ code: 1 }, seen);
				// The child exited before reading stdin: the write fails with EPIPE.
				child.stdin = new Writable({ write(_chunk, _enc, cb) { cb(new Error('EPIPE')); } }) as never;
				return child;
			},
		});
		await expect(runner({ bytes: new Uint8Array([1]), mimeType: 'image/png', bboxNormalized: [0, 0, 1, 1] }))
			.rejects.toThrow('SAM2_RUNNER_FAILED');
	});

	it('sends the normalized box and image path as JSON and returns the validated PNG', async () => {
		const seen = { stdin: '', killed: false };
		const runner = createSam2SubprocessRunnerV1({
			python: 'py', script: 'runner.py', config: 'cfg.yaml', checkpoint: 'ck.pt',
			spawnFn: () => fakeChild({ stdout: JSON.stringify({ maskPngBase64: PNG_B64, iouScore: 0.8 }) }, seen),
		});
		const result = await runner({ bytes: new Uint8Array([1, 2]), mimeType: 'image/png', bboxNormalized: [0.1, 0.2, 0.5, 0.9] });
		expect(result.iouScore).toBe(0.8);
		expect(result.maskPng[0]).toBe(0x89);
		const request = JSON.parse(seen.stdin);
		expect(request.bboxNormalized).toEqual([0.1, 0.2, 0.5, 0.9]);
		expect(request.config).toBe('cfg.yaml');
		expect(existsSync(request.imagePath)).toBe(false); // temp directory removed after the call
	});

	it('maps exit code 2 to an invalid-request code and other failures to a runner-failed code', async () => {
		const bad = createSam2SubprocessRunnerV1({ python: 'py', script: 's', config: 'c', checkpoint: 'k',
			spawnFn: () => fakeChild({ code: 2 }, { stdin: '', killed: false }) });
		await expect(bad({ bytes: new Uint8Array([1]), mimeType: 'image/png', bboxNormalized: [0, 0, 1, 1] }))
			.rejects.toThrow('SAM2_RUNNER_INVALID_REQUEST');
		const failed = createSam2SubprocessRunnerV1({ python: 'py', script: 's', config: 'c', checkpoint: 'k',
			spawnFn: () => fakeChild({ code: 1 }, { stdin: '', killed: false }) });
		await expect(failed({ bytes: new Uint8Array([1]), mimeType: 'image/png', bboxNormalized: [0, 0, 1, 1] }))
			.rejects.toThrow('SAM2_RUNNER_FAILED');
	});

	it('kills a runner that does not finish within the timeout', async () => {
		const seen = { stdin: '', killed: false };
		const runner = createSam2SubprocessRunnerV1({ python: 'py', script: 's', config: 'c', checkpoint: 'k', timeoutMs: 20,
			spawnFn: () => fakeChild({ neverClose: true }, seen) });
		await expect(runner({ bytes: new Uint8Array([1]), mimeType: 'image/png', bboxNormalized: [0, 0, 1, 1] }))
			.rejects.toThrow('SAM2_RUNNER_TIMEOUT');
		expect(seen.killed).toBe(true);
	});
});

describe('parseRunnerOutput', () => {
	it('rejects output that is not JSON, has no mask, has a bad score, or is not a PNG', () => {
		expect(() => parseRunnerOutput('not json')).toThrow('SAM2_RUNNER_OUTPUT_NOT_JSON');
		expect(() => parseRunnerOutput(JSON.stringify({ iouScore: 0.5 }))).toThrow('SAM2_RUNNER_MASK_MISSING');
		expect(() => parseRunnerOutput(JSON.stringify({ maskPngBase64: PNG_B64, iouScore: 1.4 }))).toThrow('SAM2_RUNNER_SCORE_INVALID');
		expect(() => parseRunnerOutput(JSON.stringify({ maskPngBase64: Buffer.from('plain text').toString('base64'), iouScore: 0.5 })))
			.toThrow('SAM2_RUNNER_MASK_NOT_PNG');
	});
});
