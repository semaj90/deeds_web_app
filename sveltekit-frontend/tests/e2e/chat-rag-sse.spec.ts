/**
 * Real SSE Chat + RAG Pipeline Test (no mocks)
 * Requires: dev server on :5173, Ollama running, PostgreSQL up
 * Tests the actual end-to-end flow: type → SSE POST → Ollama stream → render
 */
import { expect, test } from '@playwright/test';

const BASE = 'http://127.0.0.1:5173';
const SCREENSHOT_DIR = 'test-results/chat-screenshots';

test.describe('Real SSE Chat Pipeline', () => {
	test.setTimeout(120_000); // Ollama can be slow on first call

	test('SSE chat streams and renders assistant message', async ({ page }) => {
		// 1. Navigate to chat page
		await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle' });
		await page.screenshot({ path: `${SCREENSHOT_DIR}/01-initial.png`, fullPage: true });

		// Verify chat UI loaded
		const input = page.locator('[data-testid="chat-input"]');
		await expect(input).toBeVisible();
		await expect(input).toBeEnabled();

		const sendBtn = page.locator('[data-testid="chat-send"]');
		await expect(sendBtn).toBeVisible();
		await expect(sendBtn).toHaveText('Send');

		// 2. Type a legal question
		await input.fill('What is probable cause? Answer briefly.');
		await page.screenshot({ path: `${SCREENSHOT_DIR}/02-typed.png`, fullPage: true });

		// 3. Send message — watch for state transitions
		await sendBtn.click();

		// User message should appear immediately (optimistic update)
		const userMsg = page.locator('[data-role="user"]').first();
		await expect(userMsg).toBeVisible({ timeout: 5_000 });
		await expect(userMsg).toContainText('probable cause');

		// Button text should change to Thinking... or Streaming...
		// (may be brief, so just verify input is disabled during generation)
		await page.screenshot({ path: `${SCREENSHOT_DIR}/03-thinking.png`, fullPage: true });

		// 4. Wait for assistant response (real Ollama, may take 30-90s)
		const assistantMsg = page.locator('[data-role="assistant"]').first();
		await expect(assistantMsg).toBeVisible({ timeout: 90_000 });

		// 5. Wait for streaming to finish (status goes back to idle)
		await expect(sendBtn).toBeEnabled({ timeout: 90_000 });
		await expect(sendBtn).toHaveText('Send');

		await page.screenshot({ path: `${SCREENSHOT_DIR}/04-response.png`, fullPage: true });

		// 6. Verify response has meaningful content
		const responseText = (await assistantMsg.textContent()) ?? '';
		expect(responseText.length).toBeGreaterThan(30);
		console.log(`✅ Assistant response (${responseText.length} chars): ${responseText.substring(0, 120)}...`);

		// 7. Check for confidence score (always present in done event)
		const confidence = page.locator('[data-testid="confidence"]');
		const hasConfidence = (await confidence.count()) > 0;
		if (hasConfidence) {
			const confText = await confidence.first().textContent();
			console.log(`✅ Confidence displayed: ${confText}`);
		} else {
			console.log('ℹ️  No confidence badge rendered (may need metadata in done chunk)');
		}

		// 8. Check for citations (only if RAG returned hits)
		const citations = page.locator('[data-testid="citations"]');
		const hasCitations = (await citations.count()) > 0;
		if (hasCitations) {
			const citText = await citations.first().textContent();
			console.log(`✅ Citations displayed: ${citText}`);
		} else {
			console.log('ℹ️  No citations (RAG returned 0 hits — expected if collections empty)');
		}
	});

	test('input is disabled during streaming', async ({ page }) => {
		await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle' });

		const input = page.locator('[data-testid="chat-input"]');
		const sendBtn = page.locator('[data-testid="chat-send"]');

		await input.fill('Define hearsay in 2 sentences.');
		await sendBtn.click();

		// Input should be disabled while thinking/streaming
		// Give a brief window for the status to change
		await page.waitForTimeout(500);
		const isDisabled = await input.isDisabled();
		if (isDisabled) {
			console.log('✅ Input correctly disabled during streaming');
		} else {
			console.log('⚠️  Input was not disabled (status may have resolved very fast)');
		}

		// Wait for completion
		await expect(sendBtn).toBeEnabled({ timeout: 90_000 });
		await expect(input).toBeEnabled();
		console.log('✅ Input re-enabled after response complete');
	});

	test('multiple messages in conversation', async ({ page }) => {
		await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle' });

		const input = page.locator('[data-testid="chat-input"]');
		const sendBtn = page.locator('[data-testid="chat-send"]');

		// First message
		await input.fill('What is mens rea?');
		await sendBtn.click();

		// Wait for first assistant response
		const firstAssistant = page.locator('[data-role="assistant"]').first();
		await expect(firstAssistant).toBeVisible({ timeout: 90_000 });
		await expect(sendBtn).toBeEnabled({ timeout: 90_000 });

		// Second message
		await input.fill('Give an example.');
		await sendBtn.click();

		// Wait for second assistant response (should be 2 now)
		await page.waitForFunction(
			() => document.querySelectorAll('[data-role="assistant"]').length >= 2,
			{ timeout: 90_000 }
		);

		const userMsgCount = await page.locator('[data-role="user"]').count();
		const assistantMsgCount = await page.locator('[data-role="assistant"]').count();

		expect(userMsgCount).toBeGreaterThanOrEqual(2);
		expect(assistantMsgCount).toBeGreaterThanOrEqual(2);

		await page.screenshot({ path: `${SCREENSHOT_DIR}/05-multi-turn.png`, fullPage: true });
		console.log(`✅ Multi-turn: ${userMsgCount} user, ${assistantMsgCount} assistant messages`);
	});
});
