#!/usr/bin/env node

/**
 * Report Routes Test Suite
 * Tests all report-related API endpoints and UI routes
 *
 * Usage:
 *   node scripts/tests/test-reports.mjs
 *   node scripts/tests/test-reports.mjs --verbose
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const VERBOSE = process.argv.includes('--verbose');
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const TEST_CASE_ID = '5814dc72-fe7e-49ab-b5d2-ff22f2e40ff1';

let testReportId = null;
let passCount = 0;
let failCount = 0;

function log(message) {
  console.log(message);
}

function logVerbose(message) {
  if (VERBOSE) console.log('  ' + message);
}

async function testEndpoint(name, url, options = {}) {
  try {
    const response = await fetch(url, options);
    const status = response.status;
    const contentType = response.headers.get('content-type');

    let body;
    if (contentType?.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    if (status >= 200 && status < 300) {
      passCount++;
      log(`✅ PASS (${status}) ${name}`);
      logVerbose(`Response: ${JSON.stringify(body).substring(0, 100)}...`);
      return { success: true, status, body };
    } else {
      failCount++;
      log(`❌ FAIL (${status}) ${name}`);
      logVerbose(`Response: ${JSON.stringify(body)}`);
      return { success: false, status, body };
    }
  } catch (error) {
    failCount++;
    log(`❌ FAIL (ERROR) ${name}`);
    logVerbose(`Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testPage(name, url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
    const status = response.status();

    if (status >= 200 && status < 300) {
      passCount++;
      log(`✅ PASS (${status}) ${name}`);

      // Check for common error indicators
      const bodyText = await page.textContent('body');
      if (bodyText.includes('500') || bodyText.includes('Internal Server Error')) {
        log(`   ⚠️  Warning: Page loaded but contains error message`);
      }

      await browser.close();
      return { success: true, status };
    } else {
      failCount++;
      log(`❌ FAIL (${status}) ${name}`);
      await browser.close();
      return { success: false, status };
    }
  } catch (error) {
    failCount++;
    log(`❌ FAIL (ERROR) ${name}`);
    logVerbose(`Error: ${error.message}`);
    await browser.close();
    return { success: false, error: error.message };
  }
}

async function runTests() {
  log('\n📋 Testing Report Routes...\n');
  log('='.repeat(60));

  // Test 1: GET /api/reports - List all reports
  log('\n1️⃣  API Endpoints');
  const listResult = await testEndpoint(
    'GET /api/reports (list)',
    `${BASE_URL}/api/reports`
  );

  if (listResult.success && listResult.body.data && listResult.body.data.length > 0) {
    testReportId = listResult.body.data[0].id;
    logVerbose(`Found test report ID: ${testReportId}`);
  }

  // Test 2: POST /api/reports - Create new report
  const createResult = await testEndpoint(
    'POST /api/reports (create)',
    `${BASE_URL}/api/reports`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId: TEST_CASE_ID,
        title: 'Test Report - Automated',
        contentHtml: '<h1>Test Report</h1><p>Created by automated test suite.</p>',
        status: 'draft',
        metadata: { reportType: 'test', automated: true }
      })
    }
  );

  if (createResult.success && createResult.body.data) {
    testReportId = createResult.body.data.id;
    logVerbose(`Created new test report: ${testReportId}`);
  }

  // Test 3: GET /api/reports?caseId=... - Filter by case
  await testEndpoint(
    'GET /api/reports?caseId (filter)',
    `${BASE_URL}/api/reports?caseId=${TEST_CASE_ID}`
  );

  // Test 4: PATCH /api/reports - Bulk update
  if (testReportId) {
    await testEndpoint(
      'PATCH /api/reports (bulk update)',
      `${BASE_URL}/api/reports`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [testReportId],
          title: 'Test Report - Updated',
          status: 'draft'
        })
      }
    );
  }

  // Test 5: POST /api/reports/save - Save report content
  if (testReportId) {
    await testEndpoint(
      'POST /api/reports/save',
      `${BASE_URL}/api/reports/save`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: testReportId,
          title: 'Test Report - Saved',
          contentHtml: '<h1>Updated Content</h1><p>This content was updated by the test suite.</p>'
        })
      }
    );
  }

  // Test 6: POST /api/reports/[id]/publish - Publish report
  if (testReportId) {
    await testEndpoint(
      'POST /api/reports/[id]/publish',
      `${BASE_URL}/api/reports/${testReportId}/publish`,
      { method: 'POST' }
    );
  }

  // Test 7: DELETE /api/reports/[id]/publish - Unpublish report
  if (testReportId) {
    await testEndpoint(
      'DELETE /api/reports/[id]/publish (unpublish)',
      `${BASE_URL}/api/reports/${testReportId}/publish`,
      { method: 'DELETE' }
    );
  }

  // Test 8: GET /api/reports/[id]/export?format=html - Export HTML
  if (testReportId) {
    await testEndpoint(
      'GET /api/reports/[id]/export?format=html',
      `${BASE_URL}/api/reports/${testReportId}/export?format=html`
    );
  }

  // Test 9: GET /api/reports/[id]/export?format=markdown - Export Markdown
  if (testReportId) {
    await testEndpoint(
      'GET /api/reports/[id]/export?format=markdown',
      `${BASE_URL}/api/reports/${testReportId}/export?format=markdown`
    );
  }

  // Test 10: GET /api/reports/[id]/export?format=json - Export JSON
  if (testReportId) {
    await testEndpoint(
      'GET /api/reports/[id]/export?format=json',
      `${BASE_URL}/api/reports/${testReportId}/export?format=json`
    );
  }

  // Test 11: POST /api/reports/generate-from-template - Template generation
  const templateResult = await testEndpoint(
    'POST /api/reports/generate-from-template (template)',
    `${BASE_URL}/api/reports/generate-from-template`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateType: 'summary',
        caseId: TEST_CASE_ID,
        customTitle: 'Automated Template Test',
        useAI: false
      })
    }
  );

  let templateReportId = null;
  if (templateResult.success && templateResult.body.data) {
    templateReportId = templateResult.body.data.id;
  }

  // Test 12: DELETE /api/reports - Bulk delete
  const idsToDelete = [testReportId, templateReportId].filter(Boolean);
  if (idsToDelete.length > 0) {
    await testEndpoint(
      'DELETE /api/reports (bulk delete)',
      `${BASE_URL}/api/reports`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: idsToDelete
        })
      }
    );
  }

  // Test UI Routes
  log('\n2️⃣  UI Routes');

  await testPage(
    'GET /reports (listing page)',
    `${BASE_URL}/reports`
  );

  await testPage(
    'GET /reports/new (creation wizard)',
    `${BASE_URL}/reports/new?caseId=${TEST_CASE_ID}`
  );

  // Re-create a report for view/edit tests
  const recreateResult = await testEndpoint(
    'POST /api/reports (recreate for UI tests)',
    `${BASE_URL}/api/reports`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId: TEST_CASE_ID,
        title: 'Test Report - UI Test',
        contentHtml: '<h1>Test Report</h1><p>For UI testing.</p>',
        status: 'draft'
      })
    }
  );

  if (recreateResult.success && recreateResult.body.data) {
    const uiTestReportId = recreateResult.body.data.id;

    await testPage(
      'GET /reports/[id] (view page)',
      `${BASE_URL}/reports/${uiTestReportId}`
    );

    await testPage(
      'GET /reports/[id]/edit (editor page)',
      `${BASE_URL}/reports/${uiTestReportId}/edit`
    );

    // Clean up UI test report
    await testEndpoint(
      'DELETE /api/reports (cleanup UI test)',
      `${BASE_URL}/api/reports`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [uiTestReportId] })
      }
    );
  }

  // Test Case Integration
  log('\n3️⃣  Case Integration');

  await testPage(
    'GET /cases/[id]/reports (case reports tab)',
    `${BASE_URL}/cases/${TEST_CASE_ID}/reports`
  );

  // Print Summary
  log('\n' + '='.repeat(60));
  log('\n📊 Test Summary\n');
  log(`Total Tests: ${passCount + failCount}`);
  log(`✅ Passed: ${passCount}`);
  log(`❌ Failed: ${failCount}`);

  if (failCount === 0) {
    log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    log(`\n⚠️  ${failCount} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('\n💥 Test suite crashed:');
  console.error(error);
  process.exit(1);
});
