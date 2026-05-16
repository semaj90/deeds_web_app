import { test, expect } from '@playwright/test';
import path from 'path';
import { PORTS } from './helpers/env-ports.js';

test.describe('Evidence Upload with RAG Integration', () => {
  test('navigate from homepage to evidence upload and test RAG ingestion', async ({ page }) => {
    // Navigate to homepage
	    await page.goto(PORTS.APP_BASE);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check homepage loaded
    await expect(page).toHaveTitle(/YoRHa Legal AI/);

    // Navigate to evidence upload page
    // Try multiple navigation strategies
    const navigationSuccessful = await page.evaluate(async () => {
      // Strategy 1: Direct click on navigation link
      const evidenceLink =
        document.querySelector('a[href*="evidence"]') ||
        document.querySelector('a[href*="upload"]');
      if (evidenceLink) {
        (evidenceLink as HTMLAnchorElement).click();
        return true;
      }

      // Strategy 2: Manual navigation
      window.location.href = '/evidence/upload';
      return true;
    });

    if (!navigationSuccessful) {
      // Fallback: direct navigation
	      await page.goto(`${PORTS.APP_BASE}/evidence/upload`);
    }

    // Wait for upload page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Allow time for form initialization

    // Verify we're on the upload page
    await expect(page.locator('text=Legal AI Evidence Upload')).toBeVisible({ timeout: 10000 });

    // Check if RAG upload endpoint exists
	    const ragEndpoint = `${PORTS.APP_BASE}/api/upload/rag-ingest`;

    // Fill in required form fields
    const caseSelect = page.locator('select[name="case_id"]');
    await caseSelect.waitFor({ state: 'visible', timeout: 5000 });

    // Select first available case (if any)
    const caseOptions = await caseSelect.locator('option').count();
    if (caseOptions > 1) {
      await caseSelect.selectOption({ index: 1 }); // Select first non-empty option
    } else {
      console.warn('No cases available in dropdown');
    }

    // Fill in title
    await page.locator('input[name="title"]').fill('Test Evidence Upload - RAG Integration');

    // Fill in description
    await page
      .locator('textarea[name="description"]')
      .fill('Testing RAG pipeline integration with file upload');

    // Select evidence type
    await page.locator('select[name="evidence_type"]').selectOption('TEXT');

    // Enable AI processing options
    await page.locator('input[name="enableOcr"]').check();
    await page.locator('input[name="enableAiAnalysis"]').check();
    await page.locator('input[name="enableEmbeddings"]').check();
    await page.locator('input[name="enableSummarization"]').check();

    // Upload a test file
    const testFilePath = path.join(process.cwd(), 'test-evidence.txt');

    // Set up file input listener
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFilePath);

    // Wait for file to be processed
    await page.waitForTimeout(1000);

    // Verify file was selected
    const filePreview = page.locator('text=test-evidence.txt');
    await expect(filePreview).toBeVisible({ timeout: 5000 });

    // Set up response listener for RAG endpoint
    let ragUploadCalled = false;
    let ragResponseStatus = 0;

    page.on('response', (response) => {
      if (response.url().includes('/api/upload/rag-ingest')) {
        ragUploadCalled = true;
        ragResponseStatus = response.status();
        console.log(`RAG upload endpoint called: ${response.status()}`);
      }
    });

    // Submit the form
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Wait for upload to complete
    await page.waitForTimeout(3000);

    // Check if RAG upload was called
    console.log(`RAG Upload Called: ${ragUploadCalled}`);
    console.log(`RAG Response Status: ${ragResponseStatus}`);

    // Verify RAG endpoint was called (if form submission worked)
    if (ragUploadCalled) {
      expect(ragResponseStatus).toBeGreaterThanOrEqual(200);
      expect(ragResponseStatus).toBeLessThan(500);
    }

    // Check for success/error messages
    const successMessage = page.locator('.nes-container.is-success');
    const errorMessage = page.locator('.nes-container.is-error');

    const hasSuccess = await successMessage.isVisible().catch(() => false);
    const hasError = await errorMessage.isVisible().catch(() => false);

    if (hasSuccess) {
      console.log('✅ Upload succeeded with success message');
      const successText = await successMessage.textContent();
      console.log(`Success: ${successText}`);
    } else if (hasError) {
      console.log('❌ Upload failed with error message');
      const errorText = await errorMessage.textContent();
      console.log(`Error: ${errorText}`);
    } else {
      console.log('⚠️ No success/error message displayed');
    }

    // Test direct RAG endpoint
    console.log('\n--- Testing RAG Endpoint Directly ---');

    const formData = new FormData();
    const fileContent = await page.evaluate(async (filePath) => {
      const response = await fetch(`file://${filePath}`);
      return response.text();
    }, testFilePath);

    // Create a blob from file content
    const blob = await page.evaluate((content) => {
      return new Blob([content], { type: 'text/plain' });
    }, fileContent);

    // Make direct API call to RAG endpoint
    const directRagTest = await page.evaluate(async (endpoint) => {
      const formData = new FormData();
      const testFile = new File(['Test evidence content for RAG ingestion'], 'test-evidence.txt', {
        type: 'text/plain',
      });
      formData.append('files', testFile);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
        });

        return {
          status: response.status, ok: response.ok, statusText: response.statusText, body: await response.text().catch(() => 'Unable to read body'),
        };
      } catch (error) {
        return {
          status: 0, ok: false,
          statusText: 'Network Error',
          body: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }, ragEndpoint);

    console.log('Direct RAG Endpoint Test:');
    console.log(`  Status: ${directRagTest.status}`);
    console.log(`  OK: ${directRagTest.ok}`);
    console.log(`  Status Text: ${directRagTest.statusText}`);
    console.log(`  Response: ${directRagTest.body.substring(0, 200)}`);

    // Assertions for direct RAG test
    expect(directRagTest.status).toBeGreaterThan(0); // Ensure endpoint is reachable

    if (directRagTest.ok) {
      console.log('✅ RAG endpoint is working correctly');
    } else {
      console.log(`⚠️ RAG endpoint returned status ${directRagTest.status}`);
    }
  });

  test('test RAG endpoint with multiple file types', async ({ page }) => {
	    await page.goto(`${PORTS.APP_BASE}/evidence/upload`);
    await page.waitForLoadState('networkidle');

	    const ragEndpoint = `${PORTS.APP_BASE}/api/upload/rag-ingest`;

    // Test with different file types
    const fileTypes = [
      {
        name: 'test.txt',
        content: 'This is a test text file for RAG ingestion.',
        type: 'text/plain',
      },
      {
        name: 'legal-doc.txt',
        content: 'Legal document content with case law references.',
        type: 'text/plain',
      },
    ];

    for (const fileType of fileTypes) {
      console.log(`\nTesting RAG with: ${fileType.name}`);

      const result = await page.evaluate(
        async ({ endpoint, file }) => {
          const formData = new FormData();
          const blob = new File([file.content], file.name, { type: file.type });
          formData.append('files', blob);

          try {
            const response = await fetch(endpoint, {
              method: 'POST',
              body: formData,
            });

            return {
              fileName: file.name, status: response.status, ok: response.ok, body: await response.text().catch(() => 'Unable to read'),
            };
          } catch (error) {
            return {
              fileName: file.name, status: 0,
              ok: false, body: error instanceof Error ? error.message : 'Error',
            };
          }
        },
        { endpoint: ragEndpoint, file: fileType }
      );

      console.log(`  ${fileType.name}: Status ${result.status} (${result.ok ? '✅' : '❌'})`);

      // Log response preview
      if (result.body.length > 0) {
        console.log(`  Response: ${result.body.substring(0, 100)}...`);
      }
    }
  });
});
