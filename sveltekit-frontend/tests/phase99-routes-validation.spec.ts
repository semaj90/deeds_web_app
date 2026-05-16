/**
 * Phase 99: Core Routes Testing with Screenshots
 * Tests /cases and /evidence routes for:
 * - SSR rendering
 * - Form fields presence
 * - Validation behavior
 * - Missing Superforms + Zod integration
 */

import { expect, test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORTS } from './helpers/env-ports.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Screenshot directory
const screenshotDir = path.join(__dirname, '../reports/phase99-screenshots');

test.describe('Phase 99: /cases Route Testing', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to cases page
	    await page.goto(`${PORTS.APP_BASE}/cases`);
    await page.waitForLoadState('networkidle');
  });

  test('should render cases list page', async ({ page }) => {
    // Take screenshot of initial state
    await page.screenshot({
      path: path.join(screenshotDir, '01-cases-list-initial.png'),
      fullPage: true
    });

    // Check for key elements
    const title = await page.textContent('h1, h2');
    expect(title).toBeTruthy();

    // Check if cases are displayed
    const hasCasesList = await page.locator('[data-testid="cases-list"], .case-item, table').count();
    console.log(`📊 Found ${hasCasesList} case list elements`);

    // Take screenshot after load
    await page.screenshot({
      path: path.join(screenshotDir, '02-cases-list-loaded.png'),
      fullPage: true
    });
  });

  test('should navigate to create new case', async ({ page }) => {
    // Look for "New Case" or "Create Case" button
    const createButton = page.locator('button:has-text("New"), button:has-text("Create"), a:has-text("New Case")').first();

    if (await createButton.count() > 0) {
      await createButton.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: path.join(screenshotDir, '03-cases-create-form.png'),
        fullPage: true
      });
    } else {
      // Try navigating directly
	      await page.goto(`${PORTS.APP_BASE}/cases/new`);
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: path.join(screenshotDir, '03-cases-create-form-direct.png'),
        fullPage: true
      });
    }
  });

  test('should check for form fields on /cases/new', async ({ page }) => {
	    await page.goto(`${PORTS.APP_BASE}/cases/new`);
    await page.waitForLoadState('networkidle');

    // Expected fields from database schema
    const expectedFields = [
      'title',
      'case_number',
      'description',
      'status',
      'priority',
      'case_type',
      'court_name',
      'judge_name',
      'plaintiff_name',
      'defendant_name',
      'filing_date',
      'court_date',
      'outcome',
      'notes'
    ];

    const missingFields: string[] = [];
    const foundFields: string[] = [];

    for (const field of expectedFields) {
      const input = await page.locator(`input[name="${field}"], textarea[name="${field}"], select[name="${field}"]`).count();
      if (input === 0) {
        missingFields.push(field);
      } else {
        foundFields.push(field);
      }
    }

    console.log('\n📋 Form Field Analysis:');
    console.log(`✅ Found fields (${foundFields.length}):`, foundFields);
    console.log(`❌ Missing fields (${missingFields.length}):`, missingFields);

    // Check for Superforms integration
    const hasSuperforms = await page.locator('form[method="POST"]').count();
    const hasValidationErrors = await page.locator('.error, [data-error], .invalid').count();

    console.log('\n🔍 Superforms Detection:');
    console.log(`  POST form: ${hasSuperforms > 0 ? '✅' : '❌'}`);
    console.log(`  Validation elements: ${hasValidationErrors}`);

    // Take screenshot with annotations
    await page.screenshot({
      path: path.join(screenshotDir, '04-cases-form-fields.png'),
      fullPage: true
    });

    // Return analysis
    expect(foundFields.length).toBeGreaterThan(0);
  });

  test('should test form validation behavior', async ({ page }) => {
	    await page.goto(`${PORTS.APP_BASE}/cases/new`);
    await page.waitForLoadState('networkidle');

    // Try submitting empty form
    const submitButton = page.locator('button[type="submit"]').first();

    if (await submitButton.count() > 0) {
      await submitButton.click();
      await page.waitForTimeout(1000);

      // Check for validation errors
      const errors = await page.locator('.error, [data-error], .invalid, .field-error').all();
      console.log(`\n⚠️  Validation errors shown: ${errors.length}`);

      await page.screenshot({
        path: path.join(screenshotDir, '05-cases-validation-errors.png'),
        fullPage: true
      });

      // Check if Zod/Superforms validation is working
      const hasZodError = await page.locator('text=/required|invalid|must be/i').count();
      console.log(`  Zod-style errors: ${hasZodError > 0 ? '✅' : '❌'}`);
    }
  });
});

