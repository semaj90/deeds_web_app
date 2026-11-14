import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * FilmCraft / OTIO-compatible tick resolution: 254,016,000,000 ticks per second.
 * Divisible by 24, 25, 30, 48, 50, 60, 120, 24000/1001, 30000/1001, and microseconds (1e6).
 */
export const FILMCRAFT_TICKS_PER_SECOND = 254_016_000_000n;
const FILMCRAFT_TICKS_PER_MICROSECOND = 254_016n;

export const STORYBOARD_MANIFEST_SCHEMA_V1 = 'atlas.storyboard-manifest.v1' as const;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;
const DHASH64_HEX_RE = /^(?:0x)?[a-f0-9]{16}$/i;

export interface RendererAndDisclosureProvenanceV1 {
	rendererId: 'browser-preview-realtime-v1' | 'filmcraft-deterministic-h264-v1' | (string & {});
	rendererRevision: string;
	deterministicFrameGuarantee: boolean;
	syntheticDisclosureTag?: string;
	disclosureStatement?: string;
}

export interface VerifiedSourceObservationLocatorV1 {
	evidenceId: string;
	sourceSha256: string;
	startTick: bigint;
	endTick: bigint;
	dhash64: string;
	dhashAlgorithm?: 'dhash_gray_9x8';
	seaweedObjectKey?: string;
	frameIndex?: number;
}

export interface FactualObservationSegmentV1 {
	segmentId: string;
	claimKind: 'factual_observation';
	label: string;
	sourceLocator: VerifiedSourceObservationLocatorV1;
}

export interface SyntheticSegmentDisclosureV1 {
	isSynthetic: true;
	disclosureBadge: string;
	rendererRevision: string;
	rationale: string;
}

export interface SyntheticPlaceholderSegmentV1 {
	segmentId: string;
	claimKind: 'synthetic_placeholder' | 'synthetic_reconstruction';
	label: string;
	durationTicks: bigint;
	disclosure: SyntheticSegmentDisclosureV1;
}

export type StoryboardSegmentClaimV1 = FactualObservationSegmentV1 | SyntheticPlaceholderSegmentV1;

export interface StoryboardExportManifestV1 {
	schemaVersion: typeof STORYBOARD_MANIFEST_SCHEMA_V1;
	manifestId: string;
	caseId: string;
	renderer: RendererAndDisclosureProvenanceV1;
	segments: readonly StoryboardSegmentClaimV1[];
}

function assertNonEmptyString(value: unknown, fieldPath: string): asserts value is string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`Invalid storyboard manifest: ${fieldPath} must be a non-empty string`);
	}
}

function validateFactualObservationSegment(segment: FactualObservationSegmentV1, index: number): void {
	const prefix = `segments[${index}] (${segment.segmentId || 'unnamed'})`;
	const locator = segment.sourceLocator as Partial<VerifiedSourceObservationLocatorV1> | undefined;
	if (!locator || typeof locator !== 'object') {
		throw new Error(
			`Invalid storyboard manifest: ${prefix} is factual_observation and requires sourceLocator`
		);
	}

	assertNonEmptyString(locator.evidenceId, `${prefix}.sourceLocator.evidenceId`);

	if (typeof locator.sourceSha256 !== 'string' || !SHA256_HEX_RE.test(locator.sourceSha256)) {
		throw new Error(
			`Invalid storyboard manifest: ${prefix}.sourceLocator.sourceSha256 must be a 64-char hex SHA-256 digest`
		);
	}

	if (typeof locator.dhash64 !== 'string' || !DHASH64_HEX_RE.test(locator.dhash64)) {
		throw new Error(
			`Invalid storyboard manifest: ${prefix}.sourceLocator.dhash64 must be a 64-bit hex dHash fingerprint`
		);
	}

	if (locator.dhashAlgorithm !== undefined && locator.dhashAlgorithm !== 'dhash_gray_9x8') {
		throw new Error(
			`Invalid storyboard manifest: ${prefix}.sourceLocator.dhashAlgorithm must be 'dhash_gray_9x8'`
		);
	}

	if (typeof locator.startTick !== 'bigint' || typeof locator.endTick !== 'bigint') {
		throw new Error(
			`Invalid storyboard manifest: ${prefix}.sourceLocator startTick/endTick must be bigint FilmCraft ticks`
		);
	}

	if (locator.startTick < 0n || locator.endTick <= locator.startTick) {
		throw new Error(
			`Invalid storyboard manifest: ${prefix}.sourceLocator tick range must satisfy 0n <= startTick < endTick`
		);
	}

	if (
		locator.frameIndex !== undefined &&
		(!Number.isInteger(locator.frameIndex) || locator.frameIndex < 0)
	) {
		throw new Error(
			`Invalid storyboard manifest: ${prefix}.sourceLocator.frameIndex must be a non-negative integer`
		);
	}
}

