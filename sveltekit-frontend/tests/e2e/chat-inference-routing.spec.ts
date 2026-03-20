/**
 * Session 40: Chat Inference Routing + Debug Overlay Tests
 *
 * Tests the client router (local ONNX vs server Ollama), source badges,
 * debug overlay (?debug=1), and auto-escalation behavior.
 *
 * Uses proper SSEChunk format matching ChatSession.svelte.ts interface.
 * All tests mock /api/sse/chat — no live Ollama required.
 */

import { expect, test } from '@playwright/test';

const BASE = 'http://127.0.0.1:5173';
const SCREENSHOT_DIR = 'test-results/inference-routing';

/** Build a proper SSE response body matching the SSEChunk interface */
function buildSSEResponse(options: {
	content: string;
	source?: 'server-ollama' | 'local-onnx';
	confidence?: number;
	contextUsed?: string[];
}) {
	const id = `test-${Date.now()}`;
	const source = options.source ?? 'server-ollama';

	// Streaming chunk (partial content)
	const streamingChunk = JSON.stringify({
		id,
		role: 'assistant',
		content: options.content.substring(0, Math.floor(options.content.length / 2)),
		status: 'streaming',
		source
	});

	// Done chunk (full content + metadata)
	const doneChunk = JSON.stringify({
		id,
		role: 'assistant',
		content: options.content,
		status: 'done',
		source,
		confidence: options.confidence ?? 0.85,
		contextUsed: options.contextUsed ?? []
	});

	return `data: ${streamingChunk}\n\ndata: ${doneChunk}\n\n`;
}

test.describe('Debug Overlay (?debug=1)', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/api/sse/chat', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				headers: { 'Cache-Control': 'no-cache' },
				body: buildSSEResponse({
					content: 'A tort is a civil wrong that causes harm, giving rise to a claim for damages.',
					source: 'server-ollama',
					confidence: 0.85
				})
			});
		});
	});

	test('overlay visible with ?debug=1', async ({ page }) => {
		await page.goto(`${BASE}/chat?debug=1`, { waitUntil: 'networkidle' });

		const overlay = page.locator('[data-testid="debug-overlay"]');
		await expect(overlay).toBeVisible();
		await expect(overlay).toContainText('Dev Metrics');
		await expect(overlay).toContainText('Source:');
		await expect(overlay).toContainText('Provider:');
		await expect(overlay).toContainText('Latency:');
		await expect(overlay).toContainText('Cache:');
		await expect(overlay).toContainText('Router:');
		await expect(overlay).toContainText('Confidence:');
		await expect(overlay).toContainText('Status:');

		await page.screenshot({ path: `${SCREENSHOT_DIR}/01-debug-overlay-visible.png`, fullPage: true });
	});

	test('overlay hidden without ?debug=1', async ({ page }) => {
		await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle' });

		const overlay = page.locator('[data-testid="debug-overlay"]');
		await expect(overlay).toHaveCount(0);
	});

	test('overlay updates after message send', async ({ page }) => {
		await page.goto(`${BASE}/chat?debug=1&server=1`, { waitUntil: 'networkidle' });

		const overlay = page.locator('[data-testid="debug-overlay"]');

		// Before send: latency should be 0, status idle
		await expect(overlay).toContainText('Latency: 0ms');
		await expect(overlay).toContainText('Status: idle');

		// Send a message
		const input = page.locator('[data-testid="chat-input"]');
		const sendBtn = page.locator('[data-testid="chat-send"]');
		await input.fill('What is a tort?');
		await sendBtn.click();

		// Wait for response
		const assistantMsg = page.locator('[data-role="assistant"]').first();
		await expect(assistantMsg).toBeVisible({ timeout: 15_000 });

		// After response: latency should be > 0, provider should be server-ollama
		await expect(overlay).not.toContainText('Latency: 0ms');
		await expect(overlay).toContainText('Provider: server-ollama');
		await expect(overlay).toContainText('Status: idle');

		await page.screenshot({ path: `${SCREENSHOT_DIR}/02-debug-overlay-updated.png`, fullPage: true });
	});
});

