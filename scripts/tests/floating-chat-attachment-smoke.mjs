import { chromium } from 'playwright';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5173';
const attachmentPath = 'c:/Users/james/Videos/deeds-web-app/todo326.txt';
const expectedFirstLine = 'to do _3_17_26';

async function waitForServerReady(url, timeoutMs = 30000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const response = await fetch(url, { redirect: 'manual' });
			if (response.status < 500) return;
		} catch {
			// server not ready yet
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error(`Server not ready at ${url} within ${timeoutMs}ms`);
}

async function findCasePath(page) {
	await page.goto(`${baseURL}/cases`, { waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.waitForTimeout(1500);

	const hrefs = await page.locator('a[href]').evaluateAll((links) =>
		links
			.map((link) => link.getAttribute('href'))
			.filter((href) => typeof href === 'string')
	);

	const match = hrefs.find((href) => /^\/cases\/[0-9a-f-]{36}(?:$|[/?#])/i.test(href));
	return match || '/cases';
}

async function ensureCasePath(page) {
	const existingPath = await findCasePath(page);
	if (existingPath !== '/cases') {
		return existingPath;
	}

	const response = await page.request.post(`${baseURL}/api/cases`, {
		data: {
			title: `Smoke Test Case ${Date.now()}`,
			description: 'Temporary case created by floating chat attachment smoke test.',
			status: 'open',
			priority: 'medium'
		}
	});

	if (!response.ok()) {
		throw new Error(`Failed to create fallback case: HTTP ${response.status()}`);
	}

	const payload = await response.json();
	const caseId = payload?.data?.case?.id || payload?.case?.id;
	if (!caseId || !/^[0-9a-f-]{36}$/i.test(caseId)) {
		throw new Error('Fallback case creation returned no valid case id');
	}

	return `/cases/${caseId}`;
}

const browser = await chromium.launch({
	headless: true,
	args: [
		'--enable-webgpu',
		'--enable-unsafe-webgpu',
		'--enable-features=WebAssemblySimd,WebGPU',
		'--disable-web-security',
	],
});

const page = await browser.newPage();
const consoleErrors = [];
const networkFailures = [];
let ingestPayload = null;
let ssePayload = null;
let statusPollCount = 0;

page.on('console', (msg) => {
	if (msg.type() === 'error') {
		consoleErrors.push(msg.text());
	}
});

page.on('requestfailed', (request) => {
	networkFailures.push({ url: request.url(), errorText: request.failure()?.errorText || 'unknown' });
});

page.on('response', async (response) => {
	const url = response.url();
	if (url.includes('/api/ace/ingest')) {
		try {
			ingestPayload = await response.json();
		} catch {
			// ignore
		}
	}
	if (url.includes('/api/ace/status')) {
		statusPollCount += 1;
	}
});

page.on('request', async (request) => {
	if (request.url().includes('/api/sse/chat') && request.method() === 'POST') {
		try {
			ssePayload = JSON.parse(request.postData() || '{}');
		} catch {
			// ignore
		}
	}
});

try {
	await waitForServerReady(baseURL);

	const casePath = await ensureCasePath(page);
	await page.goto(`${baseURL}${casePath}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.waitForTimeout(1500);

	await page.getByRole('button', { name: 'Open assistant' }).click();
	await page.getByText('AI CONTEXTUAL CHAT').waitFor({ state: 'visible', timeout: 15000 });

	await page
		.locator('label')
		.filter({ hasText: 'Attach' })
		.locator('input[type="file"]')
		.setInputFiles(attachmentPath);
	await page.getByText('todo326.txt').waitFor({ state: 'visible', timeout: 10000 });

	await page.locator('textarea[placeholder="Ask about evidence, statutes, case law…"]').fill(
		'Return only the first line of the attached file.'
	);

	await page.getByRole('button', { name: /send/i }).click();

	await page.getByText(/Indexing attachment: todo326.txt/).waitFor({ state: 'visible', timeout: 15000 });
	await page.getByText(/Preview ready:|Attachment indexed:/).waitFor({ state: 'visible', timeout: 30000 });

	if (await page.getByText(/Preview ready:/).isVisible().catch(() => false)) {
		await page
			.getByText(/Answering from extracted preview while background indexing completes\./)
			.waitFor({ state: 'visible', timeout: 15000 });
	}

	await page.getByText(expectedFirstLine, { exact: false }).waitFor({ state: 'visible', timeout: 60000 });

	if (/^\/cases\/[0-9a-f-]{36}$/i.test(casePath)) {
		if (!ssePayload?.conversationId?.startsWith('case-')) {
			throw new Error(`Expected case-scoped conversationId, got ${ssePayload?.conversationId ?? 'missing'}`);
		}
	}

	const result = {
		ok: true,
		baseURL,
		casePath,
		ingestPayload,
		ssePayload,
		statusPollCount,
		consoleErrors,
		networkFailures,
	};

	console.log(JSON.stringify(result, null, 2));
} catch (error) {
	const result = {
		ok: false,
		baseURL,
		error: error instanceof Error ? error.message : String(error),
		ingestPayload,
		ssePayload,
		statusPollCount,
		consoleErrors,
		networkFailures,
	};

	console.error(JSON.stringify(result, null, 2));
	process.exitCode = 1;
} finally {
	await page.close();
	await browser.close();
}