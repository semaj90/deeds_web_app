import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';

export const FILMCRAFT_TICKS_PER_SECOND_V1 = 254_016_000_000;

export interface FilmCraftExportRequestV1 {
	readonly executablePath: string;
	readonly projectPath: string;
	readonly outputPath: string;
	readonly timeoutMs: number;
	readonly signal?: AbortSignal;
	readonly expected?: {
		readonly width: number;
		readonly height: number;
		readonly fpsNumerator: number;
		readonly fpsDenominator: number;
		readonly durationSeconds: number;
		readonly colorProfile: 'bt709';
	};
}

export interface FilmCraftProbeV1 {
	readonly container: string;
	readonly duration: number;
	readonly file_size: number;
	readonly video: {
		readonly codec: string;
		readonly width: number;
		readonly height: number;
		readonly frame_rate: { readonly num: number; readonly den: number };
		readonly par: readonly [number, number];
		readonly color?: {
			readonly matrix?: string;
			readonly primaries?: string;
			readonly transfer?: string;
		};
	};
}

export interface FilmCraftExportReceiptV1 {
	readonly schema: 'atlas.filmcraft-export-receipt.v1';
	readonly outputPath: string;
	readonly outputSha256: string;
	readonly outputBytes: number;
	readonly probe: FilmCraftProbeV1;
}

export class FilmCraftCliErrorV1 extends Error {
	constructor(
		readonly code: 'INVALID_REQUEST' | 'ABORTED' | 'TIMEOUT' | 'PROCESS_FAILED' | 'OUTPUT_MISSING' | 'INVALID_PROBE' | 'PROFILE_MISMATCH',
		message: string,
	) {
		super(message);
		this.name = 'FilmCraftCliErrorV1';
	}
}

function validateRequest(request: FilmCraftExportRequestV1): void {
	if (!request.executablePath.trim() || !request.projectPath.trim() || !request.outputPath.trim()) {
		throw new FilmCraftCliErrorV1('INVALID_REQUEST', 'FilmCraft executable, project, and output paths are required.');
	}
	if (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 1_000 || request.timeoutMs > 900_000) {
		throw new FilmCraftCliErrorV1('INVALID_REQUEST', 'timeoutMs must be between 1000 and 900000.');
	}
	if (request.expected) {
		const { width, height, fpsNumerator, fpsDenominator, durationSeconds, colorProfile } = request.expected;
		if (![width, height, fpsNumerator, fpsDenominator, durationSeconds].every(Number.isFinite)
			|| width <= 0 || height <= 0 || fpsNumerator <= 0 || fpsDenominator <= 0 || durationSeconds <= 0
			|| colorProfile !== 'bt709') {
			throw new FilmCraftCliErrorV1('INVALID_REQUEST', 'Expected export profile values must be positive finite numbers.');
		}
		if (!Number.isSafeInteger(durationSeconds * FILMCRAFT_TICKS_PER_SECOND_V1)) {
			throw new FilmCraftCliErrorV1('INVALID_REQUEST', 'Expected duration does not map to a safe integral FilmCraft tick count.');
		}
	}
}

function runProcess(
	executablePath: string,
	args: readonly string[],
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<string> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new FilmCraftCliErrorV1('ABORTED', 'FilmCraft operation was canceled before launch.'));
			return;
		}

		let child: ChildProcess;
		try {
			child = spawn(executablePath, [...args], {
				shell: false,
				windowsHide: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
		} catch (error) {
			reject(new FilmCraftCliErrorV1('PROCESS_FAILED', error instanceof Error ? error.message : 'FilmCraft could not start.'));
			return;
		}

		let stdout = '';
		let stderr = '';
		let settled = false;
		let stopError: FilmCraftCliErrorV1 | undefined;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		const maxOutputChars = 1_000_000;
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (killTimer) clearTimeout(killTimer);
			signal?.removeEventListener('abort', onAbort);
			fn();
		};
		const stopProcess = (error: FilmCraftCliErrorV1) => {
			if (settled || stopError) return;
			stopError = error;
			child.kill();
			// Wait for close before reporting completion; otherwise a retry could
			// overlap a renderer process that is still writing the same artifact.
			killTimer = setTimeout(() => child.kill('SIGKILL'), 1_000);
		};
		const onAbort = () => stopProcess(new FilmCraftCliErrorV1('ABORTED', 'FilmCraft operation was canceled.'));
		const timer = setTimeout(() => {
			stopProcess(new FilmCraftCliErrorV1('TIMEOUT', `FilmCraft exceeded ${timeoutMs} ms.`));
		}, timeoutMs);
		signal?.addEventListener('abort', onAbort, { once: true });
		child.stdout?.setEncoding('utf8');
		child.stderr?.setEncoding('utf8');
		child.stdout?.on('data', (chunk: string) => {
			stdout = (stdout + chunk).slice(-maxOutputChars);
		});
		child.stderr?.on('data', (chunk: string) => {
			stderr = (stderr + chunk).slice(-maxOutputChars);
		});
		child.once('error', (error) => {
			const failure = new FilmCraftCliErrorV1('PROCESS_FAILED', error.message);
			if (!child.pid) finish(() => reject(failure));
			else stopProcess(failure);
		});
		child.once('close', (code) => {
			if (stopError) {
				finish(() => reject(stopError));
				return;
			}
			if (code !== 0) {
				finish(() => reject(new FilmCraftCliErrorV1('PROCESS_FAILED', `FilmCraft exited ${code}: ${stderr.slice(-4_000)}`)));
				return;
			}
			finish(() => resolve(stdout));
		});
	});
}