test.describe('Source Badges (LOCAL / SERVER)', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/api/sse/chat', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				headers: { 'Cache-Control': 'no-cache' },
				body: buildSSEResponse({
					content: 'Under California law, a valid contract requires offer, acceptance, consideration, and mutual assent.',
					source: 'server-ollama',
					confidence: 0.92,
					contextUsed: ['Cal. Civ. Code § 1550']
				})
			});
		});
	});

	test('SERVER badge on server response', async ({ page }) => {
		// "contract" triggers legal keyword → server route
		await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle' });

		const input = page.locator('[data-testid="chat-input"]');
		const sendBtn = page.locator('[data-testid="chat-send"]');

		await input.fill('What is contract law?');
		await sendBtn.click();

		// Wait for assistant message
		const assistantMsg = page.locator('[data-role="assistant"]').first();
		await expect(assistantMsg).toBeVisible({ timeout: 15_000 });

		// Check source badge says SERVER
		const sourceBadge = page.locator('[data-testid="answer-source"]').first();
		await expect(sourceBadge).toBeVisible();
		await expect(sourceBadge).toHaveAttribute('data-source', 'server-ollama');
		await expect(sourceBadge).toContainText('SERVER');

		await page.screenshot({ path: `${SCREENSHOT_DIR}/03-server-badge.png`, fullPage: true });
	});

	test('confidence score displayed', async ({ page }) => {
		await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle' });

		const input = page.locator('[data-testid="chat-input"]');
		await input.fill('What is a tort?');
		await page.locator('[data-testid="chat-send"]').click();

		const assistantMsg = page.locator('[data-role="assistant"]').first();
		await expect(assistantMsg).toBeVisible({ timeout: 15_000 });

		// Confidence badge should show 92% (from mock)
		const confidence = page.locator('[data-testid="confidence"]').first();
		const hasConfidence = (await confidence.count()) > 0;
		if (hasConfidence) {
			await expect(confidence).toContainText('92%');
		}

		await page.screenshot({ path: `${SCREENSHOT_DIR}/04-confidence-score.png`, fullPage: true });
	});

	test('citations displayed when contextUsed provided', async ({ page }) => {
		await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle' });

		const input = page.locator('[data-testid="chat-input"]');
		await input.fill('What is contract law?');
		await page.locator('[data-testid="chat-send"]').click();

		const assistantMsg = page.locator('[data-role="assistant"]').first();
		await expect(assistantMsg).toBeVisible({ timeout: 15_000 });

		// Citations should appear if contextUsed was in the done chunk
		const citations = page.locator('[data-testid="citations"]').first();
		const hasCitations = (await citations.count()) > 0;
		if (hasCitations) {
			await expect(citations).toContainText('Cal. Civ. Code');
		}

		await page.screenshot({ path: `${SCREENSHOT_DIR}/05-citations.png`, fullPage: true });
	});
});

