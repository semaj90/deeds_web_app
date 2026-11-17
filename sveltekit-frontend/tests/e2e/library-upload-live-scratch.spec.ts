import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import ts from 'typescript';
import { createServer as createViteServer, type ViteDevServer } from 'vite';

const scratchDatabase = 'legal_ai_live_integration_scratch';
const frontendRoot = resolve(import.meta.dirname, '../..');
const uploadClientPath = resolve(frontendRoot, 'src/lib/library/library-upload-client-v1.ts');

function browserModule(path: string, exportName: string, globalName: string): string {
	const source = readFileSync(path, 'utf8');
	const output = ts.transpileModule(source, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
	}).outputText;
	return `${output}\nwindow[${JSON.stringify(globalName)}] = ${exportName};`;
}

function assertScratchDatabase(): string {
	if (process.env['ATLAS_LIBRARY_PLAYWRIGHT_SCRATCH'] !== '1') {
		throw new Error('Set ATLAS_LIBRARY_PLAYWRIGHT_SCRATCH=1 to enable this scratch-only test.');
	}
	const databaseUrl = process.env['DATABASE_URL'];
	if (!databaseUrl) throw new Error('DATABASE_URL must point at the named scratch database.');
	const parsed = new URL(databaseUrl);
	if (parsed.pathname.replace(/^\//, '') !== scratchDatabase) {
		throw new Error(`Refusing browser upload test against database ${parsed.pathname.replace(/^\//, '')}.`);
	}
	return databaseUrl;
}

async function startRealUploadRouteHarness(): Promise<{ origin: string; close: () => Promise<void> }> {
	const vite: ViteDevServer = await createViteServer({
		configFile: resolve(frontendRoot, 'vite.config.ts'),
		root: frontendRoot,
		server: { middlewareMode: true, hmr: false },
		appType: 'custom',
	});
	try {
		const route = await vite.ssrLoadModule('/src/routes/api/library/upload/+server.ts') as {
			POST: (event: unknown) => Promise<Response>;
		};
		const server: Server = createServer(async (incoming, outgoing) => {
			if (incoming.method === 'GET' && incoming.url === '/') {
				outgoing.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
				outgoing.end('<!doctype html><meta charset="utf-8"><label>Evidence file<input id="evidence-file" type="file"></label><button id="upload">Upload</button><output id="status"></output>');
				return;
			}
			if (incoming.method !== 'POST' || incoming.url !== '/api/library/upload') {
				outgoing.writeHead(404).end();
				return;
			}
			try {
				const url = new URL(incoming.url, 'http://127.0.0.1');
				const request = new Request(url, {
					method: incoming.method,
					headers: incoming.headers as HeadersInit,
					body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
					duplex: 'half',
				} as RequestInit & { duplex: 'half' });
				const response = await route.POST({
					request,
					locals: { user: { id: '2147483000' } },
					url,
				} as never);
				outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
				outgoing.end(Buffer.from(await response.arrayBuffer()));
			} catch (error) {
				outgoing.writeHead(500, { 'content-type': 'application/json' });
				outgoing.end(JSON.stringify({ error: error instanceof Error ? error.message : 'HARNESS_ERROR' }));
			}
		});
		await new Promise<void>((resolveListen, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolveListen);
		});
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('UPLOAD_HARNESS_ADDRESS_UNAVAILABLE');
		return {
			origin: `http://127.0.0.1:${address.port}`,
			close: async () => {
				await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
				await vite.close();
			},
		};
	} catch (error) {
		await vite.close();
		throw error;
	}
}

