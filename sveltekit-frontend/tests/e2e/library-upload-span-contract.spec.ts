import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import ts from 'typescript';

const frontendRoot = resolve(import.meta.dirname, '../..');
const uploadClientPath = resolve(frontendRoot, 'src/lib/library/library-upload-client-v1.ts');
const spanBridgePath = resolve(frontendRoot, 'src/lib/server/features/legal-corpus/legal/utf16-utf8-span-bridge-v1.ts');

function browserModule(path: string, exportName: string, globalName: string): string {
	const source = readFileSync(path, 'utf8');
	const output = ts.transpileModule(source, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
	}).outputText;
	return `${output}\nwindow[${JSON.stringify(globalName)}] = ${exportName};`;
}

test.describe('library upload + extracted-text span browser contract', () => {
	test('uploads a selected file and verifies UTF-16/UTF-8 retrieval spans in Chromium', async ({ page }) => {
		const pdfBytes = Buffer.from('%PDF-1.7\nfixture with no real evidence\n%%EOF', 'utf8');
		const observedUploads: Array<{ body: Buffer | null; headers: Record<string, string> }> = [];
		const extractedText = `${'x'.repeat(1023)}🏛️ § 1983 — café\nThe claimant cites a source passage.`;
		const retrievalStart = extractedText.indexOf('The claimant');
		const retrievalEnd = extractedText.length;
		const retrievedChunk = extractedText.slice(retrievalStart, retrievalEnd);
		let searchRequestCount = 0;

		await page.route('http://atlas.test/**', async (route) => {
			const request = route.request();
			const url = new URL(request.url());
			if (url.pathname === '/api/library/upload') {
				observedUploads.push({ body: request.postDataBuffer(), headers: request.headers() });
				await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true }) });
				return;
			}
			if (url.pathname === '/api/library/search') {
				const hitText = searchRequestCount++ === 0 ? retrievedChunk : 'tampered result text';
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						hits: [{
							documentId: 'fixture-document', sourceRevision: 'sha256:fixture',
							canonicalText: extractedText, utf16Start: retrievalStart, utf16End: retrievalEnd,
							text: hitText, embeddingModel: 'fixture-only',
						}],
					}),
				});
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: '<!doctype html><meta charset="utf-8"><label>Evidence file<input id="evidence-file" type="file"></label><button id="upload">Upload</button><button id="search">Search</button><output id="status"></output>',
			});
		});

		await page.goto('http://atlas.test/upload');
		await page.addScriptTag({ type: 'module', content: browserModule(uploadClientPath, 'uploadLibraryFileV1', '__uploadLibraryFileV1') });
		await page.addScriptTag({ type: 'module', content: browserModule(spanBridgePath, 'SourceOffsetTableV1', '__SourceOffsetTableV1') });
		await page.evaluate(() => {
			const host = window as typeof window & {
				__uploadLibraryFileV1: (file: File, metadata: { title: string }) => Promise<Response>;
				__SourceOffsetTableV1: new (text: string) => {
					resolveDualSpan(start: number, end: number): { text: string; utf8ByteStart: number; utf8ByteEnd: number; lineStart: number; lineEnd: number };
				};
			__libraryBrowserTimings?: Record<string, number | number[]>;
			__librarySpanResult?: { text: string; utf8RoundTrip: string; lineStart: number; lineEnd: number };
			};
			const status = document.querySelector<HTMLOutputElement>('#status')!;
			document.querySelector<HTMLButtonElement>('#upload')!.addEventListener('click', async () => {
				const file = document.querySelector<HTMLInputElement>('#evidence-file')!.files?.[0];
				if (!file) throw new Error('fixture file not selected');
				const start = performance.now();
				const response = await host.__uploadLibraryFileV1(file, { title: 'Fixture § 1983 🏛️' });
				const timings = host.__libraryBrowserTimings ?? {};
				const uploadRoundTripsMs = Array.isArray(timings.uploadClientRoundTripsMs) ? timings.uploadClientRoundTripsMs : [];
				host.__libraryBrowserTimings = { ...timings, uploadClientRoundTripsMs: [...uploadRoundTripsMs, performance.now() - start] };
				status.value = `upload:${response.status}`;
			});
			document.querySelector<HTMLButtonElement>('#search')!.addEventListener('click', async () => {
				try {
					const start = performance.now();
					const response = await fetch('/api/library/search?q=fixture');
					const result = await response.json() as { hits: Array<{ canonicalText: string; utf16Start: number; utf16End: number; text: string }> };
					const hit = result.hits[0]!;
					const mapStart = performance.now();
					const span = new host.__SourceOffsetTableV1(hit.canonicalText).resolveDualSpan(hit.utf16Start, hit.utf16End);
					const bytes = new TextEncoder().encode(hit.canonicalText);
					const utf8RoundTrip = new TextDecoder().decode(bytes.subarray(span.utf8ByteStart, span.utf8ByteEnd));
					if (span.text !== hit.text || utf8RoundTrip !== hit.text) throw new Error('RETRIEVED_SPAN_TEXT_MISMATCH');
					host.__libraryBrowserTimings = {
						...(host.__libraryBrowserTimings ?? {}),
						mockSearchRoundTripMs: performance.now() - start,
						spanMappingMs: performance.now() - mapStart,
					};
					host.__librarySpanResult = { text: span.text, utf8RoundTrip, lineStart: span.lineStart, lineEnd: span.lineEnd };
					status.value = 'search:200';
				} catch (cause) {
					status.value = `search-error:${cause instanceof Error ? cause.message : 'UNKNOWN'}`;
				}
			});
		});

		await page.locator('#evidence-file').setInputFiles({
			name: 'fixture.pdf', mimeType: 'application/pdf', buffer: pdfBytes,
		});
		await page.getByRole('button', { name: 'Upload' }).click();
		await expect(page.locator('#status')).toHaveText('upload:202');
		const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
		await page.locator('#evidence-file').setInputFiles({
			name: 'fixture.png', mimeType: 'image/png', buffer: pngBytes,
		});
		await page.getByRole('button', { name: 'Upload' }).click();
		await expect(page.locator('#status')).toHaveText('upload:202');
		await page.getByRole('button', { name: 'Search' }).click();
		await expect(page.locator('#status')).toHaveText('search:200');

		expect(observedUploads).toHaveLength(2);
		const [receivedPdf, receivedPng] = observedUploads;
		expect(receivedPdf?.headers['content-type']).toBe('application/pdf');
		expect(receivedPdf?.headers['x-library-byte-length']).toBe(String(pdfBytes.byteLength));
		expect(receivedPdf?.body?.equals(pdfBytes)).toBe(true);
		expect(receivedPng?.headers['content-type']).toBe('image/png');
		expect(receivedPng?.headers['x-library-byte-length']).toBe(String(pngBytes.byteLength));
		expect(receivedPng?.body?.equals(pngBytes)).toBe(true);
		const metadata = JSON.parse(Buffer.from(receivedPdf!.headers['x-library-metadata'], 'base64url').toString('utf8')) as { title: string };
		expect(metadata.title).toBe('Fixture § 1983 🏛️');

		const spanResult = await page.evaluate(() => (window as typeof window & { __librarySpanResult?: unknown }).__librarySpanResult);
		expect(spanResult).toEqual({ text: retrievedChunk, utf8RoundTrip: retrievedChunk, lineStart: 2, lineEnd: 2 });
		await page.getByRole('button', { name: 'Search' }).click();
		await expect(page.locator('#status')).toHaveText('search-error:RETRIEVED_SPAN_TEXT_MISMATCH');
		const timings = await page.evaluate(() => (window as typeof window & { __libraryBrowserTimings?: Record<string, number | number[]> }).__libraryBrowserTimings);
		expect(timings?.uploadClientRoundTripsMs).toHaveLength(2);
		for (const duration of timings?.uploadClientRoundTripsMs as number[]) expect(duration).toBeGreaterThanOrEqual(0);
		expect(timings?.mockSearchRoundTripMs).toBeGreaterThanOrEqual(0);
		expect(timings?.spanMappingMs).toBeGreaterThanOrEqual(0);
		console.log('[library-upload-headless-eval]', JSON.stringify({
			scope: 'Chromium + in-memory HTTP routes; no app server or live services',
			pdfPayloadBytes: pdfBytes.byteLength,
			imagePayloadBytes: pngBytes.byteLength,
			...timings,
		}));
	});
});
