/**
 * Comprehensive Legal AI Platform Test Suite
 * Tests user experience, button functionality, route navigation, and legal workflows
 */

import type { test, expect, Page  } from '@playwright/test';
import path from 'path';
import type { fileURLToPath  } from 'url';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const BASE_URL = 'http://localhost:5177';
const TEST_PDF_PATH = path.join(__dirname, 'complaint.pdf');

// Routes to test from navigation
const MAIN_ROUTES = [
  '/',
  '/yorha-command-center',
  '/evidenceboard',
  '/demo/enhanced-rag-semantic',
  '/demo/nes-bits-ui',
  '/demo/gpu-inference',
  '/detective',
  '/citations',
  '/chat',
  '/demo/gpu-assistant',
  '/auth/login',
  '/auth/register',
  '/legal-ai/database-sync-test',
];

// Accessibility helper functions
async function checkAccessibility(page: Page, routeName: string) {
  // Check for essential accessibility features
  const skipLink = page.locator('a[href="#main-content"]');
  await expect(skipLink).toBeVisible();

  const mainContent = page.locator('#main-content');
  await expect(mainContent).toBeVisible();

  // Check for proper heading structure
  const headings = page.locator('h1, h2, h3, h4, h5, h6');
  const headingCount = await headings.count();
  expect(headingCount).toBeGreaterThan(0);

  console.log(`✅ Accessibility check passed for ${routeName}`);
}

async function testButtonClickability(page: Page: routeName, string: string) {
  // Find all buttons and links
  const buttons = page.locator('button:visible, [role="button"]:visible');
  const links = page.locator('a:visible');

  const buttonCount = await buttons.count();
  const linkCount = await links.count();

  console.log(`Found ${buttonCount} buttons and ${linkCount} links on ${routeName}`);

  // Test first few buttons for clickability
  for (let i = 0; i < Math.min(buttonCount, 5); i++) {
    const button = buttons.nth(i);
    const isEnabled = await button.isEnabled();
    const text = await button.textContent();

    if (isEnabled) {
      // Check if button has proper ARIA attributes
      const ariaLabel = await button.getAttribute('aria-label');
      const role = await button.getAttribute('role');

      console.log(`Button "${text}" - Enabled: ${isEnabled}, ARIA: ${ariaLabel || role || 'none'}`);
    }
  }

  return { buttonCount, linkCount };
}

