// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ENV } from '$lib/server/env.server.js';
import { getSeaweedClient, statSeaweedObject, uploadSeaweedFile } from '$lib/server/seaweed-client.js';
import { getFileFromSeaweed } from '$lib/server/storage/seaweed.js';
import { ARTIFACTS_BUCKET, storageBuckets } from '$lib/server/storage/storage-buckets.js';
import {
	buildPackedMotionLodsV1, decodeVideoMotionLutIndicesV1, VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1,
	VIDEO_MOTION_COMPACT_LOD_V1,
} from '$lib/shared/video-motion-lut-v1.js';
import { humanCoco17PoseSchemaV1 } from '$lib/shared/pose-skeleton-schema-v1.js';
import { createPlanarCameraCalibrationV1, type PlanarCalibrationAnchorV1 } from '$lib/splat/planar-camera-calibration-v1.js';
import { deriveReviewedGroundPlaneTrackFromHistoryV1, groundTrackSnapshotPointsV1 } from '$lib/splat/reviewed-ground-plane-track-v1.js';
import { createSceneDocumentV1, createSceneQualityReceiptV1 } from '$lib/splat/scene-document-v1.js';
import { evidenceSceneIdV1, fetchSceneRevisionV1, saveSceneManifestRevisionV1 } from '$lib/splat/scene-persistence-client-v1.js';
import * as schema from '$lib/server/db/schema-postgres.js';
import type { db as AppDatabase } from '$lib/server/db/client.js';
import { createYOLOService } from '$lib/server/yolo.js';
import { embedEvidenceAudioWithEmbeddingGemma2OnnxV1, embedEvidenceImageWithEmbeddingGemma2OnnxV1, embedEvidenceTextWithEmbeddingGemma2OnnxV1 } from '$lib/server/evidence/embeddinggemma2-onnx-image-v1.js';
import { persistEvidenceMultimodalVectorV1 } from '$lib/server/evidence/evidence-multimodal-vector-persistence-v1.js';
import { detectVideoAndAudioStreamsV1 } from '../storyboard-manifest-contract-v1.js';
import { extractAudioTrack } from '../transcript-service.js';
import { VisionService } from '$lib/server/evidence/video/vision-service.js';
import {
	processCanonicalVideoAnalysisV1,
	persistCanonicalVideoAnalysisV1,
	type VideoAnalysisDependenciesV1,
	type VideoFrameProposalV1,
} from '../durable-video-analysis-v1.js';

const enabled = process.env.ATLAS_EVIDENCE_VIDEO_MEDIA_E2E === '1';
const SCRATCH_DATABASE = 'legal_ai_live_integration_scratch';
const FIXTURE_IMAGE = process.env.ATLAS_VIDEO_FIXTURE_IMAGE_PATH || join(tmpdir(), 'atlas-yolo-bus-fixture.jpg');
const FIXTURE_VIDEO = process.env.ATLAS_VIDEO_FIXTURE_VIDEO_PATH?.trim();
const FIXTURE_ASR_URL = process.env.ATLAS_VIDEO_FIXTURE_ASR_URL?.trim();
const VERIFY_SEAWEED = process.env.ATLAS_VIDEO_FIXTURE_VERIFY_SEAWEED === '1';
const VERIFY_SCENE = process.env.ATLAS_VIDEO_FIXTURE_VERIFY_SCENE === '1';
const BROWSER_SOURCE_EVIDENCE = process.env.ATLAS_VIDEO_FIXTURE_BROWSER_SOURCE_EVIDENCE?.trim();
const BROWSER_ORIGIN = 'http://127.0.0.1:5173';
const MAX_FIXTURE_VIDEO_BYTES = 100 * 1024 * 1024;
const clients: Client[] = [];

const routeStore = vi.hoisted(() => ({ scratch: null as typeof AppDatabase | null }));
vi.mock('$lib/server/db/client.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/server/db/client.js')>();
	if (process.env.ATLAS_VIDEO_FIXTURE_VERIFY_SCENE !== '1') return original;
	// Route tests must fail closed outside the verified rollback transaction.
	return {
		...original,
		db: new Proxy({} as typeof AppDatabase, {
			get(_target, key) {
				if (!routeStore.scratch) throw new Error('VIDEO_SCENE_ROUTES_REQUIRE_VERIFIED_SCRATCH_TRANSACTION');
				const value = Reflect.get(routeStore.scratch, key);
				return typeof value === 'function' ? value.bind(routeStore.scratch) : value;
			},
		}),
	};
});

function sha256(bytes: Uint8Array): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function assertLocalFixtureStorage(bucket: string) {
	const s3 = new URL(ENV.SEAWEED_S3_ENDPOINT ?? '');
	const writer = new URL(ENV.SEAWEED_ENDPOINT?.includes('://') ? ENV.SEAWEED_ENDPOINT : `http://${ENV.SEAWEED_ENDPOINT}`);
	const loopback = (url: URL, fallback?: string) =>
		['127.0.0.1', 'localhost'].includes(url.hostname) && (url.port || fallback) === '8333';
	if (!loopback(s3) || !loopback(writer, ENV.SEAWEED_S3_PORT) ||
		bucket !== ARTIFACTS_BUCKET || !await getSeaweedClient().bucketExists(bucket)) {
		throw new Error('VIDEO_MEDIA_FIXTURE_REQUIRES_EXISTING_LOOPBACK_ARTIFACT_BUCKET');
	}
}