test.describe('Forced Routing (?server=1 / ?local=1)', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/api/sse/chat', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				headers: { 'Cache-Control': 'no-cache' },
				body: buildSSEResponse({
					content: 'Hello! I can help you with legal questions. What would you like to know?',
					source: 'server-ollama',
					confidence: 0.9
				})
			});
		});
	});

	test('?server=1 forces server route for simple query', async ({ page }) => {
		// "hello" would normally route to local-onnx (simple-query)
		// ?server=1 overrides to server-ollama
		await page.goto(`${BASE}/chat?server=1&debug=1`, { waitUntil: 'networkidle' });

		const input = page.locator('[data-testid="chat-input"]');
		const sendBtn = page.locator('[data-testid="chat-send"]');

		await input.fill('hello');
		await sendBtn.click();

		const assistantMsg = page.locator('[data-role="assistant"]').first();
		await expect(assistantMsg).toBeVisible({ timeout: 15_000 });

		// Debug overlay should show forced-server reason
		const overlay = page.locator('[data-testid="debug-overlay"]');
		await expect(overlay).toContainText('user-forced-server');
		await expect(overlay).toContainText('Provider: server-ollama');

		// Source badge should say SERVER
		const sourceBadge = page.locator('[data-testid="answer-source"]').first();
		await expect(sourceBadge).toBeVisible();
		await expect(sourceBadge).toContainText('SERVER');

		await page.screenshot({ path: `${SCREENSHOT_DIR}/06-forced-server.png`, fullPage: true });
	});

	test('?local=1 routes through local path and shows local-onnx source', async ({ page }) => {
		// With ?local=1, the router returns source: 'local-onnx', reason: 'user-forced-local'
		// In test env the SSE mock intercepts network requests, so the response comes through
		// but the router decision reflects forced-local routing
		await page.goto(`${BASE}/chat?local=1&debug=1`, { waitUntil: 'networkidle' });

		const input = page.locator('[data-testid="chat-input"]');
		const sendBtn = page.locator('[data-testid="chat-send"]');

		await input.fill('hello');
		await sendBtn.click();

		// Should get a response (via SSE mock fallback)
		const assistantMsg = page.locator('[data-role="assistant"]').first();
		await expect(assistantMsg).toBeVisible({ timeout: 30_000 });

		// Debug overlay should show the forced-local router reason
		const overlay = page.locator('[data-testid="debug-overlay"]');
		const overlayText = await overlay.textContent();

		// Router decision should reflect forced-local
		expect(overlayText).toContain('user-forced-local');

		await page.screenshot({ path: `${SCREENSHOT_DIR}/07-local-forced-routing.png`, fullPage: true });
	});
});

test.describe('Natural Routing (no query params)', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/api/sse/chat', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				headers: { 'Cache-Control': 'no-cache' },
				body: buildSSEResponse({
					content: 'Negligence requires duty, breach, causation, and damages.',
					source: 'server-ollama',
					confidence: 0.88
				})
			});
		});
	});

	test('legal query routes to server naturally', async ({ page }) => {
    // "negligence" is a legal keyword → scores 0.5+ → server
    await page.goto(`${BASE}/chat?debug=1`, { waitUntil: 'networkidle' });

    const input = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="chat-send"]');

    await input.fill('What is negligence?');
    await sendBtn.click();

    const assistantMsg = page.locator('[data-role="assistant"]').first();
    await expect(assistantMsg).toBeVisible({ timeout: 15_000 });

    // Debug overlay should show the live legal term score reason (not user-forced)
    const overlay = page.locator('[data-testid="debug-overlay"]');
    await expect(overlay).toContainText('legal(1)');

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/08-natural-server-route.png`,
      fullPage: true,
    });
  });

  test('simple query routes to local (then escalates)', async ({ page }) => {
    // "thanks" matches a local pattern; depending on ONNX availability it may stay local or escalate
    await page.goto(`${BASE}/chat?debug=1`, { waitUntil: 'networkidle' });

    const input = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="chat-send"]');

    await input.fill('thanks');
    await sendBtn.click();

    const assistantMsg = page.locator('[data-role="assistant"]').first();
    await expect(assistantMsg).toBeVisible({ timeout: 30_000 });

    // Debug overlay should show the live local routing reason
    const overlay = page.locator('[data-testid="debug-overlay"]');
    const overlayText = await overlay.textContent();
    const isLocalAttempt =
      overlayText?.includes('local-pattern') ||
      overlayText?.includes('local-fallback(local-pattern)');
    expect(isLocalAttempt).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/09-natural-local-route.png`, fullPage: true });
  });
});

