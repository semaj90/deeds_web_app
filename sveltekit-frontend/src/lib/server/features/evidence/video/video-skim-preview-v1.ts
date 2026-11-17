import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { parseFfmpegPresentationTimestampsV1 } from './ffmpeg-presentation-timestamps-v1.js';

export const VIDEO_SKIM_PREVIEW_SCHEMA_V1 = 'atlas.video-skim-preview.v1' as const;
export const VIDEO_SKIM_PREVIEW_PROCESSING_REVISION_V1 = 'atlas.video-skim-preview.v1:ffmpeg-1fps-160x90-sprite100' as const;
export const VIDEO_SKIM_PREVIEW_MAX_SAMPLES_V1 = 14_400;
export const VIDEO_SKIM_PREVIEW_WINDOW_SAMPLES_V1 = 600;
export const VIDEO_SKIM_PREVIEW_TILE_FRAMES_V1 = 100;
export const VIDEO_SKIM_PREVIEW_TILE_COLUMNS_V1 = 10;
export const VIDEO_SKIM_PREVIEW_FRAME_WIDTH_V1 = 160;
export const VIDEO_SKIM_PREVIEW_FRAME_HEIGHT_V1 = 90;
export const VIDEO_SKIM_PREVIEW_TILE_WIDTH_V1 = VIDEO_SKIM_PREVIEW_TILE_COLUMNS_V1 * VIDEO_SKIM_PREVIEW_FRAME_WIDTH_V1;
export const VIDEO_SKIM_PREVIEW_TILE_ROWS_V1 = 10;
export const VIDEO_SKIM_PREVIEW_TILE_HEIGHT_V1 = VIDEO_SKIM_PREVIEW_TILE_ROWS_V1 * VIDEO_SKIM_PREVIEW_FRAME_HEIGHT_V1;

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const videoSkimPreviewManifestV1Schema = z.object({
	schema: z.literal(VIDEO_SKIM_PREVIEW_SCHEMA_V1),
	status: z.literal('COMPLETED'),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	analysisRevision: z.string().min(1).max(240),
	processingRevision: z.literal(VIDEO_SKIM_PREVIEW_PROCESSING_REVISION_V1),
	durationMs: z.number().int().positive().max(86_400_000),
	sampleIntervalMs: z.number().int().positive(),
	coverage: z.literal('FULL_DURATION_SAMPLED_NOT_EVERY_SOURCE_FRAME'),
	sampleTimestampsMs: z.array(z.number().int().nonnegative().max(86_400_000)).min(1).max(VIDEO_SKIM_PREVIEW_MAX_SAMPLES_V1),
	tileLayout: z.object({
		frameWidth: z.literal(VIDEO_SKIM_PREVIEW_FRAME_WIDTH_V1),
		frameHeight: z.literal(VIDEO_SKIM_PREVIEW_FRAME_HEIGHT_V1),
		framesPerTile: z.literal(VIDEO_SKIM_PREVIEW_TILE_FRAMES_V1),
		columns: z.literal(VIDEO_SKIM_PREVIEW_TILE_COLUMNS_V1),
		rows: z.literal(VIDEO_SKIM_PREVIEW_TILE_ROWS_V1),
		tileWidth: z.literal(VIDEO_SKIM_PREVIEW_TILE_WIDTH_V1),
		tileHeight: z.literal(VIDEO_SKIM_PREVIEW_TILE_HEIGHT_V1),
	}).strict(),
	tiles: z.array(z.object({
		index: z.number().int().nonnegative(),
		objectKey: z.string().min(1).max(1024),
		sha256: digestSchema,
		byteLength: z.number().int().positive().max(8 * 1024 * 1024),
		firstSampleIndex: z.number().int().nonnegative(),
		sampleCount: z.number().int().positive().max(VIDEO_SKIM_PREVIEW_TILE_FRAMES_V1),
	}).strict()).min(1).max(Math.ceil(VIDEO_SKIM_PREVIEW_MAX_SAMPLES_V1 / VIDEO_SKIM_PREVIEW_TILE_FRAMES_V1)),
}).strict().superRefine((manifest, context) => {
	for (let index = 0; index < manifest.sampleTimestampsMs.length; index += 1) {
		const timestamp = manifest.sampleTimestampsMs[index];
		if (timestamp >= manifest.durationMs || (index > 0 && timestamp <= manifest.sampleTimestampsMs[index - 1])) {
			context.addIssue({ code: z.ZodIssueCode.custom, path: ['sampleTimestampsMs', index], message: 'Sample timestamps must be increasing and inside the source duration.' });
		}
	}
	const expectedTileCount = Math.ceil(manifest.sampleTimestampsMs.length / VIDEO_SKIM_PREVIEW_TILE_FRAMES_V1);
	if (manifest.tiles.length !== expectedTileCount) {
		context.addIssue({ code: z.ZodIssueCode.custom, path: ['tiles'], message: 'Tile count must cover every sample exactly once.' });
	}
	for (let index = 0; index < manifest.tiles.length; index += 1) {
		const tile = manifest.tiles[index];
		const firstSampleIndex = index * VIDEO_SKIM_PREVIEW_TILE_FRAMES_V1;
		const sampleCount = Math.min(VIDEO_SKIM_PREVIEW_TILE_FRAMES_V1, manifest.sampleTimestampsMs.length - firstSampleIndex);
		if (tile.index !== index || tile.firstSampleIndex !== firstSampleIndex || tile.sampleCount !== sampleCount) {
			context.addIssue({ code: z.ZodIssueCode.custom, path: ['tiles', index], message: 'Tile ranges must be contiguous and cover each sample exactly once.' });
		}
	}
});

