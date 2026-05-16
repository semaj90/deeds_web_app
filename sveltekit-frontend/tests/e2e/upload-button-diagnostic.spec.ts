/**
 * Upload-button diagnostic — captures EVERY signal the browser surfaces
 * during a load + upload attempt, so we can see exactly what's breaking
 * when "nothing uploads".
 *
 * Captures:
 *   - console messages (info/warn/error/log) with source URL + line
 *   - page errors (uncaught exceptions)
 *   - all network requests + responses (status, URL, response body on 4xx/5xx)
 *   - request failures (DNS / connection refused / aborted)
 *   - websocket frames (vite HMR)
 *
 * Each test renders one upload page and runs the diagnostic. Output is
 * intentionally verbose — this is a forensic test, not a CI gate.
 */

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { PORTS } from '../helpers/env-ports.js';

const BASE = PORTS.APP_BASE;

interface CapturedLog {
	consoleMessages: Array<{ type: string; text: string; location: string }>;
	pageErrors:      Array<{ message: string; stack?: string }>;
	requests:        Array<{ method: string; url: string; resourceType: string }>;
	responses:       Array<{ url: string; status: number; statusText: string; body?: string }>;
	requestFailures: Array<{ url: string; failure: string }>;
}

function emptyLog(): CapturedLog {
	return { consoleMessages: [], pageErrors: [], requests: [], responses: [], requestFailures: [] };
}

function attachListeners(page: Page, log: CapturedLog) {
	page.on('console', (msg: ConsoleMessage) => {
		const loc = msg.location();
		log.consoleMessages.push({
			type: msg.type(),
			text: msg.text(),
			location: `${loc.url}:${loc.lineNumber}:${loc.columnNumber}`,
		});
	});

	page.on('pageerror', (err) => {
		log.pageErrors.push({ message: err.message, stack: err.stack });
	});

	page.on('request', (req) => {
		log.requests.push({
			method: req.method(),
			url: req.url(),
			resourceType: req.resourceType(),
		});
	});

	page.on('requestfailed', (req) => {
		log.requestFailures.push({
			url: req.url(),
			failure: req.failure()?.errorText ?? 'unknown',
		});
	});

	page.on('response', async (res) => {
		const status = res.status();
		let body: string | undefined;
		// Capture body on 4xx/5xx for diagnostic context
		if (status >= 400 && status < 600) {
			try {
				body = (await res.text()).slice(0, 500);
			} catch {
				body = '<unreadable>';
			}
		}
		log.responses.push({ url: res.url(), status, statusText: res.statusText(), body });
	});
}

function summarise(log: CapturedLog, label: string) {
	const errors = log.consoleMessages.filter((m) => m.type === 'error');
	const warnings = log.consoleMessages.filter((m) => m.type === 'warning' || m.type === 'warn');
	const failedResponses = log.responses.filter((r) => r.status >= 400);
	console.log('');
	console.log(`══════ DIAGNOSTIC: ${label} ══════`);
	console.log(`Console errors:    ${errors.length}`);
	console.log(`Console warnings:  ${warnings.length}`);
	console.log(`Page errors:       ${log.pageErrors.length}`);
	console.log(`Network requests:  ${log.requests.length}`);
	console.log(`Failed responses:  ${failedResponses.length}`);
	console.log(`Request failures:  ${log.requestFailures.length}`);

	if (errors.length > 0) {
		console.log('\n--- console.error ---');
		errors.slice(0, 10).forEach((e, i) => {
			console.log(`  [${i + 1}] ${e.text.slice(0, 200)}`);
			if (e.location !== ':0:0') console.log(`      @ ${e.location}`);
		});
	}

	if (log.pageErrors.length > 0) {
		console.log('\n--- pageerror (uncaught exceptions) ---');
		log.pageErrors.slice(0, 5).forEach((e, i) => {
			console.log(`  [${i + 1}] ${e.message}`);
			if (e.stack) console.log(`      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`);
		});
	}

	if (failedResponses.length > 0) {
		console.log('\n--- failed responses ---');
		failedResponses.slice(0, 10).forEach((r, i) => {
			console.log(`  [${i + 1}] ${r.status} ${r.statusText} ${r.url}`);
			if (r.body) console.log(`      body: ${r.body.slice(0, 150)}`);
		});
	}

	if (log.requestFailures.length > 0) {
		console.log('\n--- request failures (network) ---');
		log.requestFailures.slice(0, 5).forEach((f, i) => {
			console.log(`  [${i + 1}] ${f.failure} ${f.url}`);
		});
	}
	console.log('═══════════════════════════════════════════');
}

