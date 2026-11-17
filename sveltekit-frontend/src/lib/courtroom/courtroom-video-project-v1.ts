export const COURTROOM_VIDEO_PROJECT_SCHEMA = 'atlas.courtroom-reconstruction.v1' as const;
export const COURTROOM_VIDEO_FPS = 30 as const;
export const COURTROOM_VIDEO_FRAME_COUNT = 240 as const;
export const COURTROOM_VIDEO_WIDTH = 1280 as const;
export const COURTROOM_VIDEO_HEIGHT = 720 as const;
export const COURTROOM_VIDEO_FRAME_RATE = { numerator: 30, denominator: 1 } as const;
export const COURTROOM_FIXTURE_CASE_ID = 'fixture:synthetic-courtroom-v1' as const;
export const COURTROOM_FIXTURE_SOURCE_REVISION =
	'sha256:84eaa388dc2e33dd8bd9666cf33ef062246f03bbcba2562c0095a1904992f919' as const;
const COURTROOM_FIXTURE_SHA256 = COURTROOM_FIXTURE_SOURCE_REVISION.slice('sha256:'.length);

export type CourtroomEvidenceStatusV1 = 'DOCUMENTED' | 'DISPUTED' | 'HYPOTHETICAL' | 'UNKNOWN';
export type CourtroomStoryBeatV1 = 'WHO' | 'WHAT' | 'WHY' | 'HOW';

export interface CourtroomSourceRefV1 {
	readonly sourceId: string;
	readonly sourceRevision: string;
	readonly sha256: string;
	readonly locator: string;
	readonly fixtureOnly: boolean;
}

