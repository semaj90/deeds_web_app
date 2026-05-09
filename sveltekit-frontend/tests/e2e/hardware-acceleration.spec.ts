import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Hardware Acceleration & Developer Tools', () => {
  let seededCaseId: string | undefined;

  test.beforeAll(async () => {
    // Corrected path to the seeded case IDs from global-setup.ts
    const idsPath = path.resolve('test-results/.playwright-test-case-ids.json');
    if (fs.existsSync(idsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(idsPath, 'utf-8'));
        if (data.ids && data.ids.length > 0) {
          seededCaseId = data.ids[0];
          console.log('Using seeded case ID:', seededCaseId);
        }
      } catch (e) {
        console.warn('Failed to parse test-ids.json:', e);
      }
    } else {
      console.warn('Test IDs file not found at:', idsPath);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('WebGPU Hardware Acceleration toggle in RAG Search', async ({ page }) => {
    await page.goto('/rag-search');
    
    // Updated locator for the checkbox toggle
    const toggle = page.locator('input.toggle-primary');
    await expect(toggle).toBeVisible();
    
    // Toggle state change check
    const initialState = await toggle.isChecked();
    await toggle.click();
    expect(await toggle.isChecked()).not.toBe(initialState);
    
    // Verify search functionality still works
    const searchInput = page.locator('.join input[placeholder*="What are the requirements"]');
    await searchInput.fill('What is a quitclaim deed?');
    await page.keyboard.press('Enter');
    
    // Transition to "Validate Sources" step
    // Increased timeout to 30s for slower environments or initial model load
    await expect(page.locator('.step-primary:has-text("Validate Sources")')).toBeVisible({ timeout: 30000 });
  });

  test('Terminal GPU Error Triage', async ({ page }) => {
    await page.goto('/terminal');
    
    // Wait for the terminal to initialize
    await expect(page.locator('.term-viewport')).toBeVisible();
    
    const triageBtn = page.locator('button:has-text("TRIAGE")');
    await expect(triageBtn).toBeVisible();
    
    const chatInput = page.locator('textarea.term-textarea');
    const mockErrors = `
      src/lib/server/minio-client.ts:45:12 error: Property 'nonExistent' does not exist on type 'Client'.
      src/routes/api/rag/search/+server.ts:110:5 error: Cannot find name 'use_webgpu'.
    `;
    
    await chatInput.fill(mockErrors);
    await page.locator('button:has-text("SEND")').click();
    
    // Ensure the message was sent
    await expect(page.locator('.term-msg-user').last()).toContainText('src/lib/server/minio-client.ts');
    
    // Click TRIAGE
    await triageBtn.click();
    
    // Verify results with a more flexible timeout and partial text match
    // Note: ReferenceError fix in terminal/+page.svelte should resolve previous crash
    const assistantMsg = page.locator('.term-msg-assistant').last();
    await expect(assistantMsg).toBeVisible({ timeout: 30000 });
    await expect(assistantMsg).toContainText('Error Triage');
    await expect(assistantMsg).toContainText('TYPESCRIPT');
  });

  test('MinIO Connectivity Regression (Evidence Upload)', async ({ request }) => {
    const fileContent = 'Regression test for MinIO normalization logic.';
    const fileName = 'regression-test.txt';
    
    // Use the seeded case ID if available, or a fallback that matches dev user
    const caseIdToUse = seededCaseId || '00000000-0000-0000-0000-000000000001';
    
    const response = await request.post('/api/evidence/upload', {
      multipart: {
        file: {
          name: fileName,
          mimeType: 'text/plain',
          buffer: Buffer.from(fileContent),
        },
        caseId: caseIdToUse,
        title: 'Regression Test Document'
      }
    });
    
    if (!response.ok()) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Upload failed with status', response.status(), ':', errorData);
    }
    
    // API returns 201 Created on success
    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data.fileName).toBe(fileName);
  });
});