test('headless browser upload reaches the real handler, SeaweedFS, and scratch PostgreSQL receipt', async ({ page }) => {
	const databaseUrl = assertScratchDatabase();
	process.env['OTEL_SDK_DISABLED'] = 'true';
	const harness = await startRealUploadRouteHarness();
	const runId = randomUUID();
	const title = `library-playwright-scratch:${runId}`;
	const pngBytes = Buffer.concat([Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=',
		'base64',
	), Buffer.from(`\n${runId}`, 'utf8')]);
	const expectedHash = createHash('sha256').update(pngBytes).digest('hex');
	const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
	try {
		const identity = await pool.query<{ database_name: string; server_version_num: string }>(
			`SELECT current_database() AS database_name, current_setting('server_version_num') AS server_version_num`,
		);
		expect(identity.rows[0]?.database_name).toBe(scratchDatabase);
		expect(identity.rows[0]?.server_version_num.startsWith('18')).toBe(true);

		await page.goto(harness.origin);
		await page.addScriptTag({ type: 'module', content: browserModule(uploadClientPath, 'uploadLibraryFileV1', '__uploadLibraryFileV1') });
		await page.evaluate(() => {
			const host = window as typeof window & {
				__uploadLibraryFileV1: (file: File, metadata: { title: string }) => Promise<Response>;
			};
			document.querySelector<HTMLButtonElement>('#upload')!.addEventListener('click', async () => {
				const file = document.querySelector<HTMLInputElement>('#evidence-file')!.files?.[0];
				if (!file) throw new Error('scratch fixture file was not selected');
				const response = await host.__uploadLibraryFileV1(file, { title: document.body.dataset.title ?? '' });
				const payload = await response.json() as { success?: boolean; documentId?: string; jobId?: string; sourceHash?: string; error?: string };
				document.querySelector<HTMLOutputElement>('#status')!.value = JSON.stringify({ status: response.status, ...payload });
			});
		});
		await page.locator('body').evaluate((body, value) => { body.dataset.title = value; }, title);
		await page.locator('#evidence-file').setInputFiles({ name: `proof-${runId}.png`, mimeType: 'image/png', buffer: pngBytes });
		const uploadStarted = Date.now();
		await page.getByRole('button', { name: 'Upload' }).click();
		const status = page.locator('#status');
		await expect.poll(async () => status.evaluate((element) => (element as HTMLOutputElement).value)).not.toBe('');
		const response = JSON.parse(await status.evaluate((element) => (element as HTMLOutputElement).value)) as {
			status: number; success?: boolean; documentId?: string; jobId?: string; sourceHash?: string; error?: string;
		};
		expect(response.status, response.error).toBe(202);
		expect(response.success).toBe(true);
		expect(response.sourceHash).toBe(expectedHash);
		if (!response.documentId || !response.jobId) throw new Error('upload response omitted durable identifiers');

		const readback = await pool.query<{
			document_id: string; job_id: string; source_hash: string; mime_type: string; minio_key: string;
			task_status: string; command_type: string; outbox_task_id: string;
		}>(
			`SELECT d.id::text AS document_id, j.id::text AS job_id, d.source_hash, d.mime_type, d.minio_key,
			        task.status AS task_status, task.command_type, outbox.task_id::text AS outbox_task_id
			 FROM library_documents d
			 JOIN ingestion_jobs j ON j.document_id = d.id
			 JOIN workflow_tasks task ON task.id = j.id
			 JOIN workflow_outbox outbox ON outbox.task_id = task.id
			 WHERE d.id = $1::uuid AND j.id = $2::uuid`,
			[response.documentId, response.jobId],
		);
		expect(readback.rows).toHaveLength(1);
		expect(readback.rows[0]).toMatchObject({
			document_id: response.documentId,
			job_id: response.jobId,
			source_hash: expectedHash,
			mime_type: 'image/png',
			task_status: 'queued',
			command_type: 'document.parse',
			outbox_task_id: response.jobId,
		});
		expect(readback.rows[0]?.minio_key).toContain(response.documentId);
		console.info('[library-upload-live-playwright-proof]', JSON.stringify({
			browser: 'headless Chromium',
			server: 'in-process HTTP harness invoking the actual SvelteKit POST handler; app boot hooks not started',
			database: scratchDatabase,
			postgresMajor: 18,
			documentId: response.documentId,
			jobId: response.jobId,
			sourceSha256: expectedHash,
			mimeType: 'image/png',
			queue: 'PostgreSQL task + outbox read back; Rabbit publish not exercised',
			browserUploadMs: Date.now() - uploadStarted,
		}));
	} finally {
		await pool.end();
		await harness.close();
	}
});
