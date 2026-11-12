import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { ENV } from '$lib/server/env.server.js';
import {
	ANALYSIS_JOB_PROGRESS_STAGES_V1,
	createAnalysisJobProgressEventWriterV1,
} from './analysis-job-progress-events-v1.js';

const enabled = process.env.ATLAS_SSE_SCRATCH_DB_TEST === '1';
const SCRATCH_DATABASE = 'legal_ai_live_integration_scratch';

describe.skipIf(!enabled)('analysis job progress events against disposable PostgreSQL', () => {
	it('writes worker stages and replays lifecycle events inside a rolled-back transaction', async () => {
		const connectionUrl = new URL(ENV.DATABASE_URL);
		if (
			!['127.0.0.1', 'localhost'].includes(connectionUrl.hostname) ||
			(connectionUrl.port && connectionUrl.port !== '5434')
		) {
			throw new Error('SCRATCH_DATABASE_MUST_BE_LOCAL_PG18');
		}
		connectionUrl.pathname = `/${SCRATCH_DATABASE}`;
		const client = new Client({ connectionString: connectionUrl.toString() });
		const dialect = new PgDialect();
		const caseId = randomUUID();
		const evidenceId = randomUUID();
		const jobId = randomUUID();
		const sourceRevision = `sha256:${'a'.repeat(64)}`;
		let transactionStarted = false;

		try {
			try {
				await client.connect();
			} catch {
				throw new Error('SCRATCH_DATABASE_CONNECTION_FAILED');
			}
			const identity = await client.query<{
				database_name: string;
				server_version: string;
				vector_version: string | null;
				prior_table: string | null;
			}>({
				text: `
					SELECT current_database() AS database_name,
					       current_setting('server_version') AS server_version,
					       (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS vector_version,
					       to_regclass('public.analysis_job_events')::text AS prior_table
				`,
			});
			expect(identity.rows[0]).toMatchObject({
				database_name: SCRATCH_DATABASE,
				server_version: expect.stringMatching(/^18\./),
				vector_version: '0.8.3',
				prior_table: null,
			});

			await client.query('BEGIN');
			transactionStarted = true;
			const migration = await readFile(
				resolve(process.cwd(), 'drizzle/manual/20261111_analysis_job_event_history_v1.sql'),
				'utf8',
			);
			await client.query(migration);

			await client.query(
				`INSERT INTO public.cases (id,title,status,priority,user_id) VALUES ($1,'SSE integration fixture','open','medium',7)`,
				[caseId],
			);

			await client.query(
				`INSERT INTO public.evidence (id,case_id,user_id,uploaded_by,evidence_type,title,description,file_name,file_type,file_size,file_url,hash,status,metadata) VALUES ($1,$2,7,7,'document','SSE integration fixture','scratch-only','scratch-evidence.pdf','application/pdf',32,'scratch-only',$3,'processing_queued',$4::jsonb)`,
				[evidenceId, caseId, sourceRevision, JSON.stringify({ source_revision: sourceRevision })],
			);
			await client.query(
				`INSERT INTO public.analysis_jobs (id,evidence_id,case_id,job_type,status,progress,result) VALUES ($1,$2,$3,'upload_pipeline','queued','0',$4::jsonb)`,
				[jobId, evidenceId, caseId, JSON.stringify({ caseId, sourceSha256: sourceRevision })],
			);
			await client.query(`UPDATE public.analysis_jobs SET status='running',progress='10' WHERE id=$1`, [jobId]);

			const recordStage = createAnalysisJobProgressEventWriterV1({
				execute: async (query) => {
					const compiled = dialect.sqlToQuery(query);
					return client.query(compiled.sql, compiled.params);
				},
			});
			for (const stage of ANALYSIS_JOB_PROGRESS_STAGES_V1.slice(1)) {
				await expect(recordStage(jobId, stage)).resolves.toBe(true);
			}
			await client.query(`UPDATE public.analysis_jobs SET status='completed',progress='100' WHERE id=$1`, [jobId]);

			const events = await client.query<{
				event_seq: string;
				event_id: string;
				evidence_id: string;
				case_id: string;
				stage: string;
				status: string;
						source_revision: string;
			}>(
				`SELECT event_seq::text,event_id::text,evidence_id::text,case_id::text,stage,status,source_revision
				 FROM public.analysis_job_events WHERE job_id=$1 ORDER BY event_seq`,
				[jobId],
			);
			expect(events.rows.map((event) => event.status)).toEqual([
				'queued', 'running', 'running', 'running', 'running', 'running', 'completed',
			]);
			expect(events.rows.map((event) => event.stage)).toEqual([
				'queued', 'running', ...ANALYSIS_JOB_PROGRESS_STAGES_V1.slice(1), 'completed',
			]);
			expect(new Set(events.rows.map((event) => event.event_id)).size).toBe(events.rows.length);
			expect(events.rows.every((event) =>
					event.case_id === caseId && event.evidence_id === evidenceId && event.source_revision === sourceRevision,
			)).toBe(true);

			const cursor = events.rows[1]!.event_seq;
			const replay = await client.query<{ stage: string; status: string }>(
				`SELECT stage,status FROM public.analysis_job_events WHERE job_id=$1 AND event_seq>$2::bigint ORDER BY event_seq`,
				[jobId, cursor],
			);
			expect(replay.rows.map((event) => event.stage)).toEqual([
				...ANALYSIS_JOB_PROGRESS_STAGES_V1.slice(1), 'completed',
			]);

			// Exercise the real SvelteKit handler and shared case-access helper against
			// this transaction-bound PostgreSQL client. Only the connection module is
			// redirected; no app database pool or production service is used.
			vi.resetModules();
			vi.doMock('$lib/server/db/client.js', () => ({
				db: drizzle(client),
				pgRows: (result: { rows: unknown[] }) => result.rows,
			}));
			try {
				const { GET } = await import('../../../routes/api/cases/[caseId]/evidence/jobs/[jobId]/events/+server.js');
				const makeEvent = (actorId: number, cursor?: string, signal?: AbortSignal) => GET({
					params: { caseId, jobId },
					locals: { user: { id: actorId } },
					request: new Request(`http://localhost/api/cases/${caseId}/evidence/jobs/${jobId}/events`, {
						headers: cursor ? { 'last-event-id': cursor } : undefined,
						signal,
					}),
				} as never);

				const authorizedResponse = await makeEvent(7);
				expect(authorizedResponse.status).toBe(200);
				let unrelatedEventLoopWorkRan = false;
				setImmediate(() => { unrelatedEventLoopWorkRan = true; });
				const authorizedBody = await authorizedResponse.text();
				expect(unrelatedEventLoopWorkRan).toBe(true);
				expect(authorizedBody).toContain('"status":"queued"');
				expect(authorizedBody).toContain('"status":"running"');
				expect(authorizedBody).toContain('"status":"completed"');
				expect(authorizedBody).toContain(`"caseId":"${caseId}"`);
				expect(authorizedBody).toContain(`"sourceRevision":"${sourceRevision}"`);
				expect(authorizedBody).not.toContain('SSE integration fixture');

				const afterQueued = await makeEvent(7, events.rows[0]!.event_seq);
				const resumedBody = await afterQueued.text();
				expect(resumedBody).not.toContain('"status":"queued"');
				expect(resumedBody).toContain('"status":"running"');
				expect(resumedBody).toContain('"status":"completed"');

				const terminalCursor = events.rows.at(-1)!.event_seq;
				const openIdleStream = async () => {
					const controller = new AbortController();
					const response = await makeEvent(7, terminalCursor, controller.signal);
					expect(response.status).toBe(200);
					const reader = response.body!.getReader();
					const retryHint = await reader.read();
					expect(new TextDecoder().decode(retryHint.value)).toMatch(/^retry: [2-5]\d{3}\n\n$/);
					return { controller, reader };
				};
				const idleStreamA = await openIdleStream();
				const idleStreamB = await openIdleStream();
				const limitedResponse = await makeEvent(7, terminalCursor);
				expect(limitedResponse.status).toBe(429);
				const pendingRead = idleStreamA.reader.read();
				idleStreamA.controller.abort();
				await expect(pendingRead).resolves.toMatchObject({ done: true });
				const idleStreamC = await openIdleStream();
				idleStreamB.controller.abort();
				await expect(idleStreamB.reader.read()).resolves.toMatchObject({ done: true });
				idleStreamC.controller.abort();
				await expect(idleStreamC.reader.read()).resolves.toMatchObject({ done: true });

				const unauthorizedResponse = await makeEvent(8);
				expect(unauthorizedResponse.status).toBe(404);
				expect(await unauthorizedResponse.text()).not.toContain(caseId);
			} finally {
				vi.doUnmock('$lib/server/db/client.js');
				vi.doUnmock('$lib/server/seaweed-client.js');
				vi.doUnmock('$lib/server/evidence-progress.js');
				vi.doUnmock('$lib/server/evidence/evidence-vector-outbox-readiness-v1.js');
				vi.doUnmock('sveltekit-superforms/server');
				vi.doUnmock('sveltekit-superforms/adapters');
				vi.resetModules();
			}

			await client.query('ROLLBACK');
			transactionStarted = false;
			const rolledBack = await client.query<{
				event_table: string | null;
				prune_column: boolean;
				job_rows: string;
				evidence_rows: string;
				case_rows: string;
			}>({
				text: `
					SELECT to_regclass('public.analysis_job_events')::text AS event_table,
					       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='analysis_jobs' AND column_name='progress_events_pruned_max_seq') AS prune_column,
					       (SELECT count(*)::text FROM public.analysis_jobs WHERE id=$1) AS job_rows,
					       (SELECT count(*)::text FROM public.evidence WHERE id=$2) AS evidence_rows,
					       (SELECT count(*)::text FROM public.cases WHERE id=$3) AS case_rows
				`,
				values: [jobId, evidenceId, caseId],
			});
			expect(rolledBack.rows[0]).toEqual({
				event_table: null,
				prune_column: false,
				job_rows: '0',
				evidence_rows: '0',
				case_rows: '0',
			});
		} finally {
			if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
			await client.end().catch(() => undefined);
		}
	}, 30_000);
});