export type CourtroomObservationLocatorV1 =
	| { readonly kind: 'document_span'; readonly pageNumber: number; readonly utf16Start: number; readonly utf16End: number }
	| { readonly kind: 'image_region'; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
	| { readonly kind: 'video_time'; readonly startPts: number; readonly endPts: number; readonly timebaseNumerator: number; readonly timebaseDenominator: number }
	| { readonly kind: 'audio_time'; readonly startMs: number; readonly endMs: number }
	| { readonly kind: 'synthetic_fixture'; readonly fixturePath: string };

export interface CourtroomObservationRefV1 {
	readonly observationId: string;
	readonly sourceId: string;
	readonly sourceRevision: string;
	readonly sha256: string;
	readonly locator: CourtroomObservationLocatorV1;
	readonly fixtureOnly: boolean;
}

export interface CourtroomVideoSegmentV1 {
	readonly beat: CourtroomStoryBeatV1;
	readonly startFrame: number;
	readonly endFrameExclusive: number;
	readonly heading: string;
	readonly narration: string;
	readonly status: CourtroomEvidenceStatusV1;
	readonly sourceRefs: readonly CourtroomSourceRefV1[];
	readonly observations: readonly CourtroomObservationRefV1[];
	readonly camera: 'wide' | 'witness' | 'judge' | 'defense';
}

export interface CourtroomRenderInputsV1 {
	readonly rendererRevision: string;
	readonly sceneRevision: string;
	readonly actorRigRevision: string;
	readonly cameraRevision: string;
	readonly shaderPaletteRevision: string;
	readonly fontRevision: string;
	readonly disclosureTemplateRevision: string;
}

export interface CourtroomVideoProjectV1 {
	readonly schema: typeof COURTROOM_VIDEO_PROJECT_SCHEMA;
	readonly projectId: string;
	readonly projectRevision: number;
	readonly caseId: string;
	readonly sourceRevision: string;
	readonly title: string;
	readonly fps: typeof COURTROOM_VIDEO_FPS;
	readonly frameRate: typeof COURTROOM_VIDEO_FRAME_RATE;
	readonly frameCount: typeof COURTROOM_VIDEO_FRAME_COUNT;
	readonly width: typeof COURTROOM_VIDEO_WIDTH;
	readonly height: typeof COURTROOM_VIDEO_HEIGHT;
	readonly disclosure: 'SYNTHETIC RECONSTRUCTION — HYPOTHESIS — NOT ORIGINAL EVIDENCE';
	readonly renderInputs: CourtroomRenderInputsV1;
	readonly segments: readonly CourtroomVideoSegmentV1[];
}

export interface SealedCourtroomReconstructionV1 extends CourtroomVideoProjectV1 {
	readonly storyboardChecksum: `sha256:${string}`;
}

const SEGMENT_BEATS: readonly CourtroomStoryBeatV1[] = ['WHO', 'WHAT', 'WHY', 'HOW'];

export function createSyntheticCourtroomProjectV1(): CourtroomVideoProjectV1 {
	const labels: readonly [string, string, string, string][] = [
		['WHO — Participants are not identified', 'No person identity is established by this synthetic fixture.', 'UNKNOWN', 'wide'],
		['WHAT — Event details require source review', 'This scene is a procedural illustration, not a depiction of an observed event.', 'HYPOTHETICAL', 'witness'],
		['WHY — Motive undetermined', 'The available fixture contains no evidence that establishes motive.', 'UNKNOWN', 'judge'],
		['HOW — Reconstructed sequence', 'Camera movement and blocking are illustrative hypotheses only.', 'HYPOTHETICAL', 'defense'],
	];
	const segments = labels.map(([heading, narration, status, camera], index) => ({
		beat: SEGMENT_BEATS[index],
		startFrame: index * 60,
		endFrameExclusive: (index + 1) * 60,
		heading,
		narration,
		status: status as CourtroomEvidenceStatusV1,
		observations: [],
		sourceRefs: [{
			sourceId: `fixture:courtroom:${SEGMENT_BEATS[index].toLowerCase()}`,
			sourceRevision: COURTROOM_FIXTURE_SOURCE_REVISION,
			sha256: COURTROOM_FIXTURE_SHA256,
			locator: `fixture://courtroom-v1/segments/${SEGMENT_BEATS[index].toLowerCase()}`,
			fixtureOnly: true,
		}],
		camera: camera as CourtroomVideoSegmentV1['camera'],
	}));
	return {
		schema: COURTROOM_VIDEO_PROJECT_SCHEMA,
		projectId: 'fixture:synthetic-courtroom-reconstruction-v1',
		projectRevision: 1,
		caseId: COURTROOM_FIXTURE_CASE_ID,
		sourceRevision: COURTROOM_FIXTURE_SOURCE_REVISION,
		title: 'Synthetic Courtroom Reconstruction',
		fps: COURTROOM_VIDEO_FPS,
		frameRate: COURTROOM_VIDEO_FRAME_RATE,
		frameCount: COURTROOM_VIDEO_FRAME_COUNT,
		width: COURTROOM_VIDEO_WIDTH,
		height: COURTROOM_VIDEO_HEIGHT,
		disclosure: 'SYNTHETIC RECONSTRUCTION — HYPOTHESIS — NOT ORIGINAL EVIDENCE',
		renderInputs: {
			rendererRevision: 'fixture:procedural-courtroom-renderer:v1',
			sceneRevision: 'fixture:neutral-courtroom-scene:v1',
			actorRigRevision: 'fixture:neutral-actors:v1',
			cameraRevision: 'fixture:four-camera-presets:v1',
			shaderPaletteRevision: 'fixture:synthetic-sdr-palette:v1',
			fontRevision: 'browser:system-sans:unversioned',
			disclosureTemplateRevision: 'fixture:disclosure-overlay:v1',
		},
		segments,
	};
}

export function validateCourtroomVideoProjectV1(project: CourtroomVideoProjectV1): string[] {
	const errors: string[] = [];
	if (project.schema !== COURTROOM_VIDEO_PROJECT_SCHEMA) errors.push('SCHEMA_MISMATCH');
	if (!project.projectId.trim()) errors.push('PROJECT_ID_REQUIRED');
	if (!Number.isSafeInteger(project.projectRevision) || project.projectRevision < 1) errors.push('PROJECT_REVISION_INVALID');
	if (project.caseId !== COURTROOM_FIXTURE_CASE_ID) errors.push('CASE_ID_NOT_FIXTURE_SCOPED');
	if (project.sourceRevision !== COURTROOM_FIXTURE_SOURCE_REVISION) errors.push('PROJECT_SOURCE_REVISION_INVALID');
	if (
		project.fps !== 30 || project.frameRate?.numerator !== 30 || project.frameRate?.denominator !== 1 ||
		project.frameCount !== 240 || project.width !== 1280 || project.height !== 720
	) {
		errors.push('OUTPUT_PROFILE_MISMATCH');
	}
	if (project.disclosure !== 'SYNTHETIC RECONSTRUCTION — HYPOTHESIS — NOT ORIGINAL EVIDENCE') {
		errors.push('DISCLOSURE_REQUIRED');
	}
	for (const [key, revision] of Object.entries(project.renderInputs ?? {})) {
		if (typeof revision !== 'string' || !revision.trim()) errors.push(`RENDER_INPUT_REVISION_REQUIRED_${key}`);
	}
	if (project.segments.length !== 4) errors.push('FOUR_BEATS_REQUIRED');
	let expectedStart = 0;
	for (const [index, segment] of project.segments.entries()) {
		if (segment.beat !== SEGMENT_BEATS[index]) errors.push(`BEAT_ORDER_INVALID_${index}`);
		if (segment.startFrame !== expectedStart || segment.endFrameExclusive - segment.startFrame !== 60) {
			errors.push(`FRAME_RANGE_INVALID_${index}`);
		}
		if (!segment.heading.trim() || segment.heading.length > 160) errors.push(`HEADING_INVALID_${index}`);
		if (!segment.narration.trim() || segment.narration.length > 500) errors.push(`NARRATION_INVALID_${index}`);
		if (
			segment.beat === 'WHY' &&
			segment.status === 'DOCUMENTED' &&
			(!segment.observations.some((observation) => !observation.fixtureOnly) ||
				!segment.observations.some((observation) => segment.sourceRefs.some((source) =>
					source.sourceId === observation.sourceId && source.sourceRevision === observation.sourceRevision &&
					source.sha256 === observation.sha256 && !source.fixtureOnly)))
		) {
			errors.push('UNSOURCED_MOTIVE_CANNOT_BE_DOCUMENTED');
		}
		if (
			(segment.status === 'DOCUMENTED' || segment.status === 'DISPUTED') &&
			!segment.observations.some((observation) => !observation.fixtureOnly)
		) {
			errors.push(`FACTUAL_CLAIM_WITHOUT_OBSERVATION_${index}`);
		}
		if (!segment.sourceRefs.length) errors.push(`SOURCE_REFERENCE_REQUIRED_${index}`);
		for (const source of segment.sourceRefs) {
			if (!source.sourceId || !source.sourceRevision || !source.locator || !/^([a-f0-9]{64})$/i.test(source.sha256)) {
				errors.push(`SOURCE_REFERENCE_INVALID_${index}`);
			}
			if (source.fixtureOnly !== true) errors.push(`NON_FIXTURE_SOURCE_NOT_ADMITTED_${index}`);
			if (source.sourceRevision !== project.sourceRevision || source.sha256 !== COURTROOM_FIXTURE_SHA256) {
				errors.push(`SOURCE_REVISION_MISMATCH_${index}`);
			}
		}
		for (const observation of segment.observations) {
			if (!observation.observationId.trim() || !observation.sourceId.trim() || !observation.sourceRevision.trim() ||
				!/^([a-f0-9]{64})$/i.test(observation.sha256) || !observation.locator) {
				errors.push(`OBSERVATION_REFERENCE_INVALID_${index}`);
				continue;
			}
			if (!segment.sourceRefs.some((source) => source.sourceId === observation.sourceId &&
				source.sourceRevision === observation.sourceRevision && source.sha256 === observation.sha256 &&
				source.fixtureOnly === observation.fixtureOnly)) {
				errors.push(`OBSERVATION_SOURCE_BINDING_MISMATCH_${index}`);
			}
			if (!isValidObservationLocator(observation.locator)) errors.push(`OBSERVATION_LOCATOR_INVALID_${index}`);
		}
		expectedStart = segment.endFrameExclusive;
	}
	if (expectedStart !== 240) errors.push('FRAME_COVERAGE_INVALID');
	return errors;
}

function isValidObservationLocator(locator: CourtroomObservationLocatorV1): boolean {
	switch (locator.kind) {
		case 'document_span':
			return Number.isSafeInteger(locator.pageNumber) && locator.pageNumber >= 1 &&
				Number.isSafeInteger(locator.utf16Start) && Number.isSafeInteger(locator.utf16End) &&
				locator.utf16Start >= 0 && locator.utf16End > locator.utf16Start;
		case 'image_region':
			return [locator.x, locator.y, locator.width, locator.height].every(Number.isFinite) &&
				locator.x >= 0 && locator.y >= 0 && locator.width > 0 && locator.height > 0 &&
				locator.x + locator.width <= 1 && locator.y + locator.height <= 1;
		case 'video_time':
			return Number.isSafeInteger(locator.startPts) && Number.isSafeInteger(locator.endPts) &&
				locator.startPts >= 0 && locator.endPts > locator.startPts &&
				Number.isSafeInteger(locator.timebaseNumerator) && locator.timebaseNumerator > 0 &&
				Number.isSafeInteger(locator.timebaseDenominator) && locator.timebaseDenominator > 0;
		case 'audio_time':
			return Number.isSafeInteger(locator.startMs) && Number.isSafeInteger(locator.endMs) &&
				locator.startMs >= 0 && locator.endMs > locator.startMs;
		case 'synthetic_fixture':
			return locator.fixturePath.startsWith('fixture://');
	}
	return false;
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
		return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
	if (!globalThis.crypto?.subtle) throw new Error('WEB_CRYPTO_UNAVAILABLE');
	const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sealCourtroomReconstructionV1(
	project: CourtroomVideoProjectV1,
): Promise<SealedCourtroomReconstructionV1> {
	const errors = validateCourtroomVideoProjectV1(project);
	if (errors.length) throw new Error(`COURTROOM_PROJECT_INVALID:${errors.join(',')}`);
	const storyboardChecksum = `sha256:${await sha256Hex(canonicalJson(project))}` as const;
	return { ...project, storyboardChecksum };
}

export async function verifyCourtroomReconstructionChecksumV1(
	manifest: SealedCourtroomReconstructionV1,
): Promise<boolean> {
	const { storyboardChecksum, ...project } = manifest;
	return storyboardChecksum === `sha256:${await sha256Hex(canonicalJson(project))}`;
}

/** Convert a frame boundary to integer ticks without introducing floating-point drift.
 * `frame` may equal frameCount to represent the exclusive end boundary.
 */
export function frameBoundaryToTicksV1(
	frame: number,
	ticksPerSecond: bigint,
	frameRate: { readonly numerator: number; readonly denominator: number } = COURTROOM_VIDEO_FRAME_RATE,
): bigint {
	if (!Number.isSafeInteger(frame) || frame < 0 || frame > COURTROOM_VIDEO_FRAME_COUNT) {
		throw new RangeError(`FRAME_BOUNDARY_OUT_OF_RANGE:${frame}`);
	}
	if (
		!Number.isSafeInteger(frameRate.numerator) || frameRate.numerator <= 0 ||
		!Number.isSafeInteger(frameRate.denominator) || frameRate.denominator <= 0 ||
		ticksPerSecond <= 0n
	) {
		throw new RangeError('INVALID_FRAME_TIMEBASE');
	}
	const numerator = BigInt(frame) * ticksPerSecond * BigInt(frameRate.denominator);
	const denominator = BigInt(frameRate.numerator);
	if (numerator % denominator !== 0n) throw new RangeError('FRAME_TIME_NOT_INTEGRAL_TICKS');
	return numerator / denominator;
}
