// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { ENV } from '$lib/server/env.server.js';
import * as schema from '$lib/server/db/schema-postgres.js';
import type { db as AppDatabase } from '$lib/server/db/client.js';
import { humanCoco17PoseSchemaV1 } from '$lib/shared/pose-skeleton-schema-v1.js';
import {
	createDrizzleRevisionPortsV1,
	saveEvidenceAnnotationRevisionV1,
	savePoseReviewDecisionV1,
} from '../evidence-revision-v1.js';

const enabled = process.env.ATLAS_POSE_REVIEW_PG18_E2E === '1';
const SCRATCH_DATABASE = 'legal_ai_live_integration_scratch';
const SOURCE_HASH = `sha256:${'c'.repeat(64)}`;
const clients: Client[] = [];

afterAll(async () => Promise.all(clients.map((client) => client.end().catch(() => undefined))));

describe.skipIf(!enabled)('pose review persistence on disposable PostgreSQL 18', () => {
	it('appends and independently verifies an exact-frame review decision, then rolls back all fixture rows', async () => {
		const connectionUrl = new URL(ENV.DATABASE_URL);
		if (!['127.0.0.1', 'localhost'].includes(connectionUrl.hostname) || connectionUrl.port !== '5434') {
			throw new Error('POSE_REVIEW_INTEGRATION_REQUIRES_LOCAL_PG18_SCRATCH_PORT_5434');
		}
		connectionUrl.pathname = `/${SCRATCH_DATABASE}`;
		const client = new Client({ connectionString: connectionUrl.toString() });
		clients.push(client);
		let transactionStarted = false;
		const caseId = randomUUID();
		const evidenceId = randomUUID();
		try {
			await client.connect();
			const identity = await client.query<{ database_name: string; server_version: string }>(
				`SELECT current_database() AS database_name, current_setting('server_version') AS server_version`,
			);
			expect(identity.rows[0]).toMatchObject({ database_name: SCRATCH_DATABASE, server_version: expect.stringMatching(/^18\./) });
			await client.query('BEGIN');
			transactionStarted = true;
			await client.query(`INSERT INTO public.cases (id,title,status,priority,user_id) VALUES ($1,'Pose review rollback fixture','open','medium',7)`, [caseId]);
			await client.query(
				`INSERT INTO public.evidence (id,case_id,user_id,uploaded_by,evidence_type,title,file_name,file_type,file_size,file_url,hash,status,metadata)
				 VALUES ($1,$2,7,7,'video','Pose review rollback fixture','source.mp4','video/mp4',1,'scratch-only',$3,'processing_queued',$4::jsonb)`,
				[evidenceId, caseId, SOURCE_HASH, JSON.stringify({ source_revision: SOURCE_HASH })],
			);

			const baseDatabase = drizzle(client, { schema });
			const transactionDatabase = Object.create(baseDatabase) as typeof AppDatabase;
			Object.defineProperty(transactionDatabase, 'transaction', {
				value: async (operation: (transaction: typeof transactionDatabase) => Promise<unknown>) => operation(transactionDatabase),
			});
			const ports = await createDrizzleRevisionPortsV1({ db: transactionDatabase });
			const analysisRevision = 'pose-review-pg18-fixture-v1';
			const framePtsUs = 1_250_000;
			const trackId = 'track-fixture-1';
			const trackScopeId = 'sha256:pose-review-track-scope';
			const pose = {
				schema: 'atlas.pose-observation.v1', evidenceId, sourceSha256: SOURCE_HASH, sourceRevision: SOURCE_HASH,
				analysisRevision, framePtsUs, frameIndex: 5, frameWidth: 640, frameHeight: 480,
				skeletonSchemaId: humanCoco17PoseSchemaV1.schemaId, trackId, trackScopeId,
				origin: 'manual', modelRevision: null, reviewState: 'UNREVIEWED',
				keypoints: humanCoco17PoseSchemaV1.joints.map(({ index }) => ({
					index, x: index === 0 ? 320.25 : null, y: index === 0 ? 240.5 : null,
					confidence: index === 0 ? 1 : 0, visibility: index === 0 ? 'visible' : 'not_labeled',
				})),
			};
			const poseReceipt = await saveEvidenceAnnotationRevisionV1({
				caseId, evidenceId, actorUserId: 7, parentSha256: SOURCE_HASH,
				annotation: {
					schema: 'atlas.evidence-annotation.v1', modality: 'video', notes: '', annotations: [],
					poseSchemas: [humanCoco17PoseSchemaV1], poseObservations: [pose],
				},
			}, ports);
			const reviewInput = {
				caseId, evidenceId, actorUserId: 7, parentSha256: SOURCE_HASH,
				annotationRevisionId: poseReceipt.versionId, analysisRevision, frameIndex: 5, framePtsUs,
				skeletonSchemaId: humanCoco17PoseSchemaV1.schemaId, trackId, trackScopeId,
				decision: 'ACCEPTED_FOR_SCENE_PROPOSAL' as const,
			};
			const first = await savePoseReviewDecisionV1(reviewInput, ports);
			const replay = await savePoseReviewDecisionV1(reviewInput, ports);
			expect(first).toMatchObject({ committed: true, idempotent: false, sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL', canonicalAuthority: false });
			expect(replay).toMatchObject({ idempotent: true, decisionId: first.decisionId, revision: first.revision });

			const rows = await client.query<{ version: number; metadata: Record<string, unknown> }>(
				`SELECT version, metadata FROM public.evidence_versions WHERE evidence_id=$1 ORDER BY version`,
				[evidenceId],
			);
			expect(rows.rows).toHaveLength(2);
			expect(rows.rows[1]).toMatchObject({
				metadata: {
					schema: 'atlas.pose-review-decision.v1', sourceSha256: SOURCE_HASH,
					annotationRevisionId: poseReceipt.versionId, analysisRevision,
					frameIndex: 5, framePtsUs, trackId, trackScopeId,
					decision: 'ACCEPTED_FOR_SCENE_PROPOSAL', reviewerUserId: 7,
					canonicalAuthority: false, sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL',
				},
			});

			await client.query('ROLLBACK');
			transactionStarted = false;
			const independent = new Client({ connectionString: connectionUrl.toString() });
			clients.push(independent);
			await independent.connect();
			const afterRollback = await independent.query<{ evidence_rows: string; case_rows: string; revision_rows: string }>(
				`SELECT
				 (SELECT count(*)::text FROM public.evidence WHERE id=$1) AS evidence_rows,
				 (SELECT count(*)::text FROM public.cases WHERE id=$2) AS case_rows,
				 (SELECT count(*)::text FROM public.evidence_versions WHERE evidence_id=$1) AS revision_rows`,
				[evidenceId, caseId],
			);
			expect(afterRollback.rows[0]).toEqual({ evidence_rows: '0', case_rows: '0', revision_rows: '0' });
		} finally {
			if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
		}
	}, 30_000);
});
