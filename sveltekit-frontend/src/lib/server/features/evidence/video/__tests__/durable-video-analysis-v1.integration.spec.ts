// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { ENV } from '$lib/server/env.server.js';
import * as schema from '$lib/server/db/schema-postgres.js';
import type { db as appDatabase } from '$lib/server/db/client.js';
import { persistCanonicalVideoAnalysisV1, type VideoAnalysisDependenciesV1 } from '../durable-video-analysis-v1.js';

const enabled = process.env.ATLAS_EVIDENCE_VIDEO_SCRATCH_TEST === '1';
const SCRATCH_DATABASE = 'legal_ai_live_integration_scratch';

describe.skipIf(!enabled)('canonical video persistence readback on rollback-only PostgreSQL 18', () => {
	const clients: Client[] = [];

	afterAll(async () => {
		await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
	});

	it('reads back source-bound frame findings and transcript segments, then rolls the fixture back', async () => {
		const connectionUrl = new URL(ENV.DATABASE_URL);
		if (!['127.0.0.1', 'localhost'].includes(connectionUrl.hostname) || (connectionUrl.port && connectionUrl.port !== '5434')) {
			throw new Error('SCRATCH_DATABASE_MUST_BE_LOCAL_PG18');
		}
		connectionUrl.pathname = `/${SCRATCH_DATABASE}`;
		const client = new Client({ connectionString: connectionUrl.toString() });
		clients.push(client);
		let transactionStarted = false;

		try {
			await client.connect();
			const identity = await client.query<{ database_name: string; server_version: string }>(
				`SELECT current_database() AS database_name, current_setting('server_version') AS server_version`,
			);
			expect(identity.rows[0]).toMatchObject({
				database_name: SCRATCH_DATABASE,
				server_version: expect.stringMatching(/^18\./),
			});
			await client.query('BEGIN');
			transactionStarted = true;

			const evidenceId = randomUUID();
			const caseId = randomUUID();
			const analysisJobId = randomUUID();
			const sourceRevision = `sha256:${'b'.repeat(64)}`;
			const analysisRevision = 'video-analysis-v1:fixture-readback';
			await client.query(
				`INSERT INTO public.cases (id,title,status,priority,user_id) VALUES ($1,'Video readback scratch fixture','open','medium',7)`,
				[caseId],
			);
			await client.query(
				`INSERT INTO public.evidence (id,case_id,user_id,uploaded_by,evidence_type,title,file_name,file_type,file_size,file_url,hash,status,metadata)
				 VALUES ($1,$2,7,7,'video','Video readback scratch fixture','fixture.mp4','video/mp4',64,'scratch-only',$3,'processing_queued',$4::jsonb)`,
				[evidenceId, caseId, sourceRevision.slice(7), JSON.stringify({ source_revision: sourceRevision })],
			);

			const baseDatabase = drizzle(client, { schema });
			const rollbackDatabase = Object.create(baseDatabase) as typeof appDatabase;
			Object.defineProperty(rollbackDatabase, 'transaction', {
				value: async (operation: (transaction: typeof rollbackDatabase) => Promise<unknown>) => operation(rollbackDatabase),
			});
			const artifact = {
				bucket: 'atlas-artifacts',
				objectKey: `${evidenceId}/${sourceRevision.slice(7)}/${analysisJobId}/frame-0000.jpg`,
				storageUri: `seaweedfs://atlas-artifacts/${evidenceId}/frame-0000.jpg`,
				contentType: 'image/jpeg',
				sha256: `sha256:${'c'.repeat(64)}`,
				byteLength: 4,
				width: 768,
				height: 432,
				sourceRevision,
				analysisRevision,
			};
			const input: Parameters<VideoAnalysisDependenciesV1['persist']>[0] = {
				evidenceId,
				caseId,
				analysisJobId,
				sourceRevision,
				analysisRevision,
				samplingFps: 0.25,
				probe: {
					hasVideoStream: true,
					hasAudioStream: true,
					videoCodec: 'h264',
					width: 1920,
					height: 1080,
					durationSeconds: 4,
					durationFilmcraftTicks: 1016064000000n,
					streams: [],
				},
				transcript: {
					text: 'door closes',
					language: 'en',
					chunks: [{ startMs: 1200, endMs: 1700, text: 'door closes', language: 'en', confidence: 0.92, model: 'fixture-whisper' }],
				},
				audioArtifact: null,
				frames: [{
					frameIndex: 0,
					timestampMs: 1500,
					width: 1920,
					height: 1080,
					objects: [{ label: 'person', confidence: 0.91, bbox: [10, 20, 300, 500] }],
					modelRevision: 'sha256:detector-model',
					artifact,
					sourceRevision,
					analysisRevision,
					reviewState: 'UNREVIEWED_PROPOSAL',
				}],
				transcriptionStatus: 'COMPLETED',
				detectorStatus: 'COMPLETED',
			};

			expect(await persistCanonicalVideoAnalysisV1(input, rollbackDatabase)).toEqual({
				evidenceRowCount: 1,
				frameFindingCount: 1,
				transcriptRowCount: 1,
				transcriptSegmentCount: 1,
			});

			await client.query('ROLLBACK');
			transactionStarted = false;
			const rolledBack = await client.query<{ evidence_rows: string; transcript_rows: string; segment_rows: string }>(`
				SELECT
				  (SELECT count(*)::text FROM public.evidence WHERE id=$1) AS evidence_rows,
				  (SELECT count(*)::text FROM public.audio_transcripts WHERE id=$2) AS transcript_rows,
				  (SELECT count(*)::text FROM public.whisper_segments WHERE transcript_id=$2) AS segment_rows
			`, [evidenceId, analysisJobId]);
			expect(rolledBack.rows[0]).toEqual({ evidence_rows: '0', transcript_rows: '0', segment_rows: '0' });
		} finally {
			if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
		}
	}, 30_000);
});