export type VideoSkimPreviewManifestV1 = z.infer<typeof videoSkimPreviewManifestV1Schema>;
export type VideoSkimPreviewTileV1 = VideoSkimPreviewManifestV1['tiles'][number];

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

async function runFfmpegV1(args: string[], maximumMs: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(ENV.FFMPEG_PATH?.trim() || 'ffmpeg', args, { shell: false, windowsHide: true });
		let stderr = '';
		let settled = false;
		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill('SIGKILL');
			reject(new Error('VIDEO_SKIM_FFMPEG_WINDOW_TIMEOUT'));
		}, maximumMs);
		child.stderr?.on('data', (chunk: Buffer | string) => {
			if (stderr.length < 1_000_000) stderr += chunk.toString();
		});
		child.on('error', (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			reject(error);
		});
		child.on('close', (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (code === 0) resolve(stderr);
			else reject(new Error(`VIDEO_SKIM_FFMPEG_FAILED:${code}:${stderr.slice(-500)}`));
		});
	});
}

/**
 * Extracts the full-duration low-resolution skim in bounded windows. Each emitted tile
 * is uploaded by the caller before the next window, so frame pixel buffers stay bounded.
 * The timestamps are FFmpeg showinfo presentation times relative to each seek window.
 */
export async function extractVideoSkimPreviewV1(input: {
	videoPath: string;
	durationSeconds: number;
	onTile(tile: { index: number; bytes: Buffer; sampleTimestampsMs: number[]; firstSampleIndex: number }): Promise<void>;
}): Promise<{ sampleIntervalMs: number; sampleTimestampsMs: number[]; tileCount: number }> {
	if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > 86_400) {
		throw new Error('VIDEO_SKIM_DURATION_OUT_OF_BOUNDS');
	}
	const durationMs = Math.ceil(input.durationSeconds * 1000);
	const sampleIntervalMs = Math.max(1000, Math.ceil(durationMs / VIDEO_SKIM_PREVIEW_MAX_SAMPLES_V1 / 1000) * 1000);
	const sampleCountLimit = Math.min(VIDEO_SKIM_PREVIEW_MAX_SAMPLES_V1, Math.ceil(durationMs / sampleIntervalMs));
	const intervalSeconds = sampleIntervalMs / 1000;
	const frameRate = `1/${intervalSeconds}`;
	const sampleTimestampsMs: number[] = [];
	let tileCount = 0;
	const sharpModule = await import('sharp');
	const sharp = sharpModule.default;

	for (let windowFirstSample = 0; windowFirstSample < sampleCountLimit; windowFirstSample += VIDEO_SKIM_PREVIEW_WINDOW_SAMPLES_V1) {
		const windowSampleCount = Math.min(VIDEO_SKIM_PREVIEW_WINDOW_SAMPLES_V1, sampleCountLimit - windowFirstSample);
		const windowStartMs = windowFirstSample * sampleIntervalMs;
		const windowStartSeconds = windowStartMs / 1000;
		const windowDurationSeconds = Math.min(windowSampleCount * intervalSeconds, input.durationSeconds - windowStartSeconds);
		if (windowDurationSeconds <= 0) break;
		const directory = await mkdtemp(join(tmpdir(), 'atlas-skim-window-'));
		const framesDirectory = join(directory, 'frames');
		await mkdir(framesDirectory, { recursive: true });
		try {
			const pattern = join(framesDirectory, 'frame-%05d.jpg');
			const stderr = await runFfmpegV1([
				'-hide_banner', '-loglevel', 'info',
				'-ss', String(windowStartSeconds), '-i', input.videoPath,
				'-t', String(windowDurationSeconds), '-an',
				'-vf', `fps=${frameRate},scale=${VIDEO_SKIM_PREVIEW_FRAME_WIDTH_V1}:${VIDEO_SKIM_PREVIEW_FRAME_HEIGHT_V1}:force_original_aspect_ratio=decrease,pad=${VIDEO_SKIM_PREVIEW_FRAME_WIDTH_V1}:${VIDEO_SKIM_PREVIEW_FRAME_HEIGHT_V1}:(ow-iw)/2:(oh-ih)/2,showinfo`,
				'-frames:v', String(windowSampleCount), '-q:v', '4', pattern,
			], 10 * 60 * 1000);
			const localTimes = parseFfmpegPresentationTimestampsV1(stderr);
			const files = (await readdir(framesDirectory)).filter((file) => /^frame-\d+\.jpg$/.test(file)).sort();
			if (files.length === 0 || files.length !== localTimes.length || files.length > windowSampleCount) {
				throw new Error('VIDEO_SKIM_FRAME_TIMESTAMP_COUNT_MISMATCH');
			}
			const absoluteTimes = localTimes.map((time) => windowStartMs + Math.round(time * 1000));
			for (let index = 1; index < absoluteTimes.length; index += 1) {
				if (absoluteTimes[index] <= absoluteTimes[index - 1]) throw new Error('VIDEO_SKIM_TIMESTAMPS_NOT_MONOTONIC');
			}
			const previousTimestamp = sampleTimestampsMs.at(-1);
			if (previousTimestamp !== undefined && absoluteTimes[0] <= previousTimestamp) {
				throw new Error('VIDEO_SKIM_WINDOW_TIMESTAMPS_NOT_MONOTONIC');
			}
			if (absoluteTimes.some((timestamp) => timestamp < 0 || timestamp >= durationMs)) {
				throw new Error('VIDEO_SKIM_TIMESTAMP_OUTSIDE_SOURCE_DURATION');
			}
			const tileRows = Math.ceil(files.length / VIDEO_SKIM_PREVIEW_TILE_FRAMES_V1);
			for (let tileRow = 0; tileRow < tileRows; tileRow += 1) {
				const firstLocalIndex = tileRow * VIDEO_SKIM_PREVIEW_TILE_FRAMES_V1;
				const tileFiles = files.slice(firstLocalIndex, firstLocalIndex + VIDEO_SKIM_PREVIEW_TILE_FRAMES_V1);
				const composites = await Promise.all(tileFiles.map(async (file, localIndex) => ({
					input: await readFile(join(framesDirectory, file)),
					left: (localIndex % VIDEO_SKIM_PREVIEW_TILE_COLUMNS_V1) * VIDEO_SKIM_PREVIEW_FRAME_WIDTH_V1,
					top: Math.floor(localIndex / VIDEO_SKIM_PREVIEW_TILE_COLUMNS_V1) * VIDEO_SKIM_PREVIEW_FRAME_HEIGHT_V1,
				})));
				const bytes = await sharp({
					create: {
						width: VIDEO_SKIM_PREVIEW_TILE_WIDTH_V1,
						height: VIDEO_SKIM_PREVIEW_TILE_HEIGHT_V1,
						channels: 3,
						background: { r: 16, g: 20, b: 26 },
					},
				}).composite(composites).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
				if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('VIDEO_SKIM_TILE_SIZE_OUT_OF_BOUNDS');
				const firstSampleIndex = windowFirstSample + firstLocalIndex;
				const times = absoluteTimes.slice(firstLocalIndex, firstLocalIndex + tileFiles.length);
				await input.onTile({ index: tileCount, bytes, sampleTimestampsMs: times, firstSampleIndex });
				sampleTimestampsMs.push(...times);
				tileCount += 1;
			}
		} finally {
			await rm(directory, { recursive: true, force: true }).catch(() => {});
		}
	}

	if (sampleTimestampsMs.length === 0 || sampleTimestampsMs.length > VIDEO_SKIM_PREVIEW_MAX_SAMPLES_V1) {
		throw new Error('VIDEO_SKIM_SAMPLE_COUNT_INVALID');
	}
	return { sampleIntervalMs, sampleTimestampsMs, tileCount };
}

export function createVideoSkimPreviewTileV1(input: {
	index: number;
	bytes: Buffer;
	firstSampleIndex: number;
	sampleCount: number;
	objectKey: string;
}): VideoSkimPreviewTileV1 {
	return {
		index: input.index,
		objectKey: input.objectKey,
		sha256: sha256(input.bytes),
		byteLength: input.bytes.byteLength,
		firstSampleIndex: input.firstSampleIndex,
		sampleCount: input.sampleCount,
	};
}