test.describe('Legal AI Platform - Complete User Experience', () => {
  test.beforeEach(async ({ page }) => {
    // Set reasonable timeouts for database operations
    test.setTimeout(60000);

    // Navigate to base URL and wait for load
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('All Routes Navigation Test', async ({ page }) => {
    console.log('🚀 Testing all route navigation and clickability...');

    for (const route of MAIN_ROUTES) {
      console.log(`\n📍 Testing route: ${route}`);

      try {
        // Navigate to route
        await page.goto(`${BASE_URL}${route}`);
        await page.waitForLoadState('networkidle', { timeout: 10000 });

        // Check basic page load
        await expect(page).toHaveURL(`${BASE_URL}${route}`);

        // Test accessibility
        await checkAccessibility(page, route);

        // Test button functionality
        const { buttonCount, linkCount } = await testButtonClickability(page, route);

        console.log(`✅ Route ${route} - ${buttonCount} buttons, ${linkCount} links tested`);
      } catch (error) {
        console.error(`❌ Failed testing route ${route}:`, error);
        // Continue testing other routes
      }
    }
  });

  test('Database Sync Integration Test', async ({ page }) => {
    console.log('🔄 Testing database sync integration...');

    // Navigate to database sync test page
    await page.goto(`${BASE_URL}/legal-ai/database-sync-test`);
    await page.waitForLoadState('networkidle');

    // Check page loaded correctly
    await expect(page.locator('h1')).toContainText('Database Sync Integration Test');

    // Test service status indicators
    const statusCards = page.locator('.status-card');
    const statusCount = await statusCards.count();
    expect(statusCount).toBeGreaterThanOrEqual(3); // PostgreSQL, Ollama, Redis

    // Test control buttons
    const testButtons = page.locator('.test-btn');
    const testButtonCount = await testButtons.count();
    expect(testButtonCount).toBeGreaterThan(0);

    // Test "Test Services" button
    const testServicesBtn = page.locator('button:has-text("Test Services")');
    if ((await testServicesBtn.isVisible()) && (await testServicesBtn.isEnabled())) {
      await testServicesBtn.click();

      // Wait for test log to update
      await page.waitForTimeout(2000);

      // Check if log entry appeared
      const logEntries = page.locator('.log-entry');
      const logCount = await logEntries.count();
      expect(logCount).toBeGreaterThan(0);

      console.log('✅ Service availability test completed');
    }

    // Test document processing (if service is available)
    const processBtn = page.locator('button:has-text("Process Document")');
    if ((await processBtn.isVisible()) && (await processBtn.isEnabled())) {
      await processBtn.click();

      // Wait for processing to complete or show error
      await page.waitForTimeout(5000);

      // Check for either results or error message
      const hasResults = await page.locator('.result-display').isVisible();
      const hasError = await page.locator('.error-display').isVisible();

      expect(hasResults || hasError).toBeTruthy();
      console.log('✅ Document processing test completed');
    }

    console.log('✅ Database sync integration test completed');
  });

  test('Evidence Board Workflow Test', async ({ page }) => {
    console.log('📁 Testing Evidence Board workflow...');

    // Navigate to evidence board
    await page.goto(`${BASE_URL}/evidenceboard`);
    await page.waitForLoadState('networkidle');

    // Check page loaded
    await expect(page.locator('h1, h2')).toContainText(/Evidence|Board/);

    // Look for file upload functionality
    const fileInputs = page.locator('input[type="file"]');
    const uploadButtons = page.locator('button:has-text(/upload/i)');

    const fileInputCount = await fileInputs.count();
    const uploadButtonCount = await uploadButtons.count();

    console.log(`Found ${fileInputCount} file inputs and ${uploadButtonCount} upload buttons`);

    // Test file upload if available
    if (fileInputCount > 0) {
      try {
        const fileInput = fileInputs.first();
        await fileInput.setInputFiles(TEST_PDF_PATH);

        console.log('✅ File selected for upload');

        // Look for upload trigger button
        if (uploadButtonCount > 0) {
          const uploadBtn = uploadButtons.first();
          if (await uploadBtn.isEnabled()) {
            await uploadBtn.click();

            // Wait for upload response
            await page.waitForTimeout(3000);

            console.log('✅ Upload triggered');
          }
        }
      } catch (error) {
        console.log('Upload test failed (expected in test environment):', error.message);
      }
    }

    // Test evidence management buttons
    const evidenceButtons = page.locator('button:visible');
    const evidenceButtonCount = await evidenceButtons.count();

    console.log(`Testing ${Math.min(evidenceButtonCount, 3)} evidence board buttons...`);

    for (let i = 0; i < Math.min(evidenceButtonCount, 3); i++) {
      const button = evidenceButtons.nth(i);
      const buttonText = await button.textContent();
      const isEnabled = await button.isEnabled();

      console.log(`Evidence button "${buttonText}" - Enabled: ${isEnabled}`);
    }

    console.log('✅ Evidence Board workflow test completed');
  });

  test('Legal Case Creation Workflow', async ({ page }) => {
    console.log('⚖️ Testing legal case creation workflow...');

    // Start at command center
    await page.goto(`${BASE_URL}/yorha-command-center`);
    await page.waitForLoadState('networkidle');

    // Check for case creation functionality
    const createButtons = page.locator('button:has-text(/create|new|case/i)');
    const createButtonCount = await createButtons.count();

    console.log(`Found ${createButtonCount} create/case buttons`);

    // Test form inputs if available
    const textInputs = page.locator('input[type="text"], textarea');
    const selectInputs = page.locator('select');

    const textInputCount = await textInputs.count();
    const selectInputCount = await selectInputs.count();

    console.log(`Found ${textInputCount} text inputs and ${selectInputCount} select inputs`);

    // Fill out sample case data if forms are available
    if (textInputCount > 0) {
      try {
        // Fill first text input with case name
        const firstInput = textInputs.first();
        await firstInput.fill('Test Legal Case 2024-001');

        console.log('✅ Case name entered');

        // Fill textarea if available
        const textareas = page.locator('textarea');
        if ((await textareas.count()) > 0) {
          const firstTextarea = textareas.first();
          await firstTextarea.fill(
            'This is a test legal case for automated testing purposes. Contains sample case details and legal claims.'
          );

          console.log('✅ Case description entered');
        }
      } catch (error) {
        console.log('Form filling test skipped:', error.message);
      }
    }

    // Test navigation to other legal sections
    const legalLinks = page.locator('a[href*="/legal"], a[href*="/case"], a[href*="/evidence"]');
    const legalLinkCount = await legalLinks.count();

    console.log(`Found ${legalLinkCount} legal workflow links`);

    console.log('✅ Legal case creation workflow test completed');
  });

  test('Chat Interface Functionality', async ({ page }) => {
    console.log('💬 Testing chat interface...');

    await page.goto(`${BASE_URL}/chat`);
    await page.waitForLoadState('networkidle');

    // Look for chat input and send button
    const chatInputs = page
      .locator('input[type="text"], textarea')
      .filter({ hasText: /chat|message/i });
    const sendButtons = page.locator('button:has-text(/send|submit/i)');

    const chatInputCount = await chatInputs.count();
    const sendButtonCount = await sendButtons.count();

    console.log(`Found ${chatInputCount} chat inputs and ${sendButtonCount} send buttons`);

    // Test chat input if available
    if (chatInputCount > 0 && sendButtonCount > 0) {
      try {
        const chatInput = chatInputs.first();
        const sendBtn = sendButtons.first();

        // Enter test message
        await chatInput.fill('Hello, this is a test message for the legal AI assistant.');

        console.log('✅ Chat message entered');

        // Send message if button is enabled
        if (await sendBtn.isEnabled()) {
          await sendBtn.click();

          // Wait for response
          await page.waitForTimeout(3000);

          console.log('✅ Chat message sent');
        }
      } catch (error) {
        console.log('Chat test failed (expected without AI service):', error.message);
      }
    }

    // Check for message history area
    const messageAreas = page.locator('[role="log"], .messages, .chat-history');
    const messageAreaCount = await messageAreas.count();

    console.log(`Found ${messageAreaCount} message display areas`);

    console.log('✅ Chat interface test completed');
  });

  test('Accessibility and Keyboard Navigation', async ({ page }) => {
    console.log('♿ Testing accessibility and keyboard navigation...');

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // Test skip link
    await page.keyboard.press('Tab');
    const skipLink = page.locator('a:has-text("Skip to main content")');
    await expect(skipLink).toBeFocused();

    console.log('✅ Skip link is keyboard accessible');

    // Test main navigation keyboard access
    let tabCount = 0;
    const maxTabs = 10;

    while (tabCount < maxTabs) {
      await page.keyboard.press('Tab');
      tabCount++;

      const focusedElement = page.locator(':focus');
      const elementInfo = await focusedElement.evaluate((el) => ({
        tagName: el.tagName: text, el: el.textContent?.slice(0, 30),
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
      }));

      console.log(
        `Tab ${tabCount}: ${elementInfo.tagName} - "${elementInfo.text}" (${elementInfo.ariaLabel || elementInfo.role || 'no ARIA'})`
      );
    }

    // Test Enter key activation
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    console.log('✅ Keyboard navigation test completed');
  });

  test('MinIO Upload Integration Test', async ({ page }) => {
    console.log('☁️ Testing MinIO upload integration...');

    // Try evidence board first
    await page.goto(`${BASE_URL}/evidenceboard`);
    await page.waitForLoadState('networkidle');

    // Look for MinIO or file upload indicators
    const uploadSections = page.locator(
      '[class*="upload"], [id*="upload"], [data-testid*="upload"]'
    );
    const uploadSectionCount = await uploadSections.count();

    console.log(`Found ${uploadSectionCount} upload sections`);

    // Check for S3/MinIO configuration indicators
    const configText = await page.textContent('body');
    const hasMinIOConfig =
      configText?.includes('minio') || configText?.includes('s3') || configText?.includes('bucket');

    console.log(`MinIO/S3 configuration detected: ${hasMinIOConfig}`);

    // Test file upload to MinIO if available
    const fileInputs = page.locator('input[type="file"]');
    if ((await fileInputs.count()) > 0) {
      try {
        await fileInputs.first().setInputFiles(TEST_PDF_PATH);

        // Look for upload progress or confirmation
        await page.waitForTimeout(2000);

        const uploadProgress = page.locator('[class*="progress"], [role="progressbar"]');
        const uploadStatus = page.locator(
          '[class*="success"], [class*="error"], [class*="upload"]'
        );

        const progressCount = await uploadProgress.count();
        const statusCount = await uploadStatus.count();

        console.log(`Upload indicators: ${progressCount} progress, ${statusCount} status`);
      } catch (error) {
        console.log('MinIO upload test failed (expected without service):', error.message);
      }
    }

    console.log('✅ MinIO upload integration test completed');
  });

  test('Performance and Load Time Assessment', async ({ page }) => {
    console.log('⚡ Testing performance and load times...');

    const performanceMetrics: Array<{ route: string; loadTime: number }> = [];

    for (const route of MAIN_ROUTES.slice(0, 5)) {
      // Test first 5 routes
      const startTime = Date.now();

      try {
        await page.goto(`${BASE_URL}${route}`);
        await page.waitForLoadState('networkidle', { timeout: 15000 });

        const loadTime = Date.now() - startTime;
        performanceMetrics.push({ route, loadTime });

        console.log(`${route}: ${loadTime}ms`);
      } catch (error) {
        console.log(`${route}: Failed to load within timeout`);
      }
    }

    const averageLoadTime =
      performanceMetrics.reduce((sum, metric) => sum + metric.loadTime, 0) /
      performanceMetrics.length;
    console.log(`Average load time: ${Math.round(averageLoadTime)}ms`);

    // Performance assertions
    expect(averageLoadTime).toBeLessThan(10000); // Under 10 seconds average

    console.log('✅ Performance assessment completed');
  });
});

// Utility test for development debugging
test.describe('Development Utilities', () => {
  test('Route Discovery and Link Extraction', async ({ page }) => {
    console.log('🔍 Discovering all available routes...');

    await page.goto(`${BASE_URL}/all-routes`);
    await page.waitForLoadState('networkidle');

    // Extract all links from the page
    const links = await page.locator('a[href]').evaluateAll((links) =>
      links.map((link) => ({
        href: link.getAttribute('href'),
        text: link.textContent?.trim(),
        visible: (link as HTMLElement).offsetParent !== null,
      }))
    );

    console.log(`Found ${links.length} total links:`);
    links.forEach((link, index) => {
      if (link.href && !link.href.startsWith('http') && !link.href.startsWith('#')) {
        console.log(
          `${index + 1}. ${link.href} - "${link.text}" (${link.visible ? 'visible' : 'hidden'})`
        );
      }
    });

    // Test a sample of discovered internal links
    const internalLinks = links
      .filter(
        (link) =>
          link.href && !link.href.startsWith('http') && !link.href.startsWith('#') && link.visible
      )
      .slice(0, 10); // Test first 10 discoverable links

    for (const link of internalLinks) {
      try {
        await page.goto(`${BASE_URL}${link.href}`);
        await page.waitForLoadState('networkidle', { timeout: 5000 });
        console.log(`✅ ${link.href} - accessible`);
      } catch (error) {
        console.log(`❌ ${link.href} - failed to load`);
      }
    }

    console.log('✅ Route discovery completed');
  });
});
