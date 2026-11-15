// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { ENV } from '$lib/server/env.server.js';
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
} from '../durable-video-analysis-v1.js';

const enabled = process.env.ATLAS_EVIDENCE_VIDEO_MEDIA_E2E === '1';
const SCRATCH_DATABASE = 'legal_ai_live_integration_scratch';
const FIXTURE_IMAGE = process.env.ATLAS_VIDEO_FIXTURE_IMAGE_PATH || join(tmpdir(), 'atlas-yolo-bus-fixture.jpg');
const clients: Client[] = [];

function sha256(bytes: Uint8Array): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
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
			const videoPath = join(workDir, 'source.mp4');
			await run(ffmpegPath, [
				'-hide_banner', '-loglevel', 'error', '-loop', '1', '-framerate', '2', '-i', FIXTURE_IMAGE,
				'-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2',
				'-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', videoPath,
			]);
			const videoBytes = await readFile(videoPath);
			const sourceRevision = sha256(videoBytes);
			const evidenceId = randomUUID();
			const caseId = randomUUID();
			const analysisJobId = randomUUID();
			const uploadedBy = 7;
			await client.query(
				`INSERT INTO public.cases (id,title,status,priority,user_id) VALUES ($1,'Media E2E scratch fixture','open','medium',$2)`,
				[caseId, uploadedBy],
			);
			await client.query(
				`INSERT INTO public.evidence (id,case_id,user_id,uploaded_by,evidence_type,title,file_name,file_type,file_size,file_url,hash,status,metadata)
				 VALUES ($1,$2,$3,$3,'video','Media E2E scratch fixture','source.mp4','video/mp4',$4,'scratch-only',$5,'processing_queued',$6::jsonb)`,
				[evidenceId, caseId, uploadedBy, videoBytes.length, sourceRevision, JSON.stringify({ source_revision: sourceRevision })],
			);

			const baseDatabase = drizzle(client, { schema });
			const rollbackDatabase = Object.create(baseDatabase) as typeof AppDatabase;
			Object.defineProperty(rollbackDatabase, 'transaction', {
				value: async (operation: (transaction: typeof rollbackDatabase) => Promise<unknown>) => operation(rollbackDatabase),
			});
			const artifacts = new Map<string, Buffer>();
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
				extractFrames: async (bytes, options) => new VisionService().extractFrames(bytes, { ...options, scaleWidth: 768 }),
				frameDimensions: async (buffer) => {
					const metadata = await sharp(buffer).metadata();
					if (!metadata.width || !metadata.height) throw new Error('VIDEO_FRAME_DIMENSIONS_UNAVAILABLE');
					return { width: metadata.width, height: metadata.height };
				},
				extractAudio: extractAudioTrack,
				transcribe: async () => ({
					text: 'fixture transcript segment', language: 'en',
					chunks: [{ startMs: 250, endMs: 750, text: 'fixture transcript segment', language: 'en', confidence: 1, model: 'fixture-transcript-v1' }],
				}),
				readArtifactFile: readFile,
				artifactFileSize: async (path) => (await stat(path)).size,
				uploadArtifact: async (bucket, objectKey, bytes) => { artifacts.set(`${bucket}/${objectKey}`, Buffer.from(bytes)); },
				statArtifact: async (bucket, objectKey) => ({ size: artifacts.get(`${bucket}/${objectKey}`)?.byteLength ?? -1 }),
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
			expect(receipt.readback.transcriptSegmentCount).toBe(1);
			expect(receipt.readback.vectorCount).toBeGreaterThanOrEqual(3);
			expect(receipt.analysis.audioEmbeddingStatus).toBe('COMPLETED');
			expect(artifacts.size).toBeGreaterThanOrEqual(2);

			const rows = await client.query<{
				frame_count: string;
				transcript_count: string;
				segment_count: string;
				vector_count: string;
				audio_window_vector_count: string;
				audio_representation_count: string;
				audio_outbox_lane_count: string;
				outbox_count: string;
				vector_dims: number;
				video_analysis: Record<string, unknown>;
			}>(`
				SELECT
				  jsonb_array_length(e.ai_analysis->'videoAnalysis'->'frames')::text AS frame_count,
				  (SELECT count(*)::text FROM public.audio_transcripts WHERE id=$3) AS transcript_count,
				  (SELECT count(*)::text FROM public.whisper_segments WHERE transcript_id=$3) AS segment_count,
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
				segment_count: '1',
				vector_count: String(receipt.readback.vectorCount),
				audio_window_vector_count: '1',
				audio_representation_count: '1',
				audio_outbox_lane_count: '1',
				outbox_count: String(receipt.readback.vectorCount),
				vector_dims: 768,
			});
			expect(rows.rows[0].video_analysis).toMatchObject({
				sourceRevision,
				analysisRevision: receipt.analysisRevision,
				embeddingStatus: 'COMPLETED',
				audioEmbeddingStatus: 'COMPLETED',
			});

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
		} finally {
			if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
			if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
		}
	}, 180_000);
});