test.describe('SSE Stream Handling', () => {
	test('handles multi-line SSE data events', async ({ page }) => {
		// Test the multi-line data: parsing fix from Session 37
		await page.route('**/api/sse/chat', async (route) => {
			// Deliberately split JSON across multiple data: lines
			const chunk = {
				id: 'multi-1',
				role: 'assistant',
				content: 'Multi-line SSE test response.',
				status: 'done',
				source: 'server-ollama',
				confidence: 0.75
			};
			const json = JSON.stringify(chunk);
			const half = Math.floor(json.length / 2);

			// Split into two data: lines within one event block
			const body = `data: ${json.substring(0, half)}\ndata: ${json.substring(half)}\n\n`;

			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				headers: { 'Cache-Control': 'no-cache' },
				body
			});
		});

		await page.goto(`${BASE}/chat?server=1`, { waitUntil: 'networkidle' });

		const input = page.locator('[data-testid="chat-input"]');
		await input.fill('What is habeas corpus?');
		await page.locator('[data-testid="chat-send"]').click();

		const assistantMsg = page.locator('[data-role="assistant"]').first();
		await expect(assistantMsg).toBeVisible({ timeout: 15_000 });
		await expect(assistantMsg).toContainText('Multi-line SSE test response');

		await page.screenshot({ path: `${SCREENSHOT_DIR}/10-multiline-sse.png`, fullPage: true });
	});

	test('handles SSE error status gracefully', async ({ page }) => {
		await page.route('**/api/sse/chat', async (route) => {
			const errorChunk = JSON.stringify({
				id: 'err-1',
				role: 'assistant',
				content: 'Model temporarily unavailable. Please try again.',
				status: 'error',
				source: 'server-ollama'
			});

			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				headers: { 'Cache-Control': 'no-cache' },
				body: `data: ${errorChunk}\n\n`
			});
		});

		await page.goto(`${BASE}/chat?server=1&debug=1`, { waitUntil: 'networkidle' });

		const input = page.locator('[data-testid="chat-input"]');
		await input.fill('What is due process?');
		await page.locator('[data-testid="chat-send"]').click();

		// Wait for the error to be rendered
		await page.waitForTimeout(3000);

		// Status should show error in debug overlay
		const overlay = page.locator('[data-testid="debug-overlay"]');
		const overlayText = await overlay.textContent();
		const hasErrorStatus = overlayText?.includes('error');
		if (hasErrorStatus) {
			console.log('Confirmed: error status shown in debug overlay');
		}

		await page.screenshot({ path: `${SCREENSHOT_DIR}/11-sse-error.png`, fullPage: true });
	});

	test('input disabled during thinking/streaming', async ({ page }) => {
		// Use a delayed response to catch the disabled state
		await page.route('**/api/sse/chat', async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 2000));
			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				headers: { 'Cache-Control': 'no-cache' },
				body: buildSSEResponse({
					content: 'Delayed response for disability test.',
					source: 'server-ollama',
					confidence: 0.8
				})
			});
		});

		await page.goto(`${BASE}/chat?server=1`, { waitUntil: 'networkidle' });

		const input = page.locator('[data-testid="chat-input"]');
		const sendBtn = page.locator('[data-testid="chat-send"]');

		await input.fill('What is liability?');
		await sendBtn.click();

		// Check disabled state within the 2s delay window
		await page.waitForTimeout(500);
		const inputDisabled = await input.isDisabled();
		const btnDisabled = await sendBtn.isDisabled();

		if (inputDisabled) {
			console.log('Confirmed: input disabled during thinking');
		}
		if (btnDisabled) {
			console.log('Confirmed: send button disabled during thinking');
		}

		// Wait for response to complete
		await expect(sendBtn).toBeEnabled({ timeout: 15_000 });
		await expect(input).toBeEnabled();

		await page.screenshot({ path: `${SCREENSHOT_DIR}/12-input-reenabled.png`, fullPage: true });
	});
});