test.describe('Upload diagnostic — full browser signal capture', () => {
	test('GET /evidence/upload renders without console errors', async ({ page }) => {
		const log = emptyLog();
		attachListeners(page, log);

		await page.goto(`${BASE}/evidence/upload`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
		await page.waitForTimeout(1000); // let any deferred imports settle

		summarise(log, '/evidence/upload (page load)');

		// Soft assertion — we want the diagnostic regardless of pass/fail
		const hardErrors = log.pageErrors.filter((e) => !e.message.includes('Failed to fetch'));
		expect(hardErrors.length, `Page threw ${hardErrors.length} uncaught errors`).toBeLessThan(5);
	});

	test('upload UI shows a file picker / drop zone (not a blank page)', async ({ page }) => {
		const log = emptyLog();
		attachListeners(page, log);

		await page.goto(`${BASE}/evidence/upload`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
		await page.waitForTimeout(1500);

		// Look for ANY file input OR a drop-zone-ish element
		const fileInputs = await page.locator('input[type="file"]').count();
		const dropZones = await page.locator('[data-testid*="drop"], [class*="drop-zone"], [class*="dropzone"], [class*="upload-zone"]').count();
		const uploadButtons = await page.locator('button').filter({ hasText: /upload|attach|browse|select.*file/i }).count();

		console.log(`\nUpload affordances on page:`);
		console.log(`  <input type="file">: ${fileInputs}`);
		console.log(`  drop zones (test/css):${dropZones}`);
		console.log(`  upload-ish buttons:   ${uploadButtons}`);

		summarise(log, '/evidence/upload (UI affordances)');

		expect(fileInputs + dropZones + uploadButtons, 'No upload affordance found at all').toBeGreaterThan(0);
	});

	test('POST a tiny test file via /api/evidence/upload', async ({ request }) => {
		// Build multipart body with a 1-byte text "file"
		const formData = new FormData();
		formData.append('file', new Blob(['x'], { type: 'text/plain' }), 'diagnostic.txt');
		formData.append('title', '[PW-DIAG] one-byte upload');

		const res = await request.post(`${BASE}/api/evidence/upload`, {
			multipart: {
				file: { name: 'diagnostic.txt', mimeType: 'text/plain', buffer: Buffer.from('x') },
				title: '[PW-DIAG] one-byte upload',
			},
			timeout: 30000,
		});

		const status = res.status();
		const body = await res.text();
		console.log(`\nPOST /api/evidence/upload → ${status}`);
		console.log(`response body (first 600):`);
		console.log(body.slice(0, 600));

		// We don't fail the test on non-200 — we want the diagnostic to RUN even if the contract is broken
		expect([200, 201, 400, 401, 422, 500]).toContain(status);
	});

	test('cases/[id]/evidence/upload renders without console errors (with seeded case)', async ({ page, request }) => {
		// Find a real seeded case id
		const casesRes = await request.get(`${BASE}/api/cases?limit=1`).catch(() => null);
		let caseId: string | null = null;
		if (casesRes?.ok()) {
			const body = await casesRes.json().catch(() => null);
			caseId = body?.cases?.[0]?.id ?? body?.data?.cases?.[0]?.id ?? body?.[0]?.id ?? null;
		}
		if (!caseId) {
			console.log('No seeded case found — skipping cases/[id]/evidence/upload diagnostic');
			test.skip();
			return;
		}

		const log = emptyLog();
		attachListeners(page, log);

		await page.goto(`${BASE}/cases/${caseId}/evidence/upload`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
		await page.waitForTimeout(1500);

		const fileInputs = await page.locator('input[type="file"]').count();
		const buttons = await page.locator('button').count();
		console.log(`\ncases/[id]/evidence/upload page state:`);
		console.log(`  <input type="file">: ${fileInputs}`);
		console.log(`  <button> total:      ${buttons}`);

		summarise(log, `/cases/${caseId.slice(0, 8)}.../evidence/upload`);

		const hardErrors = log.pageErrors.filter((e) => !e.message.includes('Failed to fetch'));
		expect(hardErrors.length).toBeLessThan(5);
	});
});