function parseProbe(raw: string): FilmCraftProbeV1 {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new FilmCraftCliErrorV1('INVALID_PROBE', 'FilmCraft probe did not return JSON.');
	}
	if (!parsed || typeof parsed !== 'object') {
		throw new FilmCraftCliErrorV1('INVALID_PROBE', 'FilmCraft probe returned no media object.');
	}
	const value = parsed as Partial<FilmCraftProbeV1>;
	const video = value.video;
	if (typeof value.container !== 'string' || !Number.isFinite(value.duration) || !Number.isSafeInteger(value.file_size)
		|| !video || typeof video.codec !== 'string' || !Number.isSafeInteger(video.width) || !Number.isSafeInteger(video.height)
		|| !video.frame_rate || !Number.isSafeInteger(video.frame_rate.num) || !Number.isSafeInteger(video.frame_rate.den)
		|| !Array.isArray(video.par) || video.par.length !== 2 || !video.par.every(Number.isSafeInteger)) {
		throw new FilmCraftCliErrorV1('INVALID_PROBE', 'FilmCraft probe is missing required video fields.');
	}
	return value as FilmCraftProbeV1;
}

export function validateFilmCraftProbeV1(
	probe: FilmCraftProbeV1,
	expected: NonNullable<FilmCraftExportRequestV1['expected']>,
): void {
	const expectedDurationTicks = expected.durationSeconds * FILMCRAFT_TICKS_PER_SECOND_V1;
	const valid = /h\.264/i.test(probe.video.codec)
		&& probe.video.width === expected.width
		&& probe.video.height === expected.height
		&& probe.video.frame_rate.num * expected.fpsDenominator === expected.fpsNumerator * probe.video.frame_rate.den
		&& probe.video.par[0] === probe.video.par[1]
		&& (expected.colorProfile !== 'bt709' || (
			probe.video.color?.matrix?.toLowerCase() === 'bt709' &&
			probe.video.color?.primaries?.toLowerCase() === 'bt709' &&
			probe.video.color?.transfer?.toLowerCase() === 'bt709'
		))
		&& probe.duration === expectedDurationTicks
		&& probe.file_size > 0;
	if (!valid) {
		throw new FilmCraftCliErrorV1('PROFILE_MISMATCH', 'FilmCraft output does not match the requested H.264 dimensions, frame rate, square pixels, or duration.');
	}
}

async function sha256File(path: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash('sha256');
		const stream = createReadStream(path);
		stream.on('data', (chunk) => hash.update(chunk));
		stream.once('error', reject);
		stream.once('end', () => resolve(hash.digest('hex')));
	});
}

/**
 * Runs a pinned, caller-selected FilmCraft CLI as a bounded child process.
 * This adapter does not enqueue work or establish authorization/lease ownership;
 * callers must invoke it only from a qualified worker after those gates pass.
 */
export async function exportFilmCraftProjectV1(
	request: FilmCraftExportRequestV1,
): Promise<FilmCraftExportReceiptV1> {
	validateRequest(request);
	const exportArgs = [
		'--project', request.projectPath,
		'export', request.outputPath,
		'--format', 'h264',
		'--range', 'entire',
		'--gpu-rendering', 'off',
		'--no-audio',
	];
	await runProcess(request.executablePath, exportArgs, request.timeoutMs, request.signal);

	let outputStat;
	try {
		outputStat = await stat(request.outputPath);
	} catch {
		throw new FilmCraftCliErrorV1('OUTPUT_MISSING', 'FilmCraft completed without creating the requested output file.');
	}
	if (!outputStat.isFile() || outputStat.size <= 0) {
		throw new FilmCraftCliErrorV1('OUTPUT_MISSING', 'FilmCraft output is not a non-empty regular file.');
	}

	const probeRaw = await runProcess(request.executablePath, ['probe', request.outputPath], request.timeoutMs, request.signal);
	const probe = parseProbe(probeRaw);
	if (request.expected) validateFilmCraftProbeV1(probe, request.expected);
	if (probe.file_size !== outputStat.size) {
		throw new FilmCraftCliErrorV1('INVALID_PROBE', 'FilmCraft probe byte count differs from the output file readback.');
	}
	return {
		schema: 'atlas.filmcraft-export-receipt.v1',
		outputPath: request.outputPath,
		outputSha256: await sha256File(request.outputPath),
		outputBytes: outputStat.size,
		probe,
	};
}