function validateSyntheticSegment(segment: SyntheticPlaceholderSegmentV1, index: number): void {
	const prefix = `segments[${index}] (${segment.segmentId || 'unnamed'})`;

	if (typeof segment.durationTicks !== 'bigint' || segment.durationTicks <= 0n) {
		throw new Error(
			`Invalid storyboard manifest: ${prefix}.durationTicks must be a positive bigint`
		);
	}

	const disclosure = segment.disclosure as Partial<SyntheticSegmentDisclosureV1> | undefined;
	if (!disclosure || typeof disclosure !== 'object') {
		throw new Error(
			`Invalid storyboard manifest: ${prefix} is ${segment.claimKind} and requires disclosure metadata`
		);
	}

	if (disclosure.isSynthetic !== true) {
		throw new Error(
			`Invalid storyboard manifest: ${prefix}.disclosure.isSynthetic must strictly equal true`
		);
	}

	assertNonEmptyString(disclosure.disclosureBadge, `${prefix}.disclosure.disclosureBadge`);
	assertNonEmptyString(disclosure.rendererRevision, `${prefix}.disclosure.rendererRevision`);
	assertNonEmptyString(disclosure.rationale, `${prefix}.disclosure.rationale`);
}

/**
 * Validates that factual storyboard claims bind to verified SHA-256 + dHash + FilmCraft tick bounds,
 * synthetic placeholders carry explicit non-factual disclosures, and real-time browser previews
 * never claim deterministic export frame guarantees.
 */
export function validateStoryboardManifestOrThrow(manifest: StoryboardExportManifestV1): void {
	if (!manifest || typeof manifest !== 'object') {
		throw new Error('Invalid storyboard manifest: manifest payload must be an object');
	}

	if (manifest.schemaVersion !== STORYBOARD_MANIFEST_SCHEMA_V1) {
		throw new Error(
			`Invalid storyboard manifest: schemaVersion must be '${STORYBOARD_MANIFEST_SCHEMA_V1}'`
		);
	}

	assertNonEmptyString(manifest.manifestId, 'manifestId');
	assertNonEmptyString(manifest.caseId, 'caseId');

	if (!manifest.renderer || typeof manifest.renderer !== 'object') {
		throw new Error('Invalid storyboard manifest: renderer provenance is required');
	}

	assertNonEmptyString(manifest.renderer.rendererId, 'renderer.rendererId');
	assertNonEmptyString(manifest.renderer.rendererRevision, 'renderer.rendererRevision');

	if (typeof manifest.renderer.deterministicFrameGuarantee !== 'boolean') {
		throw new Error(
			'Invalid storyboard manifest: renderer.deterministicFrameGuarantee must be a boolean'
		);
	}

	if (
		manifest.renderer.rendererId === 'browser-preview-realtime-v1' &&
		manifest.renderer.deterministicFrameGuarantee
	) {
		throw new Error(
			'Invalid storyboard manifest: browser-preview-realtime-v1 cannot claim deterministicFrameGuarantee: true'
		);
	}

	if (manifest.renderer.syntheticDisclosureTag !== undefined) {
		assertNonEmptyString(
			manifest.renderer.syntheticDisclosureTag,
			'renderer.syntheticDisclosureTag'
		);
	}

	if (manifest.renderer.disclosureStatement !== undefined) {
		assertNonEmptyString(manifest.renderer.disclosureStatement, 'renderer.disclosureStatement');
	}

	if (!Array.isArray(manifest.segments) || manifest.segments.length === 0) {
		throw new Error('Invalid storyboard manifest: segments must be a non-empty array');
	}

	for (let i = 0; i < manifest.segments.length; i += 1) {
		const segment = manifest.segments[i];
		if (!segment || typeof segment !== 'object') {
			throw new Error(`Invalid storyboard manifest: segments[${i}] must be an object`);
		}

		assertNonEmptyString(segment.segmentId, `segments[${i}].segmentId`);
		assertNonEmptyString(segment.label, `segments[${i}].label`);

		if (segment.claimKind === 'factual_observation') {
			validateFactualObservationSegment(segment, i);
		} else if (
			segment.claimKind === 'synthetic_placeholder' ||
			segment.claimKind === 'synthetic_reconstruction'
		) {
			validateSyntheticSegment(segment, i);
		} else {
			throw new Error(
				`Invalid storyboard manifest: segments[${i}].claimKind '${String(
					(segment as { claimKind?: unknown }).claimKind
				)}' is unsupported`
			);
		}
	}
}