async function findBrowserFixtureSource(expectedSha256: string) {
	if (!BROWSER_SOURCE_EVIDENCE || !/^[\da-f-]{36}$/i.test(BROWSER_SOURCE_EVIDENCE)) {
		throw new Error('VIDEO_BROWSER_FIXTURE_REQUIRES_A_STORED_SOURCE_EVIDENCE_ID');
	}
	const response = await fetch(`${BROWSER_ORIGIN}/api/evidence/${BROWSER_SOURCE_EVIDENCE}`, { signal: AbortSignal.timeout(5000) });
	expect(response.status).toBe(200);
	const original = await response.json() as { hash?: string; fileUrl?: string };
	expect(original.hash?.replace(/^sha256:/, '')).toBe(expectedSha256.slice(7));
	const prefix = `seaweed://${storageBuckets.evidence}/`;
	const fileUrl = original.fileUrl?.replace(/^minio:\/\//, 'seaweed://');
	if (!fileUrl?.startsWith(prefix)) throw new Error('VIDEO_BROWSER_FIXTURE_SOURCE_BUCKET_MISMATCH');
	const bytes = await getFileFromSeaweed({
		bucket: storageBuckets.evidence, objectKey: fileUrl.slice(prefix.length), maximumBytes: MAX_FIXTURE_VIDEO_BYTES,
	});
	expect(sha256(bytes)).toBe(expectedSha256);
	return fileUrl;
}

async function saveFixtureSceneFromBrowser(input: {
	caseId: string; evidenceId: string; sceneId: string; actorId: number;
}) {
	const { chromium } = await import('@playwright/test');
	const { lucia } = await import('$lib/server/lucia.js');
	const { caseId, evidenceId, sceneId, actorId } = input;
	const routes = await Promise.all([
		import('../../../../../../routes/api/evidence/[id]/+server.js'),
		import('../../../../../../routes/api/evidence/[id]/frames/+server.js'),
		import('../../../../../../routes/api/evidence/[id]/versions/+server.js'),
		import('../../../../../../routes/api/evidence/[id]/download/+server.js'),
		import('../../../../../../routes/api/evidence/[id]/transcript/+server.js'),
		import('../../../../../../routes/api/evidence/[id]/video-events/+server.js'),
		import('../../../../../../routes/api/evidence/[id]/motion-preview/[frameIndex]/+server.js'),
		import('../../../../../../routes/api/evidence/[id]/video-frame/[frameIndex]/+server.js'),
		import('../../../../../../routes/api/cases/[id]/scenes/[sceneId]/revisions/+server.js'),
	]);
	const [doc, frames, versions, download, transcript, events, motion, frame, scene] = routes;
	const session = await lucia.createSession(String(actorId), {});
	const cookie = lucia.createSessionCookie(session.id);
	const evidencePath = `/api/evidence/${evidenceId}`;
	const scenePath = `/api/cases/${caseId}/scenes/${sceneId}/revisions`;
	const browser = await chromium.launch({
		channel: 'chrome', headless: true, args: ['--disable-webgpu', '--use-gl=angle', '--use-angle=swiftshader'],
	});
	const handled = new Map<string, number[]>();
	const motionTransfers: Array<{ path: string; lod: string | null; bytes: number }> = [];
	const errors: string[] = [];
	try {
		const context = await browser.newContext({ serviceWorkers: 'block' });
		await context.route('**/*', (route) => {
			const request = route.request();
			if (new URL(request.url()).origin === BROWSER_ORIGIN && /^(GET|HEAD|OPTIONS)$/.test(request.method())) {
				return route.continue();
			}
			return route.fulfill({ status: 204 });
		});
		await context.addCookies([evidencePath, scenePath].map((path) => ({
			name: cookie.name, value: cookie.value, domain: '127.0.0.1', path, httpOnly: true, sameSite: 'Lax' as const,
		})));
		const page = await context.newPage();
		page.setDefaultTimeout(20_000);
		page.on('pageerror', (error) => errors.push(error.message));
		await page.route(
			(url) => url.origin === BROWSER_ORIGIN && (url.pathname === scenePath || url.pathname === evidencePath || url.pathname.startsWith(`${evidencePath}/`)),
			async (route) => {
				const incoming = route.request();
				const url = new URL(incoming.url());
				const method = incoming.method();
				const cookieHeader = await incoming.headerValue('cookie');
				const token = lucia.readSessionCookie(cookieHeader ?? '');
				// Only the minted scratch session may reach the transaction-backed handlers.
				if (token !== session.id) return route.fulfill({ status: 401 });
				const { user } = await lucia.validateSession(token);
				if (!user || String(user.id) !== String(actorId)) return route.fulfill({ status: 401 });
				const headers = await incoming.allHeaders();
				delete headers.cookie;
				const request = new Request(url, {
					method, headers, ...(method === 'POST' ? { body: incoming.postData() } : {}),
				});
				const suffix = url.pathname.slice(evidencePath.length);
				const handlers = { '': doc.GET, '/frames': frames.GET, '/versions': versions.GET,
					'/download': download.GET, '/transcript': transcript.GET, '/video-events': events.GET };
				const artifact = /^\/(motion-preview|video-frame)\/(\d+)$/.exec(suffix);
				let response: Response;
				let label: string;
				if (url.pathname === scenePath && (method === 'GET' || method === 'POST')) {
					label = `scene:${method}${url.search}`;
					response = await (method === 'POST' ? scene.POST : scene.GET)({
						locals: { user }, url, request, params: { id: caseId, sceneId },
					} as never);
				} else if (method === 'GET' && artifact) {
					label = artifact[1]!;
					response = await (label === 'motion-preview' ? motion.GET : frame.GET)({
						locals: { user }, url, request, params: { id: evidenceId, frameIndex: artifact[2]! },
					} as never);
				} else if (method === 'GET' && Object.hasOwn(handlers, suffix)) {
					label = suffix || '/evidence';
					response = await handlers[suffix as keyof typeof handlers]({ locals: { user }, params: { id: evidenceId }, url, request } as never);
				} else {
					return route.fulfill({ status: 404 });
				}
				handled.set(label, [...(handled.get(label) ?? []), response.status]);
				const body = Buffer.from(await response.arrayBuffer());
				if (label === 'motion-preview' && response.ok) {
					motionTransfers.push({ path: url.pathname, lod: response.headers.get('X-Motion-LOD'), bytes: body.byteLength });
				}
				await route.fulfill({
					status: response.status, headers: Object.fromEntries(response.headers.entries()),
					body,
				});
			}
		);
		await page.goto(`${BROWSER_ORIGIN}/e2e/video-viewer?caseId=${caseId}&evidenceId=${evidenceId}`);
		const video = page.getByTestId('evidence-video-player');
		await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 20_000 })
			.toBeGreaterThanOrEqual(2);
		const motionCue = page.getByRole('button', { name: /Review pixel-change cue at/ }).nth(1);
		await motionCue.click();
		const preview = page.getByRole('region', { name: 'Video pixel-change review cues' })
			.getByRole('figure', { name: 'Low-resolution frame-to-frame motion cue' });
		await preview.locator('canvas:not(.hidden)').waitFor();
		const samplePath = `${evidencePath}/motion-preview/1`;
		expect(motionTransfers).toContainEqual({ path: samplePath, lod: '32x64', bytes: 1024 });
		expect(motionTransfers.every(({ bytes }) => bytes === 1024)).toBe(true);
		await preview.getByRole('button', { name: 'Full motion detail' }).click();
		await expect.poll(() => motionTransfers).toContainEqual({ path: samplePath, lod: null, bytes: 4112 });
		await preview.locator('canvas:not(.hidden)').waitFor();
		await page.getByRole('button', { name: 'Add manual human pose' }).click();
		await page.getByRole('button', { name: 'Load authorized analyzed frame' }).click();
		await page.locator('.pose-stage-image').waitFor();
		await page.getByTestId('open-video-transcript').click();
		await page.getByRole('button', { name: 'Add reviewed track to scene' }).click();
		await page.getByRole('status').filter({ hasText: /Saved reviewed 2D ground-plane track as scene revision 1/ }).waitFor();
		await page.reload();
		await page.getByTestId('open-video-transcript').click();
		await page.getByRole('button', { name: 'Add reviewed track to scene' }).click();
		await page.getByRole('status').filter({ hasText: 'This reviewed ground-plane track is already on the scene revision.' }).waitFor();
		expect(handled.get('scene:POST')).toEqual([201]);
		expect(handled.get('scene:GET?revision=1')).toEqual([200]);
		expect(handled.get('scene:GET')).toEqual([200, 200]);
		expect(handled.get('motion-preview')).toContain(200);
		expect(handled.get('video-frame')).toContain(200);
		expect(handled.get('/download')?.some((status) => status === 200 || status === 206)).toBe(true);
		expect(errors).toEqual([]);
		return session.id;
	} catch (cause) {
		throw new Error(`VIDEO_BROWSER_FIXTURE_FAILED ${JSON.stringify(Object.fromEntries(handled))} ${JSON.stringify(errors)}`, { cause });
	} finally {
		await browser.close();
	}
}

