/**
 * Subprocess port for the SAM 2 silhouette runner (python/atlas_sam2_silhouette_runner_v1.py).
 *
 * Writes the source image bytes to a private temp directory, runs one normalized box, validates
 * the JSON response, and always removes the temp directory. It never reads or writes evidence,
 * database rows, or object storage. Errors are stable codes; no partial output is returned.
 */
import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sam2MaskRunnerV1 } from './sam2-silhouette-adapter-v1.js';

export const SAM2_SUBPROCESS_DEFAULT_TIMEOUT_MS_V1 = 120_000;
export const SAM2_SUBPROCESS_MAX_OUTPUT_BYTES_V1 = 16 * 1024 * 1024;

export type Sam2SubprocessOptionsV1 = {
	python: string;
	script: string;
	config: string;
	checkpoint: string;
	timeoutMs?: number;
	spawnFn?: (command: string, args: string[]) => ChildProcessWithoutNullStreams;
};

const defaultSpawn = (command: string, args: string[]) =>
	nodeSpawn(command, args, { shell: false, windowsHide: true }) as ChildProcessWithoutNullStreams;

export function createSam2SubprocessRunnerV1(options: Sam2SubprocessOptionsV1): Sam2MaskRunnerV1 {
	const timeoutMs = options.timeoutMs ?? SAM2_SUBPROCESS_DEFAULT_TIMEOUT_MS_V1;
	const spawnFn = options.spawnFn ?? defaultSpawn;

	return async ({ bytes, bboxNormalized }) => {
		const dir = await mkdtemp(join(tmpdir(), 'sam2-silhouette-'));
		try {
			const imagePath = join(dir, 'source.bin');
			await writeFile(imagePath, bytes);
			const request = JSON.stringify({
				imagePath,
				bboxNormalized,
				config: options.config,
				checkpoint: options.checkpoint,
			});
			const stdout = await runChild(spawnFn, options.python, [options.script], request, timeoutMs);
			return parseRunnerOutput(stdout);
		} finally {
			await rm(dir, { recursive: true, force: true }).catch(() => {});
		}
	};
}

function runChild(
	spawnFn: NonNullable<Sam2SubprocessOptionsV1['spawnFn']>,
	command: string,
	args: string[],
	stdin: string,
	timeoutMs: number,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawnFn(command, args);
		let stdout = '';
		let settled = false;
		const finish = (error: Error | null, value?: string) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (error) reject(error);
			else resolve(value ?? '');
		};
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			finish(new Error('SAM2_RUNNER_TIMEOUT'));
		}, timeoutMs);
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;
			if (stdout.length > SAM2_SUBPROCESS_MAX_OUTPUT_BYTES_V1) {
				child.kill('SIGKILL');
				finish(new Error('SAM2_RUNNER_OUTPUT_TOO_LARGE'));
			}
		});
		child.stderr.resume();
		// If the child exits before reading stdin, the write emits EPIPE on stdin. Without a listener
			// that becomes an unhandled error event; the close handler reports the real failure instead.
			child.stdin.on('error', () => {});
			child.on('error', () => finish(new Error('SAM2_RUNNER_SPAWN_FAILED')));
		child.on('close', (code) => {
			if (code === 0) finish(null, stdout);
			else finish(new Error(code === 2 ? 'SAM2_RUNNER_INVALID_REQUEST' : 'SAM2_RUNNER_FAILED'));
		});
		child.stdin.end(stdin);
	});
}

export function parseRunnerOutput(stdout: string): { maskPng: Uint8Array; iouScore: number } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		throw new Error('SAM2_RUNNER_OUTPUT_NOT_JSON');
	}
	const record = parsed as { maskPngBase64?: unknown; iouScore?: unknown };
	if (typeof record.maskPngBase64 !== 'string' || record.maskPngBase64.length === 0) {
		throw new Error('SAM2_RUNNER_MASK_MISSING');
	}
	if (typeof record.iouScore !== 'number' || !(record.iouScore >= 0 && record.iouScore <= 1)) {
		throw new Error('SAM2_RUNNER_SCORE_INVALID');
	}
	const maskPng = new Uint8Array(Buffer.from(record.maskPngBase64, 'base64'));
	const isPng = maskPng.length > 8 && maskPng[0] === 0x89 && maskPng[1] === 0x50 && maskPng[2] === 0x4e && maskPng[3] === 0x47;
	if (!isPng) throw new Error('SAM2_RUNNER_MASK_NOT_PNG');
	return { maskPng, iouScore: record.iouScore };
}