export interface FfprobeStreamInfoV1 {
	index: number;
	codecType: string;
	codecName: string | null;
	width: number | null;
	height: number | null;
	frameRate: string | null;
	timeBase: string | null;
	startTimeSeconds: number | null;
	durationSeconds: number | null;
}

export interface VideoAndAudioProbeResultV1 {
	hasVideoStream: boolean;
	hasAudioStream: boolean;
	videoCodec: string | null;
	width: number | null;
	height: number | null;
	videoStartTimeSeconds: number | null;
	audioStartTimeSeconds: number | null;
	durationSeconds: number;
	durationFilmcraftTicks: bigint;
	streams: readonly FfprobeStreamInfoV1[];
}

function parseFiniteNonNegativeNumber(value: unknown): number | null {
	if (typeof value === 'number') {
		return Number.isFinite(value) && value >= 0 ? value : null;
	}
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
	}
	return null;
}

export function secondsToFilmcraftTicksV1(durationSeconds: number): bigint {
	if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
		return 0n;
	}
	const micros = BigInt(Math.round(durationSeconds * 1_000_000));
	return micros * FILMCRAFT_TICKS_PER_MICROSECOND;
}

/**
 * Parses JSON output from `ffprobe -show_entries stream=...:format=duration -of json`.
 * Distinguishes silent CCTV video-only containers (`hasAudioStream: false`) from A/V media
 * without throwing when no audio track exists.
 */
