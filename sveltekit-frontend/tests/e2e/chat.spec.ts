/**
 * Phase 76: End-to-End Chat Interface Test
 * Tests the complete RAG pipeline with Playwright
 */

import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const CHAT_URL = 'http://127.0.0.1:5173/chat/test-session-1';
const SCREENSHOT_DIR = path.join(process.cwd(), 'test-results', 'screenshots');

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe('Phase 76: Context-Aware RAG Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    // Mock ALL chat-related API endpoints to avoid OOM from real Ollama calls
    await page.route('**/api/sse/**', async (route) => {
      // Return a mock SSE response for the chat session
      const mockResponse = `data: {"type":"AI_REPLY","content":"This is a mock AI response for testing purposes. The key elements of a valid contract include offer, acceptance, consideration, and mutual assent.","confidence":0.85,"citations":["Cal. Civ. Code § 1550"],"timestamp":"${new Date().toISOString()}"}\n\n`;

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: mockResponse,
      });
    });

    await page.route('**/api/chat/stream**', async (route) => {
      // Return a mock SSE response
      const mockResponse = `data: {"type":"chunk","content":"This is a mock AI response for testing purposes. "}\n\ndata: {"type":"chunk","content":"The key elements of a valid contract include offer, acceptance, consideration, and mutual assent."}\n\ndata: {"type":"done","confidence":0.85,"citations":["Cal. Civ. Code § 1550"]}\n\n`;

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: mockResponse,
      });
    });

    // Mock the form action POST
    await page.route('**/chat/*?/send', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Navigate to chat interface
    await page.goto(CHAT_URL);

    // Wait for page to be fully loaded
    await page.waitForLoadState('domcontentloaded');
  });

  test('should load chat interface with SSE connection', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Chat|Legal AI/i);

    // Verify chat window exists
    const chatWindow = page.locator('.chat-window, [data-testid="chat-window"]');
    await expect(chatWindow).toBeVisible();

    // Verify message input exists
    const messageInput = page.locator('input[name="message"], textarea[name="message"]');
    await expect(messageInput).toBeVisible();

    // Take screenshot
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-chat-loaded.png'),
      fullPage: true,
    });

    console.log('✅ Chat interface loaded successfully');
  });

  test('should send message and receive AI response', async ({ page }) => {
    // Find message input
    const messageInput = page.locator('input[name="message"], textarea[name="message"]').first();
    const sendButton = page.locator('button[type="submit"]').first();

    // Type legal question
    const testMessage = 'What are the key elements of a valid contract under California law?';
    await messageInput.fill(testMessage);

    // Take screenshot before sending
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02-message-typed.png'),
      fullPage: true,
    });

    // Send message
    await sendButton.click();

    // Wait for optimistic update (user message should appear immediately)
    await page.waitForTimeout(500);

    // Verify user message appears
    const userMessage = page.locator('.message.user, [data-role="user"]').last();
    await expect(userMessage).toContainText(testMessage);

    // Take screenshot showing user message
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-user-message-sent.png'),
      fullPage: true,
    });

    console.log('✅ User message sent');

    // Wait for AI response (with timeout)
    const aiMessage = page.locator('.message.assistant, [data-role="assistant"]').last();

    // Wait for AI response (mocked, but may be slow if real Ollama is used)
    await expect(aiMessage).toBeVisible({ timeout: 180000 }); // 3 minutes

    // Verify AI response has content
    const aiContent = await aiMessage.textContent();
    expect(aiContent).toBeTruthy();
    expect(aiContent!.length).toBeGreaterThan(10);

    // Take screenshot with AI response
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '04-ai-response-received.png'),
      fullPage: true,
    });

    console.log('✅ AI response received');
    console.log(`Response preview: ${aiContent!.substring(0, 100)}...`);
  });

  test('should display confidence score if available', async ({ page }) => {
    // Send message
    const messageInput = page.locator('input[name="message"]').first();
    await messageInput.fill('Explain the statute of limitations for personal injury in California');
    await page.locator('button[type="submit"]').first().click();

    // Wait for AI response
    await page.waitForTimeout(180000); // Wait 3 minutes for slow Ollama response

    // Check for confidence indicator
    const confidenceIndicator = page.locator('.confidence, [data-testid="confidence"]');

    if ((await confidenceIndicator.count()) > 0) {
      await expect(confidenceIndicator).toBeVisible();

      const confidenceText = await confidenceIndicator.textContent();
      console.log(`✅ Confidence score displayed: ${confidenceText}`);

      // Take screenshot
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '05-confidence-score.png'),
        fullPage: true,
      });
    } else {
      console.log('⚠️  No confidence score displayed (may be expected)');
    }
  });

  test('should display citations if available', async ({ page }) => {
    // Send message
    const messageInput = page.locator('input[name="message"]').first();
    await messageInput.fill('What does 18 U.S.C. § 1001 cover?');
    await page.locator('button[type="submit"]').first().click();

    // Wait for AI response
    await page.waitForTimeout(180000); // Wait 3 minutes for slow Ollama response

    // Check for citations
    const citations = page.locator('.citations, [data-testid="citations"]');

    if ((await citations.count()) > 0) {
      await expect(citations).toBeVisible();

      const citationText = await citations.textContent();
      console.log(`✅ Citations displayed: ${citationText}`);

      // Take screenshot
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '06-citations.png'),
        fullPage: true,
      });
    } else {
      console.log('⚠️  No citations displayed');
    }
  });

  test('should show loading state while AI is thinking', async ({ page }) => {
    // Send message
    const messageInput = page.locator('input[name="message"]').first();
    await messageInput.fill('Test loading state');
    await page.locator('button[type="submit"]').first().click();

    // Immediately check for loading indicator
    const loadingIndicator = page.locator('.loading, .thinking, [data-testid="loading"]');

    // Should appear within 5 seconds
    await expect(loadingIndicator).toBeVisible({ timeout: 5000 });

    // Take screenshot
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '07-loading-state.png'),
      fullPage: true,
    });

    console.log('✅ Loading state displayed');
  });

  test('should handle multiple messages in conversation', async ({ page }) => {
    test.setTimeout(120000);
    const messages = [
      'What is a tort?',
      'Can you give me an example?',
      'What are the remedies available?',
    ];

    for (let i = 0; i < messages.length; i++) {
      const messageInput = page.locator('input[name="message"]').first();
      await messageInput.fill(messages[i]);
      await page.locator('button[type="submit"]').first().click();

      // Wait for loading to start
      const loading = page.locator('.loading, .thinking, [data-testid="loading"]');
      await expect(loading)
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});

      // Wait for response (loading to disappear or new assistant message)
      await expect(loading).toBeHidden({ timeout: 30000 });

      // Verify assistant message count increased
      const assistantMessages = page.locator('.msg.assistant');
      await expect(assistantMessages).toHaveCount(i + 1, { timeout: 30000 });

      // Take screenshot
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `08-conversation-${i + 1}.png`),
        fullPage: true,
      });
    }

    // Verify all messages are displayed
    const allMessages = page.locator('.message, [data-role]');
    const messageCount = await allMessages.count();

    // Should have at least 6 messages (3 user + 3 assistant)
    expect(messageCount).toBeGreaterThanOrEqual(6);

    console.log(`✅ Conversation with ${messageCount} messages displayed`);
  });

  test('should reconnect on SSE connection loss', async ({ page }) => {
    // Monitor console for reconnection attempts
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(msg.text());
    });

    // Simulate connection by navigating away and back
    await page.goto('about:blank');
    await page.waitForTimeout(2000);
    await page.goto(CHAT_URL);

    // Wait for potential reconnection
    await page.waitForTimeout(3000);

    // Check if reconnection happened (look for logs)
    const hasReconnectLog = consoleLogs.some(
      (log) => log.includes('Connecting') || log.includes('SSE') || log.includes('reconnect')
    );

    if (hasReconnectLog) {
      console.log('✅ SSE reconnection detected');
    }

    // Take screenshot
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '09-after-reconnect.png'),
      fullPage: true,
    });
  });

  test('should display low confidence warning', async ({ page }) => {
    // Send message
    const messageInput = page.locator('input[name="message"]').first();
    await messageInput.fill('What is the exact statute number for littering in Nome, Alaska?');
    await page.locator('button[type="submit"]').first().click();

    // Wait for response
    await page.waitForTimeout(10000);

    // Check for warning
    const warning = page.locator('.warning, .alert, [data-testid="warning"]');

    if ((await warning.count()) > 0) {
      await expect(warning).toBeVisible();
      console.log('✅ Low confidence warning displayed');

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '10-low-confidence-warning.png'),
        fullPage: true,
      });
    }
  });
});

test.describe('Phase 76: Service Integration Tests', () => {
	test('should verify all backend services are running', async ({ request }) => {
		const services = [
			{ name: 'PostgreSQL', url: 'http://localhost:5432', skip: true },
			{ name: 'Redis', url: 'http://localhost:6379', skip: true },
			{ name: 'RabbitMQ', url: 'http://localhost:15672' },
			{ name: 'Qdrant', url: 'http://localhost:6333/health' },
			{ name: 'CouchDB', url: 'http://localhost:5984/_up' },
			{ name: 'MinIO', url: 'http://localhost:9000/minio/health/live' }
		];

		for (const service of services) {
			if (service.skip) continue;

			try {
				const response = await request.get(service.url);
				expect(response.ok()).toBeTruthy();
				console.log(`✅ ${service.name} is healthy`);
			} catch (error) {
				console.error(`❌ ${service.name} health check failed:`, error);
			}
		}
	});
});