async function proveStoredMotionScene(input: {
	caseId: string;
	evidenceId: string;
	actorId: number;
	sourceRevision: string;
	analysisRevision: string;
	frames: VideoFrameProposalV1[];
	samples: { sampleIndex: number; timestampMs: number; artifact: { sha256: string } }[];
}) {
	const { caseId, evidenceId, actorId, sourceRevision, analysisRevision } = input;
	const [versions, pose, calibrationReview, scene, frame, motion] = await Promise.all([
		import('../../../../../../routes/api/evidence/[id]/versions/+server.js'),
		import('../../../../../../routes/api/evidence/[id]/pose-review/+server.js'),
		import('../../../../../../routes/api/evidence/[id]/calibration-review/+server.js'),
		import('../../../../../../routes/api/cases/[id]/scenes/[sceneId]/revisions/+server.js'),
		import('../../../../../../routes/api/evidence/[id]/video-frame/[frameIndex]/+server.js'),
		import('../../../../../../routes/api/evidence/[id]/motion-preview/[frameIndex]/+server.js'),
	]);
	const locals = { user: { id: String(actorId) } };
	const request = (body: unknown) => new Request('http://127.0.0.1/scratch', {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
	});
	const checked = async (response: Response, status: number) => {
		expect(response.status, response.ok ? undefined : await response.clone().text()).toBe(status);
		return response;
	};

	const matching = input.frames.flatMap((entry) => {
		const sample = input.samples.find((candidate) => candidate.timestampMs === entry.timestampMs);
		return sample ? [{ entry, sample }] : [];
	});
	expect(matching).toHaveLength(2);
	for (const { entry, sample } of matching) {
		const tile = await checked(await motion.GET({
			locals, params: { id: evidenceId, frameIndex: String(sample.sampleIndex) },
			url: new URL('http://127.0.0.1/scratch?lane=motion-sample'),
		} as Parameters<typeof motion.GET>[0]), 200);
		expect(tile.headers.get('X-Frame-Timestamp-Ms')).toBe(String(entry.timestampMs));
		expect(tile.headers.get('X-Analysis-Revision')).toBe(analysisRevision);
		expect(tile.headers.get('X-Source-Revision')).toBe(sourceRevision);
		const canonical = new Uint8Array(await tile.arrayBuffer());
		expect(sha256(canonical)).toBe(sample.artifact.sha256);
		const compact = await checked(await motion.GET({
			locals, params: { id: evidenceId, frameIndex: String(sample.sampleIndex) },
			url: new URL(`http://127.0.0.1/scratch?lane=motion-sample&lod=${VIDEO_MOTION_COMPACT_LOD_V1.token}`),
		} as Parameters<typeof motion.GET>[0]), 200);
		for (const header of ['X-Frame-Timestamp-Ms', 'X-Analysis-Revision', 'X-Source-Revision']) {
			expect(compact.headers.get(header)).toBe(tile.headers.get(header));
		}
		expect(compact.headers.get('X-Motion-LOD')).toBe(VIDEO_MOTION_COMPACT_LOD_V1.token);
		const compactBytes = new Uint8Array(await compact.arrayBuffer());
		expect(compactBytes).toEqual(buildPackedMotionLodsV1(decodeVideoMotionLutIndicesV1(canonical))[3]?.data);
		expect(compactBytes).toHaveLength(VIDEO_MOTION_COMPACT_LOD_V1.byteLength);
		expect(compact.headers.get('ETag')).toBe(`"sha256-${sha256(compactBytes).slice(7)}"`);
		const jpeg = await checked(await frame.GET({
			locals, params: { id: evidenceId, frameIndex: String(entry.frameIndex) },
		} as Parameters<typeof frame.GET>[0]), 200);
		expect(jpeg.headers.get('X-Frame-Timestamp-Ms')).toBe(String(entry.timestampMs));
		expect(sha256(new Uint8Array(await jpeg.arrayBuffer()))).toBe(entry.artifact.sha256);
	}

	const first = matching[0]!.entry;
	const width = first.width;
	const height = first.height;
	const anchor = (id: string, x: number, y: number): PlanarCalibrationAnchorV1 => ({
		id, imagePx: [x * width, y * height], planeM: [x * 8, y * 4],
	});
	// Synthetic review inputs exercise provenance and math without asserting measured geometry.
	const calibration = createPlanarCameraCalibrationV1({
		evidenceId, sourceRevision, analysisRevision, calibrationFrameIndex: first.frameIndex,
		calibrationFramePtsUs: first.timestampMs * 1000, frameWidth: width, frameHeight: height,
		operatorConfirmedFixedCamera: true, toleranceMeters: 0.001,
		fitAnchors: [anchor('a', 0, 0), anchor('b', 1, 0), anchor('c', 1, 1), anchor('d', 0, 1)],
		validationAnchors: [anchor('v1', .2, .2), anchor('v2', .8, .2), anchor('v3', .8, .8), anchor('v4', .2, .8)],
	});
	const trackId = 'synthetic-fixture-track';
	const trackScopeId = `fixture:${analysisRevision}`;
	const contacts = matching.map(({ entry }, index) => ({
		schema: 'atlas.pose-observation.v1', evidenceId, sourceRevision, sourceSha256: sourceRevision,
		analysisRevision, framePtsUs: entry.timestampMs * 1000, frameIndex: entry.frameIndex,
		frameWidth: entry.width, frameHeight: entry.height, skeletonSchemaId: humanCoco17PoseSchemaV1.schemaId,
		trackId, trackScopeId, origin: 'manual', modelRevision: null, reviewState: 'UNREVIEWED',
		keypoints: humanCoco17PoseSchemaV1.joints.map(({ index }) => ({
			index, x: null, y: null, confidence: 0, visibility: 'not_labeled',
		})),
		groundContact: { imagePx: [(0.3 + 0.1 * index) * width, 0.75 * height], footSide: 'left', label: 'operator-marked-ground-contact-candidate' },
	}));
	const binding = { caseId, parentSha256: sourceRevision };
	const annotationReply = await checked(await versions.POST({
		locals, params: { id: evidenceId }, request: request({
			schema: 'atlas.evidence-annotation-revision-request.v1', ...binding,
			annotation: {
				schema: 'atlas.evidence-annotation.v1', modality: 'video', notes: 'Synthetic integration fixture', annotations: [],
				poseSchemas: [humanCoco17PoseSchemaV1], poseObservations: contacts, planarCameraCalibrations: [calibration],
			},
		}),
	} as Parameters<typeof versions.POST>[0]), 201);
	const { versionId: annotationRevisionId } = await annotationReply.json();
	const decision = 'ACCEPTED_FOR_SCENE_PROPOSAL';
	await checked(await calibrationReview.POST({
		locals, params: { id: evidenceId }, request: request({
			schema: 'atlas.planar-camera-calibration-review-request.v1', ...binding, annotationRevisionId, analysisRevision,
			calibrationSha256: sha256(Buffer.from(JSON.stringify(calibration))),
			calibrationFrameIndex: calibration.calibrationFrameIndex, calibrationFramePtsUs: calibration.calibrationFramePtsUs,
			decision, cameraFixedWindow: { startPtsUs: contacts[0]!.framePtsUs, endPtsUs: contacts[1]!.framePtsUs },
		}),
	} as Parameters<typeof calibrationReview.POST>[0]), 201);
	for (const { frameIndex, framePtsUs, skeletonSchemaId } of contacts) {
		await checked(await pose.POST({
			locals, params: { id: evidenceId }, request: request({
				schema: 'atlas.pose-review-request.v1', ...binding, annotationRevisionId, analysisRevision,
				frameIndex, framePtsUs, skeletonSchemaId, trackId, trackScopeId, decision,
			}),
		} as Parameters<typeof pose.POST>[0]), 201);
	}
	const response = await checked(await versions.GET({
		locals, params: { id: evidenceId }, url: new URL('http://127.0.0.1/scratch?limit=200'),
	} as Parameters<typeof versions.GET>[0]), 200);
	const points = groundTrackSnapshotPointsV1(await deriveReviewedGroundPlaneTrackFromHistoryV1({
		history: await response.json(), caseId, evidenceId, sourceRevision, analysisRevision,
	}));
	expect(points.map(({ framePtsUs }) => framePtsUs)).toEqual(contacts.map(({ framePtsUs }) => framePtsUs));
	const sceneId = await evidenceSceneIdV1(caseId, evidenceId);
	const proposal = {
		proposalId: randomUUID(), evidenceId, sourceRevision, analysisRevision,
		calibrationRevisionId: annotationRevisionId, trackId, trackScopeId, points,
		status: 'REVIEWED_GROUND_PLANE_PROPOSAL' as const,
		semantics: 'image_to_measured_plane_only_no_height_or_camera_motion_compensation' as const,
	};
	const manifest = createSceneDocumentV1({
		schema: 'parent-atlas.scene-document.v1', caseId, sceneId, status: 'HYPOTHESIS',
		revision: 1, parentManifestSha256: null, createdAt: new Date().toISOString(), coordinateFrame: 'LOCAL_UNCALIBRATED',
		evidenceBindings: [{ evidenceId, sourceRevision }], groundPlaneTrackProposals: [proposal],
		objects: [], animations: [], evidenceSources: [], assets: [],
		quality: createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 0 }),
	});
	const sceneScope = { locals, params: { id: caseId, sceneId } };
	const fetcher: typeof fetch = async (resource, init) => {
		const url = new URL(String(resource), 'http://127.0.0.1');
		expect(url.pathname).toBe(`/api/cases/${caseId}/scenes/${sceneId}/revisions`);
		if (init?.method === 'POST') {
			return scene.POST({ ...sceneScope, request: new Request(url, init) } as Parameters<typeof scene.POST>[0]);
		}
		return scene.GET({ ...sceneScope, url } as Parameters<typeof scene.GET>[0]);
	};
	const saved = BROWSER_SOURCE_EVIDENCE
		? null
		: await saveSceneManifestRevisionV1({ caseId, sceneId, expectedRevision: 0, commandId: randomUUID(), manifest, fetcher });
	const browserSessionId = BROWSER_SOURCE_EVIDENCE
		? await saveFixtureSceneFromBrowser({ caseId, evidenceId, sceneId, actorId })
		: null;
	const readback = await fetchSceneRevisionV1({ caseId, sceneId, revision: 1, fetcher });
	expect(readback).not.toBeNull();
	const storedTrack = readback!.manifest.groundPlaneTrackProposals?.[0];
	expect(readback!.manifest.groundPlaneTrackProposals).toEqual([
		browserSessionId ? { ...proposal, proposalId: storedTrack?.proposalId } : proposal,
	]);
	if (saved) expect(readback!.manifestSha256).toBe(saved.manifestSha256);
	const denied = await scene.GET({
		...sceneScope, locals: { user: { id: String(actorId + 1) } }, url: new URL('http://127.0.0.1/scratch?revision=1'),
	} as Parameters<typeof scene.GET>[0]);
	expect(denied.status).toBe(404);
	return { sceneId, sceneHash: readback!.manifestSha256, browserSessionId };
}