test.describe('Phase 99: /evidence Route Testing', () => {
  test.beforeEach(async ({ page }) => {
	    await page.goto(`${PORTS.APP_BASE}/evidence`);
    await page.waitForLoadState('networkidle');
  });

  test('should render evidence list page', async ({ page }) => {
    await page.screenshot({
      path: path.join(screenshotDir, '06-evidence-list-initial.png'),
      fullPage: true
    });

    const title = await page.textContent('h1, h2');
    expect(title).toBeTruthy();

    const hasEvidenceList = await page.locator('[data-testid="evidence-list"], .evidence-item, table').count();
    console.log(`📊 Found ${hasEvidenceList} evidence list elements`);

    await page.screenshot({
      path: path.join(screenshotDir, '07-evidence-list-loaded.png'),
      fullPage: true
    });
  });

  test('should test evidence upload form', async ({ page }) => {
    // Try navigating to upload page
    const uploadButton = page.locator('button:has-text("Upload"), a:has-text("Upload"), a[href*="upload"]').first();

    if (await uploadButton.count() > 0) {
      await uploadButton.click();
      await page.waitForLoadState('networkidle');
    } else {
	      await page.goto(`${PORTS.APP_BASE}/evidence/upload`);
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: path.join(screenshotDir, '08-evidence-upload-form.png'),
      fullPage: true
    });

    // Check for upload fields
    const fileInput = await page.locator('input[type="file"]').count();
    const expectedFields = [
      'description',
      'evidence_type',
      'source',
      'chain_of_custody',
      'tags',
      'notes'
    ];

    console.log('\n📤 Evidence Upload Form:');
    console.log(`  File input: ${fileInput > 0 ? '✅' : '❌'}`);

    const missingFields: string[] = [];
    for (const field of expectedFields) {
      const input = await page.locator(`input[name="${field}"], textarea[name="${field}"], select[name="${field}"]`).count();
      if (input === 0) {
        missingFields.push(field);
      }
    }

    console.log(`  Missing fields:`, missingFields);
  });

  test('should check evidence form validation', async ({ page }) => {
	    await page.goto(`${PORTS.APP_BASE}/evidence/upload`);
    await page.waitForLoadState('networkidle');

    const submitButton = page.locator('button[type="submit"]').first();

    if (await submitButton.count() > 0) {
      // Try submitting without file
      await submitButton.click();
      await page.waitForTimeout(1000);

      const errors = await page.locator('.error, [data-error], .invalid').all();
      console.log(`\n⚠️  Evidence validation errors: ${errors.length}`);

      await page.screenshot({
        path: path.join(screenshotDir, '09-evidence-validation-errors.png'),
        fullPage: true
      });
    }
  });
});

test.describe('Phase 99: Database Schema vs Form Fields Analysis', () => {
  test('should generate missing fields report', async ({ page }) => {
    // Database schema fields (from schema-postgres.ts)
    const dbSchema = {
      cases: [
        'id', 'created_at', 'updated_at', 'title', 'case_number', 'description',
        'status', 'priority', 'case_type', 'court_name', 'judge_name',
        'plaintiff_name', 'defendant_name', 'filing_date', 'court_date',
        'trial_date', 'outcome', 'notes', 'metadata', 'user_id'
      ],
      evidence: [
        'id', 'created_at', 'updated_at', 'file_path', 'file_name', 'file_size',
        'mime_type', 'description', 'evidence_type', 'source', 'hash',
        'chain_of_custody', 'tags', 'metadata'
      ]
    };

    const report = {
      timestamp: new Date().toISOString(),
      cases: {
        dbFields: dbSchema.cases,
        formFields: [] as string[],
        missing: [] as string[]
      },
      evidence: {
        dbFields: dbSchema.evidence,
        formFields: [] as string[],
        missing: [] as string[]
      }
    };

    // Navigate to cases form
	    await page.goto(`${PORTS.APP_BASE}/cases/new`);
    await page.waitForLoadState('networkidle');

    // Detect form fields
    const caseInputs = await page.locator('input, textarea, select').all();
    for (const input of caseInputs) {
      const name = await input.getAttribute('name');
      if (name) report.cases.formFields.push(name);
    }

    report.cases.missing = dbSchema.cases.filter(
      field => !report.cases.formFields.includes(field) &&
               !['id', 'created_at', 'updated_at', 'metadata', 'user_id'].includes(field)
    );

    // Navigate to evidence form
	    await page.goto(`${PORTS.APP_BASE}/evidence/upload`);
    await page.waitForLoadState('networkidle');

    const evidenceInputs = await page.locator('input, textarea, select').all();
    for (const input of evidenceInputs) {
      const name = await input.getAttribute('name');
      if (name) report.evidence.formFields.push(name);
    }

    report.evidence.missing = dbSchema.evidence.filter(
      field => !report.evidence.formFields.includes(field) &&
               !['id', 'created_at', 'updated_at', 'metadata', 'file_path', 'file_name', 'file_size', 'mime_type', 'hash'].includes(field)
    );

    console.log('\n📊 PHASE 99: Database vs Form Fields Analysis');
    console.log('═'.repeat(60));
    console.log('\n📁 CASES:');
    console.log(`  DB fields: ${report.cases.dbFields.length}`);
    console.log(`  Form fields: ${report.cases.formFields.length}`);
    console.log(`  Missing in form: ${report.cases.missing.length}`);
    console.log(`  → ${report.cases.missing.join(', ')}`);

    console.log('\n📁 EVIDENCE:');
    console.log(`  DB fields: ${report.evidence.dbFields.length}`);
    console.log(`  Form fields: ${report.evidence.formFields.length}`);
    console.log(`  Missing in form: ${report.evidence.missing.length}`);
    console.log(`  → ${report.evidence.missing.join(', ')}`);

    // Save report
    await page.evaluate((data) => {
      console.log('\n📝 Full Report:', JSON.stringify(data, null, 2));
    }, report);

    expect(report).toBeTruthy();
  });
});
