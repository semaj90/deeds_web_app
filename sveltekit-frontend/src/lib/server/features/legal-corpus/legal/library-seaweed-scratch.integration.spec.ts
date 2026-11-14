// @vitest-environment node
/**
 * Opt-in live integration against an explicitly disposable PostgreSQL 18 database
 * and SeaweedFS. The original object and scratch rows are retained for audit.
 * Run only with DATABASE_URL targeting legal_ai_live_integration_scratch and
 * ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST=1.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { parsePdfBuffer } from '$lib/server/pdf/pdf-parser.js';
import { extractTextHybrid } from '$lib/server/ocr/hybrid.js';
import { SourceOffsetTableV1 } from './utf16-utf8-span-bridge-v1.js';
import { libraryOcrInputNameV1 } from './library-upload-format-v1.js';

const h = vi.hoisted(() => ({
	generateEmbeddings: vi.fn(async (texts: string[]) => ({
		vectors: texts.map(() => Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0))),
		model: 'scratch-fixture-only',
		dimension: 768,
		source: 'fixture',
		modelArtifactRevision: 'scratch-fixture-v1',
		totalMs: 0,
	})),
	batchUpsert: vi.fn(async () => ({ status: 'fixture-only' })),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({ generateEmbeddings: h.generateEmbeddings }));
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({ qdrant: { batchUpsert: h.batchUpsert } }));
vi.mock('$lib/server/neo4j-driver.js', () => ({
	getNeo4jDriver: () => ({ session: () => ({ run: vi.fn(), close: vi.fn() }) }),
}));

let POST: typeof import('../../../../../routes/api/library/upload/+server.js').POST;
let getPdf: typeof import('../../../../../routes/api/library/documents/[documentId]/pdf/+server.js').GET;
let getImage: typeof import('../../../../../routes/api/library/documents/[documentId]/image/+server.js').GET;
let getChunks: typeof import('../../../../../routes/api/library/documents/[documentId]/chunks/+server.js').GET;
let pool: typeof import('$lib/server/db/client.js').pool;
let getSeaweedFile: typeof import('$lib/server/seaweed-client.js').getSeaweedFile;
let claimLibraryIngestionJobByIdV1: typeof import('./library-ingestion-queue-v1.js').claimLibraryIngestionJobByIdV1;
let reconcileLibraryDocumentParseTaskV1: typeof import('./library-ingestion-queue-v1.js').reconcileLibraryDocumentParseTaskV1;
let assertLibraryIngestionLeaseV1: typeof import('./library-ingestion-queue-v1.js').assertLibraryIngestionLeaseV1;
let runIngestionPipeline: typeof import('./ingestion-worker.js').runIngestionPipeline;
let createLibraryCitationContextManifestV1: typeof import('$lib/server/library/library-citation-provenance-v1.js').createLibraryCitationContextManifestV1;
let verifyLibraryCitationReferencesV1: typeof import('$lib/server/library/library-citation-provenance-v1.js').verifyLibraryCitationReferencesV1;

const enabled = process.env['ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST'] === '1';
const scratchDescribe = enabled ? describe : describe.skip;
const scratchBucket = process.env['MINIO_LIBRARY_BUCKET'] ?? 'legal-library';

async function claimFromChildProcess(jobId: string, holdLease: boolean) {
	const script = `
		const queue = await import('./src/lib/server/features/legal-corpus/legal/library-ingestion-queue-v1.ts');
		const db = await import('./src/lib/server/db/client.ts');
		const job = await queue.claimLibraryIngestionJobByIdV1(${JSON.stringify(jobId)}, 120);
		if (!job) { console.error('SCRATCH_CHILD_NO_JOB'); await db.pool.end(); process.exit(4); }
		console.log('SCRATCH_CHILD_CLAIM=' + JSON.stringify(job));
		if (process.env.ATLAS_CHILD_HOLD_LEASE === '1') setInterval(() => {}, 1000);
		else await db.pool.end();
	`;
	const child = spawn(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '-e', script], {
		cwd: process.cwd(),
		env: { ...process.env, ATLAS_CHILD_HOLD_LEASE: holdLease ? '1' : '0' },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const exitPromise = once(child, 'exit');
	let output = '';
	let stderr = '';
	child.stdout.setEncoding('utf8').on('data', (data: string) => { output += data; });
	child.stderr.setEncoding('utf8').on('data', (data: string) => { stderr += data; });
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error(`SCRATCH_CHILD_CLAIM_TIMEOUT: ${stderr}`)), 20_000);
		const inspect = () => {
			const line = output.split(/\r?\n/).find((entry) => entry.startsWith('SCRATCH_CHILD_CLAIM='));
			if (line) {
				clearTimeout(timeout);
				resolve();
			}
		};
		child.stdout.on('data', inspect);
		child.once('error', (cause) => {
			clearTimeout(timeout);
			reject(cause);
		});
		child.once('exit', (code) => {
			inspect();
			if (!output.includes('SCRATCH_CHILD_CLAIM=') && code !== null) {
				clearTimeout(timeout);
				reject(new Error(`SCRATCH_CHILD_EXIT_${code}: ${stderr}`));
			}
		});
	});
	const line = output.split(/\r?\n/).find((entry) => entry.startsWith('SCRATCH_CHILD_CLAIM='));
	if (!line) throw new Error(`SCRATCH_CHILD_CLAIM_MISSING: ${stderr}`);
	return {
		child,
		exitPromise,
		claim: JSON.parse(line.slice('SCRATCH_CHILD_CLAIM='.length)) as {
			jobId: string; documentId: string; leaseToken: string; fencingToken: string; sourceHash: string;
		},
	};
}

async function runStandaloneWorkerOnceWithFixtureProviders(jobId: string) {
	const databaseUrl = new URL(process.env['DATABASE_URL'] ?? '');
	databaseUrl.pathname = '/legal_ai_live_integration_scratch';
	const child = spawn(process.execPath, [
		'--import', 'tsx/esm',
		'--import', './scripts/library-ingestion-worker-bootstrap.mjs',
	], {
		cwd: process.cwd(),
		env: {
			...process.env,
			DATABASE_URL: databaseUrl.toString(),
			ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST: '1',
			ATLAS_LIBRARY_INGESTION_FIXTURE_PROVIDERS: '1',
			ATLAS_LIBRARY_INGESTION_ONCE: '1',
			ATLAS_LIBRARY_INGESTION_JOB_ID: jobId,
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let stdout = '';
	let stderr = '';
	child.stdout.setEncoding('utf8').on('data', (data: string) => { stdout += data; });
	child.stderr.setEncoding('utf8').on('data', (data: string) => { stderr += data; });
	const [exitCode, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve, reject) => {
		const timeout = setTimeout(() => {
			child.kill();
			reject(new Error(`SCRATCH_WORKER_CLI_TIMEOUT: ${stderr}`));
		}, 60_000);
		child.once('error', (error) => { clearTimeout(timeout); reject(error); });
		child.once('exit', (code, exitSignal) => { clearTimeout(timeout); resolve([code, exitSignal]); });
	});
	return { exitCode, signal, stdout, stderr };
}

async function makePdfFixture(runId: string): Promise<Buffer> {
	const pdf = await PDFDocument.create();
	const page = pdf.addPage([612, 792]);
	const font = await pdf.embedFont(StandardFonts.Helvetica);
	for (let line = 0; line < 8; line++) {
		page.drawText(`SYNTHETIC SCRATCH PDF ${runId}. Legal source span alignment section ${line + 1}.`, {
			x: 48,
			y: 730 - line * 22,
			size: 11,
			font,
		});
	}
	return Buffer.from(await pdf.save());
}

async function makeImageFixture(runId: string): Promise<Buffer> {
	const svg = Buffer.from(`<svg width="1800" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="40" y="150" font-family="Arial" font-size="72" fill="black">SCRATCH IMAGE RECEIPT 4821 ${runId}</text></svg>`);
	return sharp(svg).png().toBuffer();
}

async function uploadFixture(mimeType: string, fileName: string, title: string, bytes: Buffer) {
	const request = new Request('http://scratch.local/api/library/upload', {
		method: 'POST',
		headers: {
			'content-type': mimeType,
			'x-library-byte-length': String(bytes.byteLength),
			'x-library-title': title,
			'x-file-name': encodeURIComponent(fileName),
		},
		body: Uint8Array.from(bytes),
	});
	const response = await POST({
		request,
		locals: { user: { id: '2147483000' } },
		url: new URL(request.url),
	} as never);
	const payload = await response.json() as { success?: boolean; documentId?: string; jobId?: string; sourceHash?: string; error?: string };
	expect(response.status, payload.error).toBe(202);
	expect(payload.success).toBe(true);
	return payload as { success: true; documentId: string; jobId: string; sourceHash: string };
}

async function processQueuedFixture(
	upload: { documentId: string; jobId: string; sourceHash: string },
	expectedText: string,
	kind: 'pdf' | 'image',
) {
	const dispatch = await pool.query(
		`SELECT task.id::text AS task_id, task.command_type, task.status AS task_status,
		        task.payload AS task_payload, outbox.routing_key, outbox.exchange,
		        outbox.payload AS outbox_payload, outbox.delivered_at
		 FROM workflow_tasks task
		 JOIN workflow_outbox outbox ON outbox.task_id = task.id
		 WHERE task.id = $1::uuid AND task.command_type = 'document.parse'`,
		[upload.jobId],
	);
	expect(dispatch.rows).toHaveLength(1);
	expect(dispatch.rows[0]).toMatchObject({
		task_id: upload.jobId,
		command_type: 'document.parse',
		task_status: 'queued',
		routing_key: 'atlas.work.document.parse',
		exchange: 'atlas.tasks.v1',
		delivered_at: null,
	});
	expect(dispatch.rows[0]?.['task_payload']).toMatchObject({
		jobId: upload.jobId,
		documentId: upload.documentId,
		sourceSha256: upload.sourceHash,
	});
	expect(dispatch.rows[0]?.['outbox_payload']).toMatchObject({
		command: { commandType: 'document.parse', taskId: upload.jobId, targetWorkerClass: 'library-ingestion-worker' },
		payload: { jobId: upload.jobId, documentId: upload.documentId, sourceSha256: upload.sourceHash },
	});
	const claimed = await claimLibraryIngestionJobByIdV1(upload.jobId, 120);
	expect(claimed).toMatchObject({ documentId: upload.documentId, jobId: upload.jobId, sourceHash: upload.sourceHash });
	if (!claimed) throw new Error('SCRATCH_FIXTURE_JOB_NOT_CLAIMED');
	const workerStarted = performance.now();
	const result = await runIngestionPipeline({
		documentId: claimed.documentId,
		jobId: claimed.jobId,
		leaseToken: claimed.leaseToken,
		fencingToken: claimed.fencingToken,
		sourceHash: claimed.sourceHash,
	});
	await reconcileLibraryDocumentParseTaskV1(upload.jobId);
	const workerMs = performance.now() - workerStarted;
	const readback = await pool.query(
		`SELECT d.source_hash, d.minio_key, d.processing_status, d.page_count,
		        j.status AS job_status, j.progress, j.metrics_json,
		        count(DISTINCT n.id)::int AS node_count,
		        count(DISTINCT ch.id)::int AS chunk_count,
	        bool_and(ch.chunk_hash ~ '^[a-f0-9]{64}$' AND ch.parser_revision IS NOT NULL
	                 AND ch.char_offset_unit = 'utf16_code_units') AS lineage_ok,
	        json_agg(json_build_object('id', ch.id::text, 'text', ch.chunk_text, 'charStart', ch.char_start,
	                 'charEnd', ch.char_end, 'offsetUnit', ch.char_offset_unit,
	                 'pageStart', ch.page_start, 'pageEnd', ch.page_end)
	                 ORDER BY n.node_path, ch.chunk_index) FILTER (WHERE ch.id IS NOT NULL) AS chunks,
	        string_agg(ch.chunk_text, E'\\n' ORDER BY n.node_path, ch.chunk_index) AS chunk_text
		 FROM library_documents d
		 JOIN ingestion_jobs j ON j.document_id = d.id
		 LEFT JOIN legal_nodes n ON n.document_id = d.id
		 LEFT JOIN legal_chunks ch ON ch.legal_node_id = n.id
		 WHERE d.id = $1::uuid AND j.id = $2::uuid
		 GROUP BY d.id, j.id`,
		[upload.documentId, upload.jobId],
	);
	const row = readback.rows[0] as Record<string, unknown> | undefined;
	expect(row).toBeTruthy();
	expect(row).toMatchObject({
		source_hash: upload.sourceHash,
		processing_status: 'complete',
		job_status: 'complete',
		lineage_ok: true,
	});
	expect(Number(row?.['node_count'])).toBeGreaterThan(0);
	expect(Number(row?.['chunk_count'])).toBeGreaterThan(0);
	expect(String(row?.['chunk_text'])).toContain(expectedText);
	const completedDispatch = await pool.query(
		`SELECT task.status, task.result->>'sourceHash' AS source_hash
		 FROM workflow_tasks task WHERE task.id = $1::uuid AND task.command_type = 'document.parse'`,
		[upload.jobId],
	);
	expect(completedDispatch.rows[0]).toMatchObject({ status: 'succeeded', source_hash: upload.sourceHash });

	const storedBytes = await getSeaweedFile(scratchBucket, String(row?.['minio_key']));
	const readbackHash = createHash('sha256').update(storedBytes).digest('hex');
	expect(readbackHash).toBe(upload.sourceHash);
	const extracted = kind === 'pdf'
		? (await parsePdfBuffer(storedBytes)).text
		: (await extractTextHybrid(storedBytes, libraryOcrInputNameV1(upload.documentId, 'image/png'))).text;
	const offsetTable = new SourceOffsetTableV1(extracted);
	const utf8 = Buffer.from(extracted, 'utf8');
	const chunks = row?.['chunks'] as Array<{ id: string; text: string; charStart: number; charEnd: number; offsetUnit: string }>;
	for (const chunk of chunks) {
		const dual = offsetTable.resolveDualSpan(Number(chunk.charStart), Number(chunk.charEnd));
		expect(chunk.offsetUnit).toBe('utf16_code_units');
		expect(dual.text).toBe(chunk.text);
		expect(extracted.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.text);
		expect(utf8.subarray(dual.utf8ByteStart, dual.utf8ByteEnd).toString('utf8')).toBe(chunk.text);
	}
	const chunkId = chunks[0]?.id;
	expect(chunkId).toBeTruthy();
	const actorLocals = { user: { id: '2147483000' } };
	const apiParams = { documentId: upload.documentId };
	if (kind === 'pdf') {
		const rangeRequest = new Request(`http://scratch.local/api/library/documents/${upload.documentId}/pdf`, {
			headers: { range: 'bytes=0-15' },
		});
		const rangeResponse = await getPdf({
			params: apiParams,
			locals: actorLocals,
			request: rangeRequest,
			url: new URL(rangeRequest.url),
		} as never);
		expect(rangeResponse.status).toBe(206);
		expect(rangeResponse.headers.get('content-range')).toBe(`bytes 0-15/${storedBytes.byteLength}`);
		expect(Buffer.from(await rangeResponse.arrayBuffer())).toEqual(storedBytes.subarray(0, 16));
	} else {
		const imageResponse = await getImage({ params: apiParams, locals: actorLocals } as never);
		expect(imageResponse.status).toBe(200);
		expect(imageResponse.headers.get('content-type')).toBe('image/png');
		expect(Buffer.from(await imageResponse.arrayBuffer())).toEqual(storedBytes);
	}
	const chunksUrl = new URL(`http://scratch.local/api/library/documents/${upload.documentId}/chunks?page=1&limit=50`);
	const chunksResponse = await getChunks({ params: apiParams, locals: actorLocals, url: chunksUrl } as never);
	expect(chunksResponse.status).toBe(200);
	const chunksPayload = await chunksResponse.json() as { chunks?: Array<{ id: string; content: string; char_start: number; char_end: number }> };
	const routeChunk = chunksPayload.chunks?.find((candidate) => candidate.id === chunkId);
	expect(routeChunk?.content).toBe(chunks[0]?.text);
	expect(Number(routeChunk?.char_start)).toBe(Number(chunks[0]?.charStart));
	expect(Number(routeChunk?.char_end)).toBe(Number(chunks[0]?.charEnd));
	const foreignLocals = { user: { id: '2147483001' } };
	if (kind === 'pdf') {
		const foreignPdfRequest = new Request(`http://scratch.local/api/library/documents/${upload.documentId}/pdf`, {
			headers: { range: 'bytes=0-15' },
		});
		await expect(getPdf({
			params: apiParams,
			locals: foreignLocals,
			request: foreignPdfRequest,
			url: new URL(foreignPdfRequest.url),
		} as never)).rejects.toMatchObject({ status: 404 });
	} else {
		await expect(getImage({ params: apiParams, locals: foreignLocals } as never))
			.rejects.toMatchObject({ status: 404 });
	}
	const deniedChunks = await getChunks({ params: apiParams, locals: foreignLocals, url: chunksUrl } as never);
	expect(deniedChunks.status).toBe(404);
	expect(await deniedChunks.json()).toMatchObject({ error: 'Document not found' });
	const citationManifest = await createLibraryCitationContextManifestV1({
		actorId: '2147483000',
		candidates: [{ ordinal: 1, chunkId: String(chunkId) }],
	});
	const citation = verifyLibraryCitationReferencesV1(citationManifest, [{ ordinal: 1, chunkId: String(chunkId) }]).get(1);
	expect(citation).toMatchObject({
		documentId: upload.documentId,
		sourceHash: upload.sourceHash,
		chunkId,
		charOffsetUnit: 'utf16_code_units',
		pageStart: Number(chunks[0]?.['pageStart']),
		pageEnd: Number(chunks[0]?.['pageEnd']),
		charStart: Number(chunks[0]?.['charStart']),
		charEnd: Number(chunks[0]?.['charEnd']),
		quote: chunks[0]?.text,
	});
	return {
		documentId: upload.documentId,
		jobId: upload.jobId,
		sourceHash: upload.sourceHash,
		storedBytes: storedBytes.byteLength,
		nodeCount: Number(row?.['node_count']),
		chunkCount: Number(row?.['chunk_count']),
		pageCount: Number(row?.['page_count']),
		workerMs: Math.round(workerMs),
		jobMetrics: row?.['metrics_json'],
	};
}

scratchDescribe('real upload → SeaweedFS → PostgreSQL queue/worker → lineage readback', () => {
	beforeAll(async () => {
		// Retarget before importing the database client or upload route. An opt-in
		// mistake must not even open a connection to the canonical database.
		const { loadRuntimeEnv } = await import('$lib/server/config/load-runtime-env.js');
		loadRuntimeEnv({ mode: 'development' });
		const databaseUrl = new URL(process.env['DATABASE_URL'] ?? '');
		databaseUrl.pathname = '/legal_ai_live_integration_scratch';
		process.env['DATABASE_URL'] = databaseUrl.toString();
		[
			{ POST },
			{ GET: getPdf },
			{ GET: getImage },
			{ GET: getChunks },
			{ pool },
			{ getSeaweedFile },
			{ claimLibraryIngestionJobByIdV1, reconcileLibraryDocumentParseTaskV1, assertLibraryIngestionLeaseV1 },
			{ runIngestionPipeline },
			{ createLibraryCitationContextManifestV1, verifyLibraryCitationReferencesV1 },
		] = await Promise.all([
			import('../../../../../routes/api/library/upload/+server.js'),
			import('../../../../../routes/api/library/documents/[documentId]/pdf/+server.js'),
			import('../../../../../routes/api/library/documents/[documentId]/image/+server.js'),
			import('../../../../../routes/api/library/documents/[documentId]/chunks/+server.js'),
			import('$lib/server/db/client.js'),
			import('$lib/server/seaweed-client.js'),
			import('./library-ingestion-queue-v1.js'),
			import('./ingestion-worker.js'),
			import('$lib/server/library/library-citation-provenance-v1.js'),
		]);
		const result = await pool.query('SELECT current_database() AS name, version() AS version');
		expect(result.rows[0]?.['name']).toBe('legal_ai_live_integration_scratch');
		expect(String(result.rows[0]?.['version'])).toContain('PostgreSQL 18');
	});

	it('processes a text PDF and an OCR image without invoking the configured embedding or graph services', async () => {
		const runId = randomUUID();
		const pdfTitle = `library-live-scratch-proof:${runId}:pdf`;
		const imageTitle = `library-live-scratch-proof:${runId}:image`;
		const markerCheck = await pool.query(
			`SELECT count(*)::int AS count FROM library_documents WHERE title = ANY($1::text[])`,
			[[pdfTitle, imageTitle]],
		);
		expect(markerCheck.rows[0]?.['count']).toBe(0);
		const pdfBytes = await makePdfFixture(runId);
		const imageBytes = await makeImageFixture(runId);
		const pdfUpload = await uploadFixture('application/pdf', 'synthetic-scratch.pdf', pdfTitle, pdfBytes);
		const pdfReceipt = await processQueuedFixture(pdfUpload, 'SYNTHETIC SCRATCH PDF', 'pdf');
		const imageUpload = await uploadFixture('image/png', 'synthetic-scratch.png', imageTitle, imageBytes);
		const imageReceipt = await processQueuedFixture(imageUpload, 'SCRATCH IMAGE RECEIPT', 'image');
		expect(h.generateEmbeddings).toHaveBeenCalled();
		expect(h.batchUpsert).toHaveBeenCalled();
		console.info('[library-seaweed-scratch-proof]', JSON.stringify({
			postgres: 'legal_ai_live_integration_scratch / PostgreSQL 18',
			embedding: 'fixture vectors only; external model not invoked',
			qdrant: 'mock projection only',
			neo4j: 'mock projection only',
			pdf: pdfReceipt,
			image: imageReceipt,
		}));
	});

	it('reclaims an expired database lease and rejects the stale fencing token', async () => {
		const runId = randomUUID();
		const title = `library-live-scratch-proof:${runId}:lease-recovery`;
		const upload = await uploadFixture('application/pdf', 'synthetic-lease-recovery.pdf', title, await makePdfFixture(runId));
		const first = await claimLibraryIngestionJobByIdV1(upload.jobId, 120);
		expect(first).toMatchObject({ documentId: upload.documentId, jobId: upload.jobId, fencingToken: '1' });
		if (!first) throw new Error('SCRATCH_FIXTURE_FIRST_LEASE_NOT_CLAIMED');
		const expired = await pool.query(
			`UPDATE ingestion_jobs SET lease_expires_at = now() - interval '1 second'
			 WHERE id = $1::uuid AND status = 'running' AND lease_token = $2::uuid AND fencing_token = $3::bigint`,
			[first.jobId, first.leaseToken, first.fencingToken],
		);
		expect(expired.rowCount).toBe(1);
		const reclaimed = await claimLibraryIngestionJobByIdV1(upload.jobId, 120);
		expect(reclaimed).toMatchObject({ documentId: upload.documentId, jobId: upload.jobId, fencingToken: '2' });
		if (!reclaimed) throw new Error('SCRATCH_FIXTURE_RECLAIM_NOT_CLAIMED');
		await expect(assertLibraryIngestionLeaseV1(first.jobId, first.leaseToken, first.fencingToken))
			.rejects.toThrow('LIBRARY_INGESTION_LEASE_LOST');
		await runIngestionPipeline({
			documentId: reclaimed.documentId,
			jobId: reclaimed.jobId,
			leaseToken: reclaimed.leaseToken,
			fencingToken: reclaimed.fencingToken,
			sourceHash: reclaimed.sourceHash,
		});
		await reconcileLibraryDocumentParseTaskV1(upload.jobId);
		const readback = await pool.query(
			`SELECT j.status, j.fencing_token, count(ch.id)::int AS chunks
			 FROM ingestion_jobs j JOIN legal_nodes n ON n.document_id = j.document_id
			 JOIN legal_chunks ch ON ch.legal_node_id = n.id WHERE j.id = $1::uuid
			 GROUP BY j.id`,
			[upload.jobId],
		);
		expect(readback.rows[0]).toMatchObject({ status: 'complete', fencing_token: '2', chunks: 1 });
	});

	it('reclaims a lease after the claiming Node process is terminated, then completes under a newer fence', async () => {
		const runId = randomUUID();
		const title = `library-live-scratch-proof:${runId}:process-recovery`;
		const upload = await uploadFixture('application/pdf', 'synthetic-process-recovery.pdf', title, await makePdfFixture(runId));
		const firstProcess = await claimFromChildProcess(upload.jobId, true);
		expect(firstProcess.claim).toMatchObject({ documentId: upload.documentId, jobId: upload.jobId, fencingToken: '1' });
		firstProcess.child.kill();
		await firstProcess.exitPromise;
		const afterTermination = await pool.query(
			`SELECT status, fencing_token FROM ingestion_jobs WHERE id = $1::uuid`,
			[upload.jobId],
		);
		expect(afterTermination.rows[0]).toMatchObject({ status: 'running', fencing_token: '1' });
		const expired = await pool.query(
			`UPDATE ingestion_jobs SET lease_expires_at = now() - interval '1 second'
			 WHERE id = $1::uuid AND status = 'running' AND lease_token = $2::uuid AND fencing_token = $3::bigint`,
			[firstProcess.claim.jobId, firstProcess.claim.leaseToken, firstProcess.claim.fencingToken],
		);
		expect(expired.rowCount).toBe(1);
		const secondProcess = await claimFromChildProcess(upload.jobId, false);
		await secondProcess.exitPromise;
		expect(secondProcess.claim).toMatchObject({ documentId: upload.documentId, jobId: upload.jobId, fencingToken: '2' });
		await runIngestionPipeline({ ...secondProcess.claim });
		await reconcileLibraryDocumentParseTaskV1(upload.jobId);
		const readback = await pool.query(
			`SELECT j.status, j.fencing_token, count(ch.id)::int AS chunks
			 FROM ingestion_jobs j JOIN legal_nodes n ON n.document_id = j.document_id
			 JOIN legal_chunks ch ON ch.legal_node_id = n.id WHERE j.id = $1::uuid GROUP BY j.id`,
			[upload.jobId],
		);
		expect(readback.rows[0]).toMatchObject({ status: 'complete', fencing_token: '2', chunks: 1 });
	});

	it('refuses fixture providers before worker import when the database is not the named scratch database', async () => {
		const databaseUrl = new URL(process.env['DATABASE_URL'] ?? '');
		databaseUrl.pathname = '/legal_ai_db';
		const child = spawn(process.execPath, [
			'--import', 'tsx/esm',
			'--import', './scripts/library-ingestion-worker-bootstrap.mjs',
		], {
			cwd: process.cwd(),
			env: {
				...process.env,
				DATABASE_URL: databaseUrl.toString(),
				ATLAS_LIBRARY_SEAWEED_SCRATCH_TEST: '1',
				ATLAS_LIBRARY_INGESTION_FIXTURE_PROVIDERS: '1',
				ATLAS_LIBRARY_INGESTION_ONCE: '1',
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stderr = '';
		child.stderr.setEncoding('utf8').on('data', (data: string) => { stderr += data; });
		const [exitCode, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve, reject) => {
			const timeout = setTimeout(() => {
				child.kill();
				reject(new Error(`SCRATCH_WORKER_FIXTURE_GUARD_TIMEOUT: ${stderr}`));
			}, 20_000);
			child.once('error', (error) => { clearTimeout(timeout); reject(error); });
			child.once('exit', (code, exitSignal) => { clearTimeout(timeout); resolve([code, exitSignal]); });
		});
		expect(exitCode).toBe(1);
		expect(signal).toBeNull();
		expect(stderr).toContain('LIBRARY_WORKER_FIXTURE_PROVIDERS_REFUSE_NON_SCRATCH_DATABASE');
		expect(stderr).not.toContain('[DB] Canonical target');
	});

	it('runs one uploaded PDF through the standalone worker CLI with scratch-only provider fixtures', async () => {
		const runId = randomUUID();
		const title = `library-live-scratch-proof:${runId}:standalone-worker`;
		const upload = await uploadFixture('application/pdf', 'standalone-worker-scratch.pdf', title, await makePdfFixture(runId));

		const worker = await runStandaloneWorkerOnceWithFixtureProviders(upload.jobId);
		expect(worker.exitCode, `stdout:\n${worker.stdout}\nstderr:\n${worker.stderr}`).toBe(0);
		expect(worker.signal).toBeNull();
		expect(worker.stdout).toContain('[library-ingestion-worker] started; concurrency=1');
		expect(worker.stdout).toContain(`"event":"claimed","jobId":"${upload.jobId}"`);
		expect(worker.stdout).toContain(`"event":"completed","jobId":"${upload.jobId}"`);
		expect(worker.stdout).toContain('[scratch-fixture] embedding provider called');
		expect(worker.stdout).toContain('[scratch-fixture] Qdrant projection called');
		expect(worker.stdout).toContain('[scratch-fixture] Neo4j projection called');
		expect(worker.stdout).toContain('[library-ingestion-worker] stopped');

		const readback = await pool.query(
			`SELECT d.source_hash, d.minio_key, d.processing_status,
			        j.status AS job_status, j.fencing_token,
			        count(DISTINCT n.id)::int AS node_count,
			        count(DISTINCT ch.id)::int AS chunk_count,
			        json_agg(json_build_object('text', ch.chunk_text, 'charStart', ch.char_start,
			          'charEnd', ch.char_end, 'offsetUnit', ch.char_offset_unit)
			          ORDER BY n.node_path, ch.chunk_index) FILTER (WHERE ch.id IS NOT NULL) AS chunks
			 FROM library_documents d
			 JOIN ingestion_jobs j ON j.document_id = d.id
			 LEFT JOIN legal_nodes n ON n.document_id = d.id
			 LEFT JOIN legal_chunks ch ON ch.legal_node_id = n.id
			 WHERE d.id = $1::uuid AND j.id = $2::uuid
			 GROUP BY d.id, j.id`,
			[upload.documentId, upload.jobId],
		);
		const row = readback.rows[0] as Record<string, unknown> | undefined;
		expect(row).toMatchObject({
			source_hash: upload.sourceHash,
			processing_status: 'complete',
			job_status: 'complete',
			fencing_token: '1',
		});
		expect(Number(row?.['node_count'])).toBeGreaterThan(0);
		expect(Number(row?.['chunk_count'])).toBeGreaterThan(0);
		const storedBytes = await getSeaweedFile(scratchBucket, String(row?.['minio_key']));
		expect(createHash('sha256').update(storedBytes).digest('hex')).toBe(upload.sourceHash);
		const extracted = (await parsePdfBuffer(storedBytes)).text;
		const offsetTable = new SourceOffsetTableV1(extracted);
		const chunks = row?.['chunks'] as Array<{ text: string; charStart: number; charEnd: number; offsetUnit: string }>;
		for (const chunk of chunks) {
			expect(chunk.offsetUnit).toBe('utf16_code_units');
			expect(extracted.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.text);
			expect(offsetTable.resolveDualSpan(chunk.charStart, chunk.charEnd).text).toBe(chunk.text);
		}
		expect(chunks.map((chunk) => chunk.text).join('\n')).toContain(`SYNTHETIC SCRATCH PDF ${runId}`);
		console.info('[library-standalone-worker-scratch-proof]', JSON.stringify({
			documentId: upload.documentId,
			jobId: upload.jobId,
			sourceSha256: upload.sourceHash,
			bytes: storedBytes.byteLength,
			fencingToken: row?.['fencing_token'],
			nodes: Number(row?.['node_count']),
			chunks: Number(row?.['chunk_count']),
			providers: 'fixture embedding, Qdrant, Neo4j modules only',
		}));
	});
});
