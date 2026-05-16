import { test, expect } from '@playwright/test';
import { PORTS } from './helpers/env-ports.js';

test.describe('Evidence Upload RAG Integration', () => {
  test('evidence upload page loads', async ({ page }) => {
		await page.goto(`${PORTS.APP_BASE}/evidence/upload`);

    // Check page title
    await expect(page).toHaveTitle(/YoRHa Legal AI|Evidence/i);

    console.log('✅ Evidence upload page loaded');
  });

  test('navigate from homepage to evidence upload', async ({ page }) => {
    // Go to homepage
		await page.goto(PORTS.APP_BASE);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Navigate directly to evidence upload
		await page.goto(`${PORTS.APP_BASE}/evidence/upload`);

    // Verify we're on the upload page
    await expect(page).toHaveTitle(/YoRHa Legal AI|Evidence/i);

    console.log('✅ Navigated to evidence upload page');
  });

  test('RAG ingest endpoint is accessible', async ({ page, request }) => {
		const response = await request.post(`${PORTS.APP_BASE}/api/upload/rag-ingest`, {
      multipart: {
        files: {
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('This is a test document for RAG ingestion.'),
        },
      },
    });

    expect(response.status()).toBeLessThan(500);
    console.log(`✅ RAG endpoint responded with status: ${response.status()}`);

    if (response.ok()) {
      const data = await response.json();
      console.log('RAG Response:', JSON.stringify(data, null, 2));
      expect(data.success).toBe(true);
    }
  });
});