export function parseFfprobeStreamsJsonV1(rawJson: string): VideoAndAudioProbeResultV1 {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawJson);
	} catch (error) {
		throw new Error(
			`Failed to parse ffprobe JSON output: ${error instanceof Error ? error.message : String(error)}`
		);
	}

	if (!parsed || typeof parsed !== 'object') {
		throw new Error('Invalid ffprobe JSON payload: expected an object');
	}

	const record = parsed as { streams?: unknown; format?: { duration?: unknown } };
	const rawStreams = Array.isArray(record.streams) ? record.streams : [];

	const streams: FfprobeStreamInfoV1[] = rawStreams.map((entry, idx) => {
		const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
		const startTime = typeof item.start_time === 'number' ? item.start_time
			: typeof item.start_time === 'string' && item.start_time.trim() ? Number(item.start_time) : null;
		return {
			index: typeof item.index === 'number' && Number.isInteger(item.index) ? item.index : idx,
			codecType: typeof item.codec_type === 'string' ? item.codec_type : 'unknown',
			codecName: typeof item.codec_name === 'string' && item.codec_name.length > 0 ? item.codec_name : null,
			width: typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : null,
			height: typeof item.height === 'number' && Number.isFinite(item.height) ? item.height : null,
			frameRate:
				typeof item.r_frame_rate === 'string' && item.r_frame_rate.length > 0
					? item.r_frame_rate
					: null,
			timeBase: typeof item.time_base === 'string' && item.time_base.length > 0 ? item.time_base : null,
			startTimeSeconds: startTime !== null && Number.isFinite(startTime) ? startTime : null,
			durationSeconds: parseFiniteNonNegativeNumber(item.duration)
		};
	});

	const videoStream = streams.find((stream) => stream.codecType === 'video') ?? null;
	const audioStream = streams.find((stream) => stream.codecType === 'audio') ?? null;
	const hasAudioStream = audioStream !== null;

	const formatDuration = parseFiniteNonNegativeNumber(record.format?.duration);
	const maxStreamDuration = streams.reduce<number>(
		(max, stream) => (stream.durationSeconds !== null && stream.durationSeconds > max ? stream.durationSeconds : max),
		0
	);
	const durationSeconds = formatDuration ?? videoStream?.durationSeconds ?? maxStreamDuration;

	return {
		hasVideoStream: videoStream !== null,
		hasAudioStream,
		videoCodec: videoStream?.codecName ?? null,
		width: videoStream?.width ?? null,
		height: videoStream?.height ?? null,
		videoStartTimeSeconds: videoStream?.startTimeSeconds ?? null,
		audioStartTimeSeconds: audioStream?.startTimeSeconds ?? null,
		durationSeconds,
		durationFilmcraftTicks: secondsToFilmcraftTicksV1(durationSeconds),
		streams
	};
}

export function resolveDefaultFfprobePathV1(): string {
	const explicitProbe = process.env.FFPROBE_PATH?.trim();
	if (explicitProbe) {
		return explicitProbe;
	}
	const ffmpegPath = process.env.FFMPEG_PATH?.trim();
	if (ffmpegPath) {
		const parsed = path.parse(ffmpegPath);
		if (/^ffmpeg$/i.test(parsed.name)) {
			const siblingName = parsed.name.replace(/ffmpeg/i, 'ffprobe') + parsed.ext;
			return path.join(parsed.dir, siblingName);
		}
	}
	return 'ffprobe';
}

/**
 * Runs `ffprobe` with an explicit timeout (`shell: false`) so silent CCTV uploads do not crash
 * audio extraction and stalled demuxers cannot hang the worker or request handler.
 */
export function detectVideoAndAudioStreamsV1(
	videoPath: string,
	options?: { ffprobePath?: string; timeoutMs?: number }
): Promise<VideoAndAudioProbeResultV1> {
	const ffprobeBin = options?.ffprobePath?.trim() || resolveDefaultFfprobePathV1();
	const timeoutMs = Math.max(100, options?.timeoutMs ?? 15_000);
	const args = [
		'-v',
		'error',
		'-show_entries',
		'stream=index,codec_type,codec_name,width,height,r_frame_rate,time_base,start_time,duration:format=duration',
		'-of',
		'json',
		videoPath
	];

	return new Promise((resolve, reject) => {
		const child = spawn(ffprobeBin, args, { shell: false, windowsHide: true });
		let stdout = '';
		let stderr = '';
		let settled = false;
		const maxBytes = 1024 * 1024;

		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill('SIGKILL');
			reject(new Error(`ffprobe timed out after ${timeoutMs}ms for ${videoPath}`));
		}, timeoutMs);

		child.stdout?.on('data', (chunk: Buffer | string) => {
			if (stdout.length < maxBytes) {
				stdout += chunk.toString();
			}
		});

		child.stderr?.on('data', (chunk: Buffer | string) => {
			if (stderr.length < maxBytes) {
				stderr += chunk.toString();
			}
		});

		child.on('error', (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(new Error(`ffprobe spawn failed (${ffprobeBin}): ${error.message}`));
		});

		child.on('close', (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (code !== 0) {
				reject(
					new Error(
						`ffprobe exited with code ${code ?? 'null'}${stderr ? `: ${stderr.trim()}` : ''}`
					)
				);
				return;
			}
			try {
				resolve(parseFfprobeStreamsJsonV1(stdout));
			} catch (error) {
				reject(error);
			}
		});
	});
}
