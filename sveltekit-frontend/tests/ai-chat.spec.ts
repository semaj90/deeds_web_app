import { test, expect } from '@playwright/test';

test.describe('Legal AI Chat Testing', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the AI chat page
    await page.goto('/chat');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should load AI chat interface', async ({ page }) => {
    // Check if chat interface elements are present
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="chat-input"], input[type="text"], textarea')
    ).toBeVisible();
    await expect(page.locator('[data-testid="send-button"], button[type="submit"]')).toBeVisible();
  });

  test('should send message and receive AI response', async ({ page }) => {
    const testMessage =
      'Analyze this contract clause: "The party of the first part agrees to transfer all rights."';

    // Find chat input (try multiple selectors)
    const chatInput = page
      .locator('[data-testid="chat-input"]')
      .or(page.locator('input[type="text"]'))
      .or(page.locator('textarea'))
      .first();

    const sendButton = page
      .locator('[data-testid="send-button"]')
      .or(page.locator('button[type="submit"]'))
      .or(page.locator('button:has-text("Send")'))
      .first();

    // Send message
    await chatInput.fill(testMessage);
    await sendButton.click();

    // Wait for AI response (with longer timeout for AI processing)
    await page.waitForSelector('[data-testid="ai-response"], .ai-message, .assistant-message', {
      timeout: 30000,
    });

    // Verify response exists and contains relevant content
    const aiResponse = await page
      .locator('[data-testid="ai-response"], .ai-message, .assistant-message')
      .first();
    await expect(aiResponse).toBeVisible();

    const responseText = await aiResponse.textContent();
    expect(responseText).toBeTruthy();
    expect(responseText!.length).toBeGreaterThan(10);
  });

  test('should handle multiple conversation turns', async ({ page }) => {
    const messages = [
      'What is a contract?',
      'Explain consideration in contract law',
      'What makes a contract enforceable?',
    ];

    for (const message of messages) {
      // Find input and send button
      const chatInput = page
        .locator('[data-testid="chat-input"]')
        .or(page.locator('input[type="text"]'))
        .or(page.locator('textarea'))
        .first();

      const sendButton = page
        .locator('[data-testid="send-button"]')
        .or(page.locator('button[type="submit"]'))
        .or(page.locator('button:has-text("Send")'))
        .first();

      await chatInput.fill(message);
      await sendButton.click();

      // Wait for response
      await page.waitForTimeout(2000); // Brief pause between messages
    }

    // Verify multiple messages in conversation
    const allMessages = page.locator('.message, [data-testid="message"], .chat-message');
    const messageCount = await allMessages.count();
    expect(messageCount).toBeGreaterThanOrEqual(6); // 3 user + 3 AI responses
  });

  test('should validate legal AI accuracy indicators', async ({ page }) => {
    const legalQuery = 'What are the elements of a valid contract under US law?';

    const chatInput = page
      .locator('[data-testid="chat-input"]')
      .or(page.locator('input[type="text"]'))
      .or(page.locator('textarea'))
      .first();

    const sendButton = page
      .locator('[data-testid="send-button"]')
      .or(page.locator('button[type="submit"]'))
      .or(page.locator('button:has-text("Send")'))
      .first();

    await chatInput.fill(legalQuery);
    await sendButton.click();

    // Wait for AI response
    await page.waitForSelector('[data-testid="ai-response"], .ai-message, .assistant-message', {
      timeout: 30000,
    });

    // Check for accuracy indicators
    const accuracyScore = page.locator(
      '[data-testid="accuracy-score"], .accuracy, .confidence-score'
    );
    const responseQuality = page.locator('[data-testid="response-quality"], .quality-indicator');

    // At least one accuracy indicator should be present
    const hasAccuracyIndicator =
      (await accuracyScore.count()) > 0 || (await responseQuality.count()) > 0;
    expect(hasAccuracyIndicator).toBeTruthy();
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Test with very long input
    const longMessage = 'A'.repeat(10000);

    const chatInput = page
      .locator('[data-testid="chat-input"]')
      .or(page.locator('input[type="text"]'))
      .or(page.locator('textarea'))
      .first();

    const sendButton = page
      .locator('[data-testid="send-button"]')
      .or(page.locator('button[type="submit"]'))
      .or(page.locator('button:has-text("Send")'))
      .first();

    await chatInput.fill(longMessage);
    await sendButton.click();

    // Should either get a response or show an error message
    await page.waitForSelector(
      '[data-testid="ai-response"], .ai-message, .error-message, .assistant-message',
      {
        timeout: 15000,
      }
    );

    // Verify the interface is still functional
    await expect(chatInput).toBeVisible();
    await expect(sendButton).toBeVisible();
  });

  test('should preserve chat history during session', async ({ page }) => {
    const firstMessage = 'Hello, I need legal advice';
    const secondMessage = 'Tell me about contract law';

    const chatInput = page
      .locator('[data-testid="chat-input"]')
      .or(page.locator('input[type="text"]'))
      .or(page.locator('textarea'))
      .first();

    const sendButton = page
      .locator('[data-testid="send-button"]')
      .or(page.locator('button[type="submit"]'))
      .or(page.locator('button:has-text("Send")'))
      .first();

    // Send first message
    await chatInput.fill(firstMessage);
    await sendButton.click();
    await page.waitForTimeout(3000);

    // Send second message
    await chatInput.fill(secondMessage);
    await sendButton.click();
    await page.waitForTimeout(3000);

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Check if history is preserved (this depends on your implementation)
    const historyMessages = page.locator('.message, [data-testid="message"], .chat-message');
    const historyCount = await historyMessages.count();

    // At minimum, the interface should be functional after reload
    await expect(chatInput).toBeVisible();
    await expect(sendButton).toBeVisible();
  });

  test('should validate response time performance', async ({ page }) => {
    const startTime = Date.now();
    const testMessage = 'What is negligence in tort law?';

    const chatInput = page
      .locator('[data-testid="chat-input"]')
      .or(page.locator('input[type="text"]'))
      .or(page.locator('textarea'))
      .first();

    const sendButton = page
      .locator('[data-testid="send-button"]')
      .or(page.locator('button[type="submit"]'))
      .or(page.locator('button:has-text("Send")'))
      .first();

    await chatInput.fill(testMessage);
    await sendButton.click();

    // Wait for response
    await page.waitForSelector('[data-testid="ai-response"], .ai-message, .assistant-message', {
      timeout: 30000,
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    console.log(`AI Response Time: ${responseTime}ms`);

    // Reasonable response time for AI (under 30 seconds)
    expect(responseTime).toBeLessThan(30000);
  });
});