async function run(command: string, args: string[], timeoutMs = 60_000): Promise<void> {
	await new Promise<void>((resolvePromise, reject) => {
		const child = spawn(command, args, { shell: false, windowsHide: true });
		let stderr = '';
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			reject(new Error(`MEDIA_FIXTURE_COMMAND_TIMEOUT:${command}`));
		}, timeoutMs);
		child.stderr?.on('data', (chunk: Buffer) => {
			if (stderr.length < 4096) stderr += chunk.toString();
		});
		child.on('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			if (code === 0) resolvePromise();
			else reject(new Error(`MEDIA_FIXTURE_COMMAND_FAILED:${code}:${stderr.slice(-600)}`));
		});
	});
}

afterAll(async () => {
	await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
});

describe.skipIf(!enabled)('real media and EmbeddingGemma video stage on rollback-only PostgreSQL 18', () => {
	it('probes, extracts, detects, embeds, persists, and reads back one video fixture', async () => {
		if (VERIFY_SCENE && (!VERIFY_SEAWEED || !ENV.SCENE_PERSISTENCE_ENABLED || !ENV.EVIDENCE_TRANSCRIPT_REVIEW_ENABLED)) {
			throw new Error('VIDEO_SCENE_FIXTURE_REQUIRES_REAL_ARTIFACTS_AND_LOCAL_REVIEW_FLAGS');
		}
		if (BROWSER_SOURCE_EVIDENCE && !VERIFY_SCENE) throw new Error('VIDEO_BROWSER_FIXTURE_REQUIRES_SCENE_VERIFICATION');
		const ffmpegPath = ENV.FFMPEG_PATH?.trim() || process.env.FFMPEG_PATH?.trim();
		const yoloPython = process.env.YOLO_PYTHON?.trim();
		const modelDir = ENV.ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR?.trim();
		if (!ffmpegPath || !process.env.FFPROBE_PATH?.trim() || !yoloPython || !modelDir) {
			throw new Error('VIDEO_MEDIA_E2E_REQUIRES_FFMPEG_FFPROBE_YOLO_PYTHON_AND_EMBEDDINGGEMMA2');
		}
		const imageMetadata = await sharp(FIXTURE_IMAGE).metadata();
		if (!imageMetadata.width || !imageMetadata.height) throw new Error('VIDEO_FIXTURE_IMAGE_INVALID');

		const connectionUrl = new URL(ENV.DATABASE_URL);
		if (!['127.0.0.1', 'localhost'].includes(connectionUrl.hostname) || (connectionUrl.port && connectionUrl.port !== '5434')) {
			throw new Error('SCRATCH_DATABASE_MUST_BE_LOCAL_PG18');
		}
		connectionUrl.pathname = `/${SCRATCH_DATABASE}`;
		const client = new Client({ connectionString: connectionUrl.toString() });
		clients.push(client);
		let transactionStarted = false;
		let workDir: string | undefined;
		let asrWorkerInputPath: string | undefined;
		let vectorSchemaCreatedInTransaction = false;

		try {
			await client.connect();
			const identity = await client.query<{ database_name: string; server_version: string }>(
				`SELECT current_database() AS database_name, current_setting('server_version') AS server_version`,
			);
			expect(identity.rows[0]).toMatchObject({ database_name: SCRATCH_DATABASE, server_version: expect.stringMatching(/^18\./) });
			await client.query('BEGIN');
			transactionStarted = true;

			const tables = await client.query<{ vector_table: string | null }>(
				`SELECT to_regclass('public.evidence_multimodal_vectors')::text AS vector_table`,
			);
			if (!tables.rows[0]?.vector_table) {
				const migration = await readFile(resolve(process.cwd(), 'drizzle/manual/20261113_evidence_multimodal_vectors_v1_DRAFT.sql'), 'utf8');
				await client.query(migration);
				vectorSchemaCreatedInTransaction = true;
			}

			workDir = await mkdtemp(join(tmpdir(), 'atlas-video-media-e2e-'));
			let videoBytes: Buffer;
			if (FIXTURE_VIDEO) {
				const fixtureStat = await stat(FIXTURE_VIDEO);
				if (!fixtureStat.isFile() || fixtureStat.size <= 0 || fixtureStat.size > MAX_FIXTURE_VIDEO_BYTES) {
					throw new Error('VIDEO_FIXTURE_PATH_MUST_BE_A_NONEMPTY_FILE_UNDER_100_MIB');
				}
				videoBytes = await readFile(FIXTURE_VIDEO);
			} else {
				const videoPath = join(workDir, 'source.mp4');
				await run(ffmpegPath, [
					'-hide_banner', '-loglevel', 'error', '-loop', '1', '-framerate', '2', '-i', FIXTURE_IMAGE,
					'-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2',
					'-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', videoPath,
				]);
				videoBytes = await readFile(videoPath);
			}
			const sourceRevision = sha256(videoBytes);
			const evidenceId = randomUUID();
			const caseId = randomUUID();
			const analysisJobId = randomUUID();
			const uploadedBy = 7;
			const artifactBucket = ENV.SEAWEED_ARTIFACTS_BUCKET || ARTIFACTS_BUCKET;
			const fixturePrefix = `evidence/${caseId}/${evidenceId}/${sourceRevision.slice('sha256:'.length)}/${analysisJobId}/`;
			if (VERIFY_SEAWEED) {
				await assertLocalFixtureStorage(artifactBucket);
				// Objects in this fresh fixture namespace remain available for audit after SQL rollback.
				console.info(`[video-fixture] retained object namespace: seaweed://${artifactBucket}/${fixturePrefix}`);
			}
			const sourceFileUrl = BROWSER_SOURCE_EVIDENCE ? await findBrowserFixtureSource(sourceRevision) : 'scratch-only';
			await client.query(
				`INSERT INTO public.cases (id,title,status,priority,user_id) VALUES ($1,'Media E2E scratch fixture','open','medium',$2)`,
				[caseId, uploadedBy],
			);
			await client.query(
				`INSERT INTO public.evidence (id,case_id,user_id,uploaded_by,evidence_type,title,file_name,file_type,file_size,file_url,hash,status,metadata)
				 VALUES ($1,$2,$3,$3,'video','Media E2E scratch fixture','source.mp4','video/mp4',$4,$5,$6,'processing_queued',$7::jsonb)`,
				[evidenceId, caseId, uploadedBy, videoBytes.length, sourceFileUrl, sourceRevision, JSON.stringify({ source_revision: sourceRevision })],
			);

			const baseDatabase = drizzle(client, { schema });
			const rollbackDatabase = Object.create(baseDatabase) as typeof AppDatabase;
			Object.defineProperty(rollbackDatabase, 'transaction', {
				value: async (operation: (transaction: typeof rollbackDatabase) => Promise<unknown>) => operation(rollbackDatabase),
			});
			const artifacts = new Map<string, Buffer>();
			const storedObjects = new Set<string>();
			const readArtifact = async (bucket: string, objectKey: string, maximumBytes: number) =>
				VERIFY_SEAWEED
					? await getFileFromSeaweed({ bucket, objectKey, maximumBytes })
					: artifacts.get(`${bucket}/${objectKey}`);
			let transcriptChunkCount = 1;
			let transcriptExpectedText = 'fixture transcript segment';
			let transcriptExpectedLanguage = 'en';
			let transcriptExpectedWordCount = 0;
			let transcriptExpectedSegments: Array<{ startMs: number; endMs: number; text: string; words?: Array<{ startMs: number; endMs: number; text: string }> }> = [
				{ startMs: 250, endMs: 750, text: 'fixture transcript segment' },
			];
			let transcriptExpectedAsrModel = 'fixture-transcript-v1';
			const detector = createYOLOService();
			if (!(await detector.isModelAvailable())) throw new Error('VIDEO_MEDIA_E2E_YOLO_RUNTIME_UNAVAILABLE');
			const detectorRevision = await detector.getModelArtifactRevision();
			if (!detectorRevision) throw new Error('VIDEO_MEDIA_E2E_YOLO_MODEL_REVISION_UNAVAILABLE');

			const dependencies: VideoAnalysisDependenciesV1 = {
				database: rollbackDatabase,
				ensureCaseOwned: async (requestedCaseId, ownerId) => {
					const rows = await rollbackDatabase.execute(sql`
						SELECT id FROM cases WHERE id = ${requestedCaseId}::uuid AND user_id = ${Number(ownerId)}
					`);
					if (rows.rows.length !== 1) throw new Error('SCRATCH_CASE_OWNERSHIP_CHECK_FAILED');
				},
				modelDir,
				// Explicitly enabled only inside this rollback-only scratch-database fixture.
				audioEmbeddingsEnabled: true,
				probe: (path) => detectVideoAndAudioStreamsV1(path),
				// Keep this live-model integration bounded while still sampling adjacent source frames.
				extractFrames: async (bytes, options) => new VisionService().extractFrames(bytes, { ...options, maxFrames: Math.min(options.maxFrames, 2), scaleWidth: options.scaleWidth ?? 768 }),
				frameDimensions: async (buffer) => {
					const metadata = await sharp(buffer).metadata();
					if (!metadata.width || !metadata.height) throw new Error('VIDEO_FRAME_DIMENSIONS_UNAVAILABLE');
					return { width: metadata.width, height: metadata.height };
				},
				extractAudio: extractAudioTrack,
				transcribe: async (audioPath) => {
					if (!FIXTURE_ASR_URL) return {
						text: 'fixture transcript segment', language: 'en',
						chunks: [{ startMs: 250, endMs: 750, text: 'fixture transcript segment', language: 'en', confidence: 1, model: 'fixture-transcript-v1' }],
					};
					const asrUrl = new URL(FIXTURE_ASR_URL);
					if (!['127.0.0.1', 'localhost', '[::1]'].includes(asrUrl.hostname) || asrUrl.pathname !== '/transcribe') {
						throw new Error('VIDEO_MEDIA_E2E_ASR_URL_MUST_BE_LOOPBACK_TRANSCRIBE_ENDPOINT');
					}
					const allowedAudioDir = resolve(process.cwd(), 'temp', 'media', 'rollback-asr-e2e');
					await mkdir(allowedAudioDir, { recursive: true });
					asrWorkerInputPath = join(allowedAudioDir, `${randomUUID()}.wav`);
					await copyFile(audioPath, asrWorkerInputPath);
					const response = await fetch(asrUrl, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ path: asrWorkerInputPath, word_timestamps: true, beam_size: 1 }),
					});
					if (!response.ok) throw new Error(`VIDEO_MEDIA_E2E_ASR_WORKER_FAILED:${response.status}`);
					const payload = await response.json() as {
						language?: unknown;
						model_size?: unknown;
						compute_type?: unknown;
						segments?: Array<{ start?: unknown; end?: unknown; text?: unknown; words?: Array<{ start?: unknown; end?: unknown; word?: unknown }> }>;
					};
					if (!Array.isArray(payload.segments) || payload.segments.length > 10_000) throw new Error('VIDEO_MEDIA_E2E_ASR_SEGMENTS_INVALID');
					const chunks = payload.segments.map((segment) => {
						if (typeof segment.start !== 'number' || !Number.isFinite(segment.start) || typeof segment.end !== 'number' || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start || typeof segment.text !== 'string' || !segment.text.trim()) {
							throw new Error('VIDEO_MEDIA_E2E_ASR_SEGMENT_INVALID');
						}
						const startMs = Math.round(segment.start * 1000);
						const endMs = Math.round(segment.end * 1000);
						const words = (segment.words ?? []).map((word) => {
							if (typeof word.start !== 'number' || !Number.isFinite(word.start) || typeof word.end !== 'number' || !Number.isFinite(word.end) || word.start < segment.start || word.end > segment.end || word.end <= word.start || typeof word.word !== 'string' || !word.word.trim()) {
								throw new Error('VIDEO_MEDIA_E2E_ASR_WORD_INVALID');
							}
							return { startMs: Math.round(word.start * 1000), endMs: Math.round(word.end * 1000), text: word.word.trim() };
						});
						return {
							startMs,
							endMs,
							text: segment.text.trim(),
							language: typeof payload.language === 'string' ? payload.language : undefined,
							confidence: 0.85,
							model: `faster-whisper:${String(payload.model_size ?? 'unknown')}:${String(payload.compute_type ?? 'unknown')}`,
							...(words.length ? { words } : {}),
						};
					});
					transcriptExpectedWordCount = chunks.reduce((count, chunk) => count + (chunk.words?.length ?? 0), 0);
					if (transcriptExpectedWordCount === 0) throw new Error('VIDEO_MEDIA_E2E_ASR_WORD_TIMESTAMPS_MISSING');
					transcriptChunkCount = chunks.length;
					transcriptExpectedSegments = chunks.map(({ startMs, endMs, text, words }) => ({ startMs, endMs, text, ...(words ? { words } : {}) }));
					transcriptExpectedText = chunks.map((chunk) => chunk.text).join(' ');
					transcriptExpectedLanguage = typeof payload.language === 'string' ? payload.language : 'und';
					transcriptExpectedAsrModel = `faster-whisper:${String(payload.model_size ?? 'unknown')}:${String(payload.compute_type ?? 'unknown')}`;
					return { text: chunks.map((chunk) => chunk.text).join(' '), language: typeof payload.language === 'string' ? payload.language : undefined, chunks };
				},
				readArtifactFile: readFile,
				artifactFileSize: async (path) => (await stat(path)).size,
				uploadArtifact: async (bucket, objectKey, bytes, metadata) => {
					if (VERIFY_SEAWEED) {
						if (bucket !== artifactBucket || !objectKey.startsWith(fixturePrefix)) {
							throw new Error('VIDEO_MEDIA_FIXTURE_OBJECT_OUT_OF_SCOPE');
						}
						await uploadSeaweedFile(bucket, objectKey, bytes, { ...metadata, 'x-atlas-fixture': 'rollback-media-integration' });
					} else {
						artifacts.set(`${bucket}/${objectKey}`, Buffer.from(bytes));
					}
					storedObjects.add(`${bucket}/${objectKey}`);
				},
				statArtifact: async (bucket, objectKey) => VERIFY_SEAWEED
					? { size: (await statSeaweedObject(bucket, objectKey)).size }
					: { size: artifacts.get(`${bucket}/${objectKey}`)?.byteLength ?? -1 },
				loadDetector: async () => ({
					modelRevision: detectorRevision,
					analyze: async (buffer, fileName) => detector.analyzeDocument(buffer, fileName),
				}),
				embedFrame: (buffer, selectedModelDir) => embedEvidenceImageWithEmbeddingGemma2OnnxV1({ buffer, modelDir: selectedModelDir }),
				embedAudio: (pcm, sampleRate, selectedModelDir) => embedEvidenceAudioWithEmbeddingGemma2OnnxV1({ pcm, sampleRate, modelDir: selectedModelDir }),
				embedTranscript: (text, selectedModelDir) => embedEvidenceTextWithEmbeddingGemma2OnnxV1({ text, kind: 'document', modelDir: selectedModelDir }),
				persistVector: persistEvidenceMultimodalVectorV1,
				persist: (input, database) => persistCanonicalVideoAnalysisV1(input, database),
			};

			const receipt = await processCanonicalVideoAnalysisV1({
				evidenceId, caseId, analysisJobId, uploadedBy, sourceRevision,
				fileName: 'source.mp4', bytes: videoBytes,
			}, dependencies);

			expect(receipt.canonicalReceiptVerified).toBe(true);
			expect(receipt.readback.frameFindingCount).toBeGreaterThan(0);
			expect(receipt.readback.transcriptSegmentCount).toBe(transcriptChunkCount);
			expect(receipt.readback.vectorCount).toBeGreaterThanOrEqual(3);
			expect(receipt.analysis.audioEmbeddingStatus).toBe('COMPLETED');
			expect(storedObjects.size).toBeGreaterThanOrEqual(2);

			const rows = await client.query<{
				frame_count: string;
				transcript_count: string;
				segment_count: string;
				transcript: { id: string; evidence_id: string; case_id: string; language: string; full_text: string; segment_count: number; whisper_model: string | null; metadata: Record<string, unknown> } | null;
				transcript_segments: Array<{ segment_index: number; start_ms: number; end_ms: number; text: string; language: string | null; confidence: number | null; metadata: Record<string, unknown> }>;
				vector_count: string;
				audio_window_vector_count: string;
				audio_representation_count: string;
				audio_outbox_lane_count: string;
				outbox_count: string;
				vector_dims: number;
				video_analysis: Record<string, unknown> & { frames?: VideoFrameProposalV1[] };
			}>(`
				SELECT
				  jsonb_array_length(e.ai_analysis->'videoAnalysis'->'frames')::text AS frame_count,
				  (SELECT count(*)::text FROM public.audio_transcripts WHERE id=$3) AS transcript_count,
				  (SELECT count(*)::text FROM public.whisper_segments WHERE transcript_id=$3) AS segment_count,
				  (SELECT jsonb_build_object('id', t.id::text, 'evidence_id', t.evidence_id::text, 'case_id', t.case_id::text, 'language', t.language, 'full_text', t.full_text, 'segment_count', t.segment_count, 'whisper_model', t.whisper_model, 'metadata', t.metadata) FROM public.audio_transcripts t WHERE t.id=$3) AS transcript,
				  (SELECT coalesce(jsonb_agg(jsonb_build_object('segment_index', s.segment_index, 'start_ms', s.start_ms, 'end_ms', s.end_ms, 'text', s.text, 'language', s.language, 'confidence', s.confidence, 'metadata', s.metadata) ORDER BY s.segment_index), '[]'::jsonb) FROM public.whisper_segments s WHERE s.transcript_id=$3) AS transcript_segments,
				  (SELECT count(*)::text FROM public.evidence_multimodal_vectors WHERE evidence_id=$1 AND source_revision=$4) AS vector_count,
				  (SELECT count(*)::text FROM public.evidence_multimodal_vectors WHERE evidence_id=$1 AND source_revision=$4 AND modality='audio_segment' AND source_locator->>'kind'='sampled_audio_window') AS audio_window_vector_count,
				  (SELECT count(*)::text FROM public.evidence_multimodal_vectors WHERE evidence_id=$1 AND source_revision=$4 AND representation_id='embeddinggemma2_audio_content_768_v1') AS audio_representation_count,
				  (SELECT count(*)::text FROM public.evidence_multimodal_vector_projection_outbox o JOIN public.evidence_multimodal_vectors v ON v.id=o.evidence_multimodal_vector_id WHERE v.evidence_id=$1 AND v.source_revision=$4 AND o.projection_lane='evidence_audio_content_768' AND o.representation_id='embeddinggemma2_audio_content_768_v1') AS audio_outbox_lane_count,
				  (SELECT count(*)::text FROM public.evidence_multimodal_vector_projection_outbox o JOIN public.evidence_multimodal_vectors v ON v.id=o.evidence_multimodal_vector_id WHERE v.evidence_id=$1 AND v.source_revision=$4) AS outbox_count,
				  (SELECT vector_dims(embedding) FROM public.evidence_multimodal_vectors WHERE evidence_id=$1 AND source_revision=$4 LIMIT 1) AS vector_dims,
				  e.ai_analysis->'videoAnalysis' AS video_analysis
				FROM public.evidence e WHERE e.id=$1 AND e.case_id=$2 AND e.hash=$5
			`, [evidenceId, caseId, analysisJobId, sourceRevision, sourceRevision]);
			expect(rows.rows).toHaveLength(1);
			expect(rows.rows[0]).toMatchObject({
				frame_count: String(receipt.readback.frameFindingCount),
				transcript_count: '1',
				segment_count: String(transcriptChunkCount),
				vector_count: String(receipt.readback.vectorCount),
				audio_window_vector_count: '1',
				audio_representation_count: '1',
				audio_outbox_lane_count: '1',
				outbox_count: String(receipt.readback.vectorCount),
				vector_dims: 768,
			});
			expect(rows.rows[0].transcript).toMatchObject({
				id: analysisJobId,
				evidence_id: evidenceId,
				case_id: caseId,
				language: transcriptExpectedLanguage,
				full_text: transcriptExpectedText,
				segment_count: transcriptChunkCount,
				whisper_model: ENV.WHISPER_MODEL || 'whisper',
				metadata: expect.objectContaining({ sourceRevision, analysisRevision: receipt.analysisRevision, modality: 'video_audio' }),
			});
			expect(rows.rows[0].transcript_segments).toHaveLength(transcriptChunkCount);
			expect(rows.rows[0].transcript_segments.reduce((count, segment) => count + (Array.isArray(segment.metadata.words) ? segment.metadata.words.length : 0), 0)).toBe(FIXTURE_ASR_URL ? transcriptExpectedWordCount : 0);
			expect(rows.rows[0].transcript_segments.map((segment) => ({
				segment_index: segment.segment_index,
				start_ms: segment.start_ms,
				end_ms: segment.end_ms,
				text: segment.text,
				metadata: {
					sourceRevision: segment.metadata.sourceRevision,
					analysisRevision: segment.metadata.analysisRevision,
					model: segment.metadata.model,
					reviewState: segment.metadata.reviewState,
					words: segment.metadata.words,
				},
			}))).toEqual(transcriptExpectedSegments.map((segment, segment_index) => ({
				segment_index,
				start_ms: segment.startMs,
				end_ms: segment.endMs,
				text: segment.text,
				metadata: {
					sourceRevision,
					analysisRevision: receipt.analysisRevision,
					model: FIXTURE_ASR_URL ? transcriptExpectedAsrModel : 'fixture-transcript-v1',
					reviewState: 'UNREVIEWED_PROPOSAL',
					words: segment.words,
				},
			})));
			expect(rows.rows[0].video_analysis).toMatchObject({
				sourceRevision,
				analysisRevision: receipt.analysisRevision,
				embeddingStatus: 'COMPLETED',
				audioEmbeddingStatus: 'COMPLETED',
			});
			const persistedFrames = rows.rows[0].video_analysis.frames;
			expect(persistedFrames).toHaveLength(receipt.readback.frameFindingCount);
			for (const frame of persistedFrames ?? []) {
				expect(frame.artifact).toMatchObject({ sourceRevision, analysisRevision: receipt.analysisRevision });
				const image = await readArtifact(frame.artifact.bucket, frame.artifact.objectKey, frame.artifact.byteLength);
				expect(image?.byteLength).toBe(frame.artifact.byteLength);
				expect(sha256(image!)).toBe(frame.artifact.sha256);
				expect(frame.motionLut).toBeUndefined();
			}
			const persistedMotionSamples = rows.rows[0].video_analysis.motionSamples as Array<{
				schema: string; evidenceId: string; sourceRevision: string; analysisRevision: string; sampleIndex: number;
				timestampMs: number; previousTimestampMs: number | null; motionScore: number; reviewState: string;
				artifact: { bucket: string; objectKey: string; byteLength: number; sha256: string };
			}>;
			expect(persistedMotionSamples.length).toBeGreaterThan(0);
			expect(persistedMotionSamples.length).toBeLessThanOrEqual(2);
			for (const [index, sample] of persistedMotionSamples.entries()) {
				expect(sample).toMatchObject({
					schema: 'atlas.video-motion-sample.v1', evidenceId, sourceRevision, analysisRevision: receipt.analysisRevision,
					sampleIndex: index, reviewState: 'UNREVIEWED_PIXEL_CHANGE_CUE',
					artifact: { byteLength: VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1 },
				});
				const bytes = await readArtifact(sample.artifact.bucket, sample.artifact.objectKey, VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1);
				expect(bytes?.byteLength).toBe(VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1);
				expect(sha256(bytes!)).toBe(sample.artifact.sha256);
				const indices = decodeVideoMotionLutIndicesV1(bytes!);
				expect(buildPackedMotionLodsV1(indices).map(({ width, height, data }) => [width, height, data.byteLength]))
					.toEqual(expect.arrayContaining([[64, 128, 4096], [32, 64, 1024]]));
			}
			expect(persistedMotionSamples[0]).toMatchObject({ previousTimestampMs: null, sampleIndex: 0 });

			let proof: Awaited<ReturnType<typeof proveStoredMotionScene>> | undefined;
			if (VERIFY_SCENE) {
				routeStore.scratch = rollbackDatabase;
				proof = await proveStoredMotionScene({
					caseId, evidenceId, actorId: uploadedBy, sourceRevision, analysisRevision: receipt.analysisRevision,
					frames: persistedFrames ?? [], samples: persistedMotionSamples,
				});
				routeStore.scratch = null;
			}
			await client.query('ROLLBACK');
			transactionStarted = false;
			const afterRollback = await client.query<{ evidence_count: string }>(
				`SELECT count(*)::text AS evidence_count FROM public.evidence WHERE id=$1`,
				[evidenceId],
			);
			expect(afterRollback.rows[0]).toEqual({ evidence_count: '0' });
			if (!vectorSchemaCreatedInTransaction) {
				const vectorRollback = await client.query<{ vector_count: string }>(
					`SELECT count(*)::text AS vector_count FROM public.evidence_multimodal_vectors WHERE evidence_id=$1`,
					[evidenceId],
				);
				expect(vectorRollback.rows[0]).toEqual({ vector_count: '0' });
			}
			if (proof) {
				const observer = new Client({ connectionString: connectionUrl.toString() });
				clients.push(observer);
				await observer.connect();
				const audit = await observer.query(`
					SELECT
						(SELECT count(*)::text FROM cases WHERE id=$1) AS cases,
						(SELECT count(*)::text FROM evidence WHERE id=$2) AS evidence,
						(SELECT count(*)::text FROM evidence_versions WHERE evidence_id=$2) AS reviews,
						(SELECT count(*)::text FROM scene_document_revisions WHERE case_id=$1 AND scene_id=$3) AS scenes,
						(SELECT count(*)::text FROM sessions WHERE id=$4) AS sessions
				`, [caseId, evidenceId, proof.sceneId, proof.browserSessionId]);
				expect(audit.rows[0]).toEqual({ cases: '0', evidence: '0', reviews: '0', scenes: '0', sessions: '0' });
				console.info(`[video-fixture] verified reviewed scene revision ${proof.sceneId} hash ${proof.sceneHash}, then rolled back`);
			}
		} finally {
			routeStore.scratch = null;
			if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
			if (asrWorkerInputPath) await unlink(asrWorkerInputPath).catch(() => undefined);
			if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
		}
	}, 900_000);
});
