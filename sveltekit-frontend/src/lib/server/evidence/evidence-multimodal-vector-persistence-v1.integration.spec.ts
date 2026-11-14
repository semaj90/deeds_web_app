// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import sharp from 'sharp';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { ENV } from '$lib/server/env.server.js';
import { digestSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';
import {
  persistEvidenceMultimodalVectorV1,
  type EvidenceMultimodalDatabaseV1,
  type EvidenceMultimodalExecuteV1,
  type EvidenceMultimodalVectorInputV1,
} from './evidence-multimodal-vector-persistence-v1.js';
import { processEvidenceImageCanonicalV1 } from './process-evidence-image-canonical-v1.js';
import { embedEvidenceImageWithEmbeddingGemma2OnnxV1 } from './embeddinggemma2-onnx-image-v1.js';

const enabled = process.env.ATLAS_EVIDENCE_MULTIMODAL_SCRATCH_TEST === '1';
const SCRATCH_DATABASE = 'legal_ai_live_integration_scratch';
const modelDir = process.env.ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR;

describe.skipIf(!enabled)('multimodal vector writer against rollback-only PostgreSQL 18', () => {
  it('persists canonical pgvector + outbox rows, reads them back, then rolls all scratch DDL and rows back', async () => {
    const connectionUrl = new URL(ENV.DATABASE_URL);
    if (!['127.0.0.1', 'localhost'].includes(connectionUrl.hostname) || (connectionUrl.port && connectionUrl.port !== '5434')) {
      throw new Error('SCRATCH_DATABASE_MUST_BE_LOCAL_PG18');
    }
    connectionUrl.pathname = `/${SCRATCH_DATABASE}`;
    const client = new Client({ connectionString: connectionUrl.toString() });
    const dialect = new PgDialect();
    const evidenceId = randomUUID();
    const caseId = randomUUID();
    const sourceRevision = `sha256:${'a'.repeat(64)}`;
    const vector = Array.from({ length: 768 }, () => 1 / Math.sqrt(768));
    const outputSha256 = digestSemantic768OutputV1(Float32Array.from(vector));
    const input: EvidenceMultimodalVectorInputV1 = {
      evidenceId,
      caseId,
      sourceRevision,
      analysisRevision: 'scratch-multimodal-writer:v1',
      modality: 'video_frame',
      sourceLocator: { frame: 13, timestampTicks: '1100000000', sourceWidth: 1920, sourceHeight: 1080 },
      embedding: vector,
      model: 'scratch-only-embedding-fixture',
      modelArtifactSha256: `sha256:${'b'.repeat(64)}`,
      preprocessingRevision: 'scratch-frame-preprocess:v1',
      inputSha256: `sha256:${'c'.repeat(64)}`,
      outputSha256,
      metadata: { fixtureOnly: true },
    };
    let transactionStarted = false;

    try {
      await client.connect();
      const identity = await client.query<{
        database_name: string;
        server_version: string;
        vector_version: string | null;
        vector_table: string | null;
      }>(`
        SELECT current_database() AS database_name,
          current_setting('server_version') AS server_version,
          (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS vector_version,
          to_regclass('public.evidence_multimodal_vectors')::text AS vector_table
      `);
      expect(identity.rows[0]).toMatchObject({
        database_name: SCRATCH_DATABASE,
        server_version: expect.stringMatching(/^18\./),
        vector_version: '0.8.3',
        vector_table: null,
      });

      await client.query('BEGIN');
      transactionStarted = true;
      const ddl = await readFile(resolve(
        process.cwd(),
        '../sveltekit-frontend/drizzle/manual/20261113_evidence_multimodal_vectors_v1_DRAFT.sql',
      ), 'utf8');
      await client.query(ddl);
      await client.query(
        `INSERT INTO public.cases (id,title,status,priority,user_id) VALUES ($1,'Multimodal writer scratch fixture','open','medium',7)`,
        [caseId],
      );
      await client.query(
        `INSERT INTO public.evidence (id,case_id,user_id,uploaded_by,evidence_type,title,file_name,file_type,file_size,file_url,hash,status,metadata)
         VALUES ($1,$2,7,7,'video','Multimodal writer scratch fixture','fixture.mp4','video/mp4',64,'scratch-only',$3,'processing_queued',$4::jsonb)`,
        [evidenceId, caseId, sourceRevision, JSON.stringify({ source_revision: sourceRevision })],
      );

      const transactionAdapter: EvidenceMultimodalExecuteV1 = {
        execute: async (query) => {
          const compiled = dialect.sqlToQuery(query);
          const result = await client.query(compiled.sql, compiled.params);
          return { rows: result.rows as Array<Record<string, unknown>> };
        },
      };
      const database: EvidenceMultimodalDatabaseV1 = {
        execute: transactionAdapter.execute,
        // The outer Client transaction owns BEGIN/ROLLBACK; this adapter keeps all writer statements
        // on that same connection so the integration test can prove rollback cleanup.
        transaction: async <T>(operation: (tx: EvidenceMultimodalExecuteV1) => Promise<T>) => operation(transactionAdapter),
      };

      const persisted = await persistEvidenceMultimodalVectorV1(database, input);
      expect(persisted).toMatchObject({ outputSha256 });
      const readback = await client.query<{
        vector_count: string;
        outbox_count: string;
        dimension: number;
        outbox_status: string;
        outbox_lane: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM public.evidence_multimodal_vectors WHERE evidence_id=$1) AS vector_count,
          (SELECT count(*)::text FROM public.evidence_multimodal_vector_projection_outbox WHERE evidence_multimodal_vector_id=$2) AS outbox_count,
          (SELECT vector_dims(embedding) FROM public.evidence_multimodal_vectors WHERE id=$2) AS dimension,
          (SELECT status FROM public.evidence_multimodal_vector_projection_outbox WHERE evidence_multimodal_vector_id=$2) AS outbox_status,
          (SELECT projection_lane FROM public.evidence_multimodal_vector_projection_outbox WHERE evidence_multimodal_vector_id=$2) AS outbox_lane
      `, [evidenceId, persisted.id]);
      expect(readback.rows[0]).toEqual({
        vector_count: '1', outbox_count: '1', dimension: 768,
        outbox_status: 'PENDING', outbox_lane: 'evidence_multimodal_semantic_768',
      });

      await client.query('ROLLBACK');
      transactionStarted = false;
      const rolledBack = await client.query<{ vectors_table: string | null; outbox_table: string | null; fixture_rows: string }>(`
        SELECT to_regclass('public.evidence_multimodal_vectors')::text AS vectors_table,
          to_regclass('public.evidence_multimodal_vector_projection_outbox')::text AS outbox_table,
          (SELECT count(*)::text FROM public.evidence WHERE id=$1) AS fixture_rows
      `, [evidenceId]);
      expect(rolledBack.rows[0]).toEqual({ vectors_table: null, outbox_table: null, fixture_rows: '0' });
    } finally {
      if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
      await client.end().catch(() => undefined);
    }
  }, 30_000);

	it.skipIf(!modelDir)('reads an actual Q8 EmbeddingGemma 2 image vector back from PostgreSQL and its outbox, then rolls back', async () => {
		const connectionUrl = new URL(ENV.DATABASE_URL);
		if (!['127.0.0.1', 'localhost'].includes(connectionUrl.hostname) || (connectionUrl.port && connectionUrl.port !== '5434')) {
			throw new Error('SCRATCH_DATABASE_MUST_BE_LOCAL_PG18');
		}
		connectionUrl.pathname = `/${SCRATCH_DATABASE}`;
		const client = new Client({ connectionString: connectionUrl.toString() });
		const dialect = new PgDialect();
		const evidenceId = randomUUID();
		const caseId = randomUUID();
		const bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#6c533a' } }).png().toBuffer();
		const sourceRevision = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
		const analysis = {
			schema: 'atlas.evidence-visual-analysis.v1',
			authority: 'OBSERVATION_ONLY',
			sourceRevision,
			status: 'PARTIAL',
			objectDetections: [],
			layoutRegions: [],
			visionSummary: null,
			visionFindings: [],
			visionTags: [],
			depthMap: null,
			stageErrors: ['fixture-only analysis adapter'],
		} as const;
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
			const ddl = await readFile(resolve(
				process.cwd(),
				'../sveltekit-frontend/drizzle/manual/20261113_evidence_multimodal_vectors_v1_DRAFT.sql',
			), 'utf8');
			await client.query(ddl);
			await client.query(
				`INSERT INTO public.cases (id,title,status,priority,user_id) VALUES ($1,'Q8 image writer scratch fixture','open','medium',7)`,
				[caseId],
			);
			await client.query(
				`INSERT INTO public.evidence (id,case_id,user_id,uploaded_by,evidence_type,title,file_name,file_type,file_size,file_url,hash,status,metadata)
				 VALUES ($1,$2,7,7,'photo','Q8 image writer scratch fixture','fixture.png','image/png',$3,'scratch-only',$4,'processing_queued',$5::jsonb)`,
				[evidenceId, caseId, bytes.length, sourceRevision, JSON.stringify({ source_revision: sourceRevision })],
			);

			const transactionAdapter: EvidenceMultimodalExecuteV1 = {
				execute: async (query) => {
					const compiled = dialect.sqlToQuery(query);
					const result = await client.query(compiled.sql, compiled.params);
					return { rows: result.rows as Array<Record<string, unknown>> };
				},
			};
			const database: EvidenceMultimodalDatabaseV1 = {
				execute: transactionAdapter.execute,
				transaction: async <T>(operation: (tx: EvidenceMultimodalExecuteV1) => Promise<T>) => operation(transactionAdapter),
			};
			const result = await processEvidenceImageCanonicalV1({
				evidenceId,
				caseId,
				sourceRevision,
				contentType: 'image/png',
				fileName: 'fixture.png',
				bytes,
			}, {
				modelDir,
				analyze: async () => ({ ...analysis }),
				embed: embedEvidenceImageWithEmbeddingGemma2OnnxV1,
				persist: async (_appDatabase, input) => persistEvidenceMultimodalVectorV1(database, input),
			});
			expect(result).toMatchObject({
				chunkCount: 1,
				persistedCount: 1,
				sourceRevision,
				representationId: 'evidence_multimodal_semantic_768',
				canonicalStore: 'postgresql.evidence_multimodal_vectors',
			});

			const readback = await client.query<{
				vector_count: string;
				outbox_count: string;
				dimension: number;
				model: string;
				model_output_review_state: string;
				outbox_status: string;
			}>(`
				SELECT
				  (SELECT count(*)::text FROM public.evidence_multimodal_vectors WHERE evidence_id=$1) AS vector_count,
				  (SELECT count(*)::text FROM public.evidence_multimodal_vector_projection_outbox WHERE evidence_multimodal_vector_id=$2) AS outbox_count,
				  (SELECT vector_dims(embedding) FROM public.evidence_multimodal_vectors WHERE id=$2) AS dimension,
				  (SELECT model FROM public.evidence_multimodal_vectors WHERE id=$2) AS model,
				  (SELECT metadata->>'modelOutputReviewState' FROM public.evidence_multimodal_vectors WHERE id=$2) AS model_output_review_state,
				  (SELECT status FROM public.evidence_multimodal_vector_projection_outbox WHERE evidence_multimodal_vector_id=$2) AS outbox_status
			`, [evidenceId, result.vectorId]);
			expect(readback.rows[0]).toMatchObject({
				vector_count: '1',
				outbox_count: '1',
				dimension: 768,
				model: expect.stringContaining(':q8'),
				model_output_review_state: 'UNREVIEWED_PROPOSAL',
				outbox_status: 'PENDING',
			});

			await client.query('ROLLBACK');
			transactionStarted = false;
			const rolledBack = await client.query<{ vectors_table: string | null; outbox_table: string | null; fixture_rows: string }>(`
				SELECT to_regclass('public.evidence_multimodal_vectors')::text AS vectors_table,
				  to_regclass('public.evidence_multimodal_vector_projection_outbox')::text AS outbox_table,
				  (SELECT count(*)::text FROM public.evidence WHERE id=$1) AS fixture_rows
			`, [evidenceId]);
			expect(rolledBack.rows[0]).toEqual({ vectors_table: null, outbox_table: null, fixture_rows: '0' });
		} finally {
			if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
			await client.end().catch(() => undefined);
		}
	}, 120_000);
});
