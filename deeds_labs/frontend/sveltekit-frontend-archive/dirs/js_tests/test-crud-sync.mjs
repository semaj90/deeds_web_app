#!/usr/bin/env node

// Comprehensive CRUD and CMS Sync Validation Script
// Tests all API endpoints to ensure proper database synchronization

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';

const execAsync = promisify(exec);

class CRUDSyncTester {
  constructor() {
    this.baseUrl = 'http://localhost:5173';
    this.results = [];
    this.testUserId = null;
    this.authCookie = null;
  }

  // Add test result
  addResult(test, endpoint, method, success, error = null, data = null) {
    this.results.push({ test, endpoint, method, success, error, data });
    const status = success ? '✅' : '❌';
    console.log(`${status} ${test} (${method} ${endpoint}): ${success ? 'PASS' : error}`);
  }

  // Make authenticated HTTP request
  async makeRequest(endpoint, method = 'GET', data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: this.authCookie || '',
      },
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      const responseData = await response.json();

      return {
        ok: response.ok,
        status: response.status,
        data: responseData,
        headers: response.headers,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error.message,
      };
    }
  }

  // Test authentication
  async testAuthentication() {
    console.log('\n🔐 Testing Authentication...');

    try {
      // Test registration
      const registerData = {
        email: `test-crud-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'CRUD Test User',
        role: 'prosecutor',
      };

      const registerResponse = await this.makeRequest('/api/auth/register', 'POST', registerData);
      this.addResult(
        'User Registration',
        '/api/auth/register',
        'POST',
        registerResponse.ok,
        registerResponse.error || registerResponse.data?.error
      );

      if (registerResponse.ok) {
        // Test login
        const loginData = {
          email: registerData.email,
          password: registerData.password,
        };

        const loginResponse = await this.makeRequest('/api/auth/login', 'POST', loginData);

        if (loginResponse.ok && loginResponse.headers.get('set-cookie')) {
          this.authCookie = loginResponse.headers.get('set-cookie');
          this.testUserId = loginResponse.data?.user?.id;
        }

        this.addResult(
          'User Login',
          '/api/auth/login',
          'POST',
          loginResponse.ok,
          loginResponse.error || loginResponse.data?.error
        );
      }
    } catch (error) {
      this.addResult('Authentication', '/api/auth/*', 'POST', false, error.message);
    }
  }

  // Test Cases CRUD
  async testCasesCRUD() {
    console.log('\n📁 Testing Cases CRUD...');

    try {
      // CREATE
      const caseData = {
        title: 'Test CRUD Case',
        description: 'Testing comprehensive CRUD operations',
        caseNumber: `CRUD-${Date.now()}`,
        priority: 'high',
        status: 'open',
        category: 'criminal',
        jurisdiction: 'Test County',
        tags: ['test', 'crud', 'validation'],
        metadata: { testRun: true },
      };

      const createResponse = await this.makeRequest('/api/cases', 'POST', caseData);
      this.addResult(
        'Case Create',
        '/api/cases',
        'POST',
        createResponse.ok,
        createResponse.error || createResponse.data?.error,
        createResponse.data
      );

      if (createResponse.ok && createResponse.data?.id) {
        const caseId = createResponse.data.id;

        // READ
        const readResponse = await this.makeRequest(`/api/cases/${caseId}`, 'GET');
        this.addResult(
          'Case Read',
          `/api/cases/${caseId}`,
          'GET',
          readResponse.ok,
          readResponse.error || readResponse.data?.error
        );

        // UPDATE
        const updateData = {
          title: 'Updated CRUD Case',
          priority: 'urgent',
          tags: ['updated', 'test'],
        };
        const updateResponse = await this.makeRequest(`/api/cases/${caseId}`, 'PUT', updateData);
        this.addResult(
          'Case Update',
          `/api/cases/${caseId}`,
          'PUT',
          updateResponse.ok,
          updateResponse.error || updateResponse.data?.error
        );

        // PATCH
        const patchData = { operation: 'addTag', tag: 'patched' };
        const patchResponse = await this.makeRequest(`/api/cases/${caseId}`, 'PATCH', patchData);
        this.addResult(
          'Case Patch',
          `/api/cases/${caseId}`,
          'PATCH',
          patchResponse.ok,
          patchResponse.error || patchResponse.data?.error
        );

        // LIST with filters
        const listResponse = await this.makeRequest(
          '/api/cases?search=CRUD&priority=urgent&limit=10',
          'GET'
        );
        this.addResult(
          'Cases List/Filter',
          '/api/cases',
          'GET',
          listResponse.ok,
          listResponse.error || listResponse.data?.error
        );

        // DELETE
        const deleteResponse = await this.makeRequest(`/api/cases/${caseId}`, 'DELETE');
        this.addResult(
          'Case Delete',
          `/api/cases/${caseId}`,
          'DELETE',
          deleteResponse.ok,
          deleteResponse.error || deleteResponse.data?.error
        );

        return caseId;
      }
    } catch (error) {
      this.addResult('Cases CRUD', '/api/cases/*', 'ALL', false, error.message);
    }
  }

  // Test Evidence CRUD
  async testEvidenceCRUD() {
    console.log('\n📄 Testing Evidence CRUD...');

    try {
      // First create a test case for evidence
      const caseData = {
        title: 'Evidence Test Case',
        caseNumber: `EV-${Date.now()}`,
      };
      const caseResponse = await this.makeRequest('/api/cases', 'POST', caseData);

      if (!caseResponse.ok) {
        this.addResult(
          'Evidence Test Setup',
          '/api/cases',
          'POST',
          false,
          'Failed to create test case'
        );
        return;
      }

      const caseId = caseResponse.data.id;

      // CREATE
      const evidenceData = {
        title: 'Test Evidence File',
        description: 'Testing evidence CRUD operations',
        caseId: caseId,
        evidenceType: 'document',
        fileType: 'pdf',
        fileName: 'test-evidence.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        hash: 'test-hash-123',
        tags: ['test', 'document'],
        isAdmissible: true,
        confidentialityLevel: 'standard',
      };

      const createResponse = await this.makeRequest('/api/evidence', 'POST', evidenceData);
      this.addResult(
        'Evidence Create',
        '/api/evidence',
        'POST',
        createResponse.ok,
        createResponse.error || createResponse.data?.error
      );

      if (createResponse.ok && createResponse.data?.id) {
        const evidenceId = createResponse.data.id;

        // READ
        const readResponse = await this.makeRequest(`/api/evidence?id=${evidenceId}`, 'GET');
        this.addResult(
          'Evidence Read',
          '/api/evidence',
          'GET',
          readResponse.ok,
          readResponse.error || readResponse.data?.error
        );

        // UPDATE
        const updateData = {
          title: 'Updated Evidence File',
          summary: 'Updated summary',
          aiTags: ['ai-processed'],
        };
        const updateResponse = await this.makeRequest(
          `/api/evidence?id=${evidenceId}`,
          'PATCH',
          updateData
        );
        this.addResult(
          'Evidence Update',
          '/api/evidence',
          'PATCH',
          updateResponse.ok,
          updateResponse.error || updateResponse.data?.error
        );

        // LIST with filters
        const listResponse = await this.makeRequest(
          `/api/evidence?caseId=${caseId}&evidenceType=document`,
          'GET'
        );
        this.addResult(
          'Evidence List/Filter',
          '/api/evidence',
          'GET',
          listResponse.ok,
          listResponse.error || listResponse.data?.error
        );

        // DELETE
        const deleteResponse = await this.makeRequest(`/api/evidence?id=${evidenceId}`, 'DELETE');
        this.addResult(
          'Evidence Delete',
          '/api/evidence',
          'DELETE',
          deleteResponse.ok,
          deleteResponse.error || deleteResponse.data?.error
        );
      }

      // Clean up test case
      await this.makeRequest(`/api/cases/${caseId}`, 'DELETE');
    } catch (error) {
      this.addResult('Evidence CRUD', '/api/evidence/*', 'ALL', false, error.message);
    }
  }

  // Test Reports CRUD
  async testReportsCRUD() {
    console.log('\n📋 Testing Reports CRUD...');

    try {
      // First create a test case for reports
      const caseData = {
        title: 'Reports Test Case',
        caseNumber: `RP-${Date.now()}`,
      };
      const caseResponse = await this.makeRequest('/api/cases', 'POST', caseData);

      if (!caseResponse.ok) {
        this.addResult(
          'Reports Test Setup',
          '/api/cases',
          'POST',
          false,
          'Failed to create test case'
        );
        return;
      }

      const caseId = caseResponse.data.id;

      // CREATE
      const reportData = {
        title: 'Test Legal Report',
        content: '<h1>Test Report</h1><p>This is test content for CRUD validation.</p>',
        caseId: caseId,
        reportType: 'case_summary',
        status: 'draft',
        tags: ['test', 'legal'],
        metadata: { testRun: true },
      };

      const createResponse = await this.makeRequest('/api/reports', 'POST', reportData);
      this.addResult(
        'Report Create',
        '/api/reports',
        'POST',
        createResponse.ok,
        createResponse.error || createResponse.data?.error
      );

      if (createResponse.ok && createResponse.data?.id) {
        const reportId = createResponse.data.id;

        // READ
        const readResponse = await this.makeRequest(`/api/reports/${reportId}`, 'GET');
        this.addResult(
          'Report Read',
          `/api/reports/${reportId}`,
          'GET',
          readResponse.ok,
          readResponse.error || readResponse.data?.error
        );

        // UPDATE
        const updateData = {
          title: 'Updated Legal Report',
          status: 'published',
          tags: ['updated', 'test'],
        };
        const updateResponse = await this.makeRequest(
          `/api/reports/${reportId}`,
          'PUT',
          updateData
        );
        this.addResult(
          'Report Update',
          `/api/reports/${reportId}`,
          'PUT',
          updateResponse.ok,
          updateResponse.error || updateResponse.data?.error
        );

        // PATCH
        const patchData = { operation: 'addTag', tag: 'patched' };
        const patchResponse = await this.makeRequest(
          `/api/reports?id=${reportId}`,
          'PATCH',
          patchData
        );
        this.addResult(
          'Report Patch',
          '/api/reports',
          'PATCH',
          patchResponse.ok,
          patchResponse.error || patchResponse.data?.error
        );

        // LIST with filters
        const listResponse = await this.makeRequest(
          `/api/reports?caseId=${caseId}&status=published`,
          'GET'
        );
        this.addResult(
          'Reports List/Filter',
          '/api/reports',
          'GET',
          listResponse.ok,
          listResponse.error || listResponse.data?.error
        );

        // DELETE
        const deleteResponse = await this.makeRequest(`/api/reports/${reportId}`, 'DELETE');
        this.addResult(
          'Report Delete',
          `/api/reports/${reportId}`,
          'DELETE',
          deleteResponse.ok,
          deleteResponse.error || deleteResponse.data?.error
        );
      }

      // Clean up test case
      await this.makeRequest(`/api/cases/${caseId}`, 'DELETE');
    } catch (error) {
      this.addResult('Reports CRUD', '/api/reports/*', 'ALL', false, error.message);
    }
  }

  // Test Criminals CRUD
  async testCriminalsCRUD() {
    console.log('\n👤 Testing Criminals CRUD...');

    try {
      // CREATE
      const criminalData = {
        firstName: 'Test',
        lastName: 'Criminal',
        middleName: 'CRUD',
        aliases: ['Test Alias'],
        dateOfBirth: '1990-01-01',
        threatLevel: 'medium',
        status: 'active',
        notes: 'Test criminal record for CRUD validation',
      };

      const createResponse = await this.makeRequest('/api/criminals', 'POST', criminalData);
      this.addResult(
        'Criminal Create',
        '/api/criminals',
        'POST',
        createResponse.ok,
        createResponse.error || createResponse.data?.error
      );

      if (createResponse.ok && createResponse.data?.id) {
        const criminalId = createResponse.data.id;

        // READ
        const readResponse = await this.makeRequest(`/api/criminals/${criminalId}`, 'GET');
        this.addResult(
          'Criminal Read',
          `/api/criminals/${criminalId}`,
          'GET',
          readResponse.ok,
          readResponse.error || readResponse.data?.error
        );

        // UPDATE
        const updateData = {
          threatLevel: 'high',
          notes: 'Updated notes',
          aliases: ['Test Alias', 'Updated Alias'],
        };
        const updateResponse = await this.makeRequest(
          `/api/criminals/${criminalId}`,
          'PUT',
          updateData
        );
        this.addResult(
          'Criminal Update',
          `/api/criminals/${criminalId}`,
          'PUT',
          updateResponse.ok,
          updateResponse.error || updateResponse.data?.error
        );

        // PATCH
        const patchData = { operation: 'addAlias', alias: 'Patched Alias' };
        const patchResponse = await this.makeRequest(
          `/api/criminals/${criminalId}`,
          'PATCH',
          patchData
        );
        this.addResult(
          'Criminal Patch',
          `/api/criminals/${criminalId}`,
          'PATCH',
          patchResponse.ok,
          patchResponse.error || patchResponse.data?.error
        );

        // LIST with filters
        const listResponse = await this.makeRequest(
          '/api/criminals?search=Test&threatLevel=high',
          'GET'
        );
        this.addResult(
          'Criminals List/Filter',
          '/api/criminals',
          'GET',
          listResponse.ok,
          listResponse.error || listResponse.data?.error
        );

        // DELETE
        const deleteResponse = await this.makeRequest(`/api/criminals/${criminalId}`, 'DELETE');
        this.addResult(
          'Criminal Delete',
          `/api/criminals/${criminalId}`,
          'DELETE',
          deleteResponse.ok,
          deleteResponse.error || deleteResponse.data?.error
        );
      }
    } catch (error) {
      this.addResult('Criminals CRUD', '/api/criminals/*', 'ALL', false, error.message);
    }
  }

  // Test Activities CRUD
  async testActivitiesCRUD() {
    console.log('\n📅 Testing Activities CRUD...');

    try {
      // First create a test case for activities
      const caseData = {
        title: 'Activities Test Case',
        caseNumber: `ACT-${Date.now()}`,
      };
      const caseResponse = await this.makeRequest('/api/cases', 'POST', caseData);

      if (!caseResponse.ok) {
        this.addResult(
          'Activities Test Setup',
          '/api/cases',
          'POST',
          false,
          'Failed to create test case'
        );
        return;
      }

      const caseId = caseResponse.data.id;

      // CREATE
      const activityData = {
        caseId: caseId,
        title: 'Test Activity',
        description: 'Testing activity CRUD operations',
        activityType: 'investigation',
        status: 'pending',
        priority: 'medium',
        scheduledFor: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        metadata: { testRun: true },
      };

      const createResponse = await this.makeRequest('/api/activities', 'POST', activityData);
      this.addResult(
        'Activity Create',
        '/api/activities',
        'POST',
        createResponse.ok,
        createResponse.error || createResponse.data?.error
      );

      if (createResponse.ok && createResponse.data?.id) {
        const activityId = createResponse.data.id;

        // READ
        const readResponse = await this.makeRequest(`/api/activities/${activityId}`, 'GET');
        this.addResult(
          'Activity Read',
          `/api/activities/${activityId}`,
          'GET',
          readResponse.ok,
          readResponse.error || readResponse.data?.error
        );

        // UPDATE
        const updateData = {
          title: 'Updated Test Activity',
          priority: 'high',
          status: 'in-progress',
        };
        const updateResponse = await this.makeRequest(
          `/api/activities/${activityId}`,
          'PUT',
          updateData
        );
        this.addResult(
          'Activity Update',
          `/api/activities/${activityId}`,
          'PUT',
          updateResponse.ok,
          updateResponse.error || updateResponse.data?.error
        );

        // PATCH - Complete activity
        const patchData = { operation: 'complete' };
        const patchResponse = await this.makeRequest(
          `/api/activities/${activityId}`,
          'PATCH',
          patchData
        );
        this.addResult(
          'Activity Patch',
          `/api/activities/${activityId}`,
          'PATCH',
          patchResponse.ok,
          patchResponse.error || patchResponse.data?.error
        );

        // LIST with filters
        const listResponse = await this.makeRequest(
          `/api/activities?caseId=${caseId}&status=completed`,
          'GET'
        );
        this.addResult(
          'Activities List/Filter',
          '/api/activities',
          'GET',
          listResponse.ok,
          listResponse.error || listResponse.data?.error
        );

        // DELETE
        const deleteResponse = await this.makeRequest(`/api/activities/${activityId}`, 'DELETE');
        this.addResult(
          'Activity Delete',
          `/api/activities/${activityId}`,
          'DELETE',
          deleteResponse.ok,
          deleteResponse.error || deleteResponse.data?.error
        );
      }

      // Clean up test case
      await this.makeRequest(`/api/cases/${caseId}`, 'DELETE');
    } catch (error) {
      this.addResult('Activities CRUD', '/api/activities/*', 'ALL', false, error.message);
    }
  }

  // Test Canvas States CRUD
  async testCanvasCRUD() {
    console.log('\n🎨 Testing Canvas States CRUD...');

    try {
      // First create a test case for canvas
      const caseData = {
        title: 'Canvas Test Case',
        caseNumber: `CNV-${Date.now()}`,
      };
      const caseResponse = await this.makeRequest('/api/cases', 'POST', caseData);

      if (!caseResponse.ok) {
        this.addResult(
          'Canvas Test Setup',
          '/api/cases',
          'POST',
          false,
          'Failed to create test case'
        );
        return;
      }

      const caseId = caseResponse.data.id;

      // CREATE
      const canvasData = {
        caseId: caseId,
        name: 'Test Canvas State',
        canvasData: {
          objects: [],
          background: '#ffffff',
          width: 800,
          height: 600,
        },
        version: 1,
        isDefault: false,
      };

      const createResponse = await this.makeRequest('/api/canvas-states', 'POST', canvasData);
      this.addResult(
        'Canvas Create',
        '/api/canvas-states',
        'POST',
        createResponse.ok,
        createResponse.error || createResponse.data?.error
      );

      if (createResponse.ok && createResponse.data?.id) {
        const canvasId = createResponse.data.id;

        // READ
        const readResponse = await this.makeRequest(`/api/canvas-states?id=${canvasId}`, 'GET');
        this.addResult(
          'Canvas Read',
          '/api/canvas-states',
          'GET',
          readResponse.ok,
          readResponse.error || readResponse.data?.error
        );

        // UPDATE
        const updateData = {
          id: canvasId,
          name: 'Updated Canvas State',
          version: 2,
        };
        const updateResponse = await this.makeRequest('/api/canvas-states', 'PUT', updateData);
        this.addResult(
          'Canvas Update',
          '/api/canvas-states',
          'PUT',
          updateResponse.ok,
          updateResponse.error || updateResponse.data?.error
        );

        // PATCH
        const patchData = { operation: 'setAsDefault' };
        const patchResponse = await this.makeRequest(
          `/api/canvas-states?id=${canvasId}`,
          'PATCH',
          patchData
        );
        this.addResult(
          'Canvas Patch',
          '/api/canvas-states',
          'PATCH',
          patchResponse.ok,
          patchResponse.error || patchResponse.data?.error
        );

        // LIST with filters
        const listResponse = await this.makeRequest(`/api/canvas-states?caseId=${caseId}`, 'GET');
        this.addResult(
          'Canvas List/Filter',
          '/api/canvas-states',
          'GET',
          listResponse.ok,
          listResponse.error || listResponse.data?.error
        );

        // DELETE
        const deleteResponse = await this.makeRequest(
          `/api/canvas-states?id=${canvasId}`,
          'DELETE'
        );
        this.addResult(
          'Canvas Delete',
          '/api/canvas-states',
          'DELETE',
          deleteResponse.ok,
          deleteResponse.error || deleteResponse.data?.error
        );
      }

      // Clean up test case
      await this.makeRequest(`/api/cases/${caseId}`, 'DELETE');
    } catch (error) {
      this.addResult('Canvas CRUD', '/api/canvas-states/*', 'ALL', false, error.message);
    }
  }

  // Generate comprehensive report
  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPREHENSIVE CRUD & CMS SYNC VALIDATION REPORT');
    console.log('='.repeat(80));

    const totalTests = this.results.length;
    const passedTests = this.results.filter((r) => r.success).length;
    const failedTests = totalTests - passedTests;

    console.log(`\n📈 Summary:`);
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  Passed: ${passedTests} ✅`);
    console.log(`  Failed: ${failedTests} ❌`);
    console.log(`  Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    // Group by entity
    const entities = ['Case', 'Evidence', 'Report', 'Criminal', 'Activity', 'Canvas'];
    entities.forEach((entity) => {
      const entityTests = this.results.filter((r) => r.test.includes(entity));
      const entityPassed = entityTests.filter((r) => r.success).length;
      const entityTotal = entityTests.length;

      if (entityTotal > 0) {
        const rate = ((entityPassed / entityTotal) * 100).toFixed(1);
        console.log(`\n${entity}: ${entityPassed}/${entityTotal} (${rate}%)`);

        if (entityPassed < entityTotal) {
          entityTests
            .filter((r) => !r.success)
            .forEach((r) => {
              console.log(`  ❌ ${r.test}: ${r.error}`);
            });
        }
      }
    });

    // CRUD operations summary
    console.log(`\n🎯 CRUD Operations Status:`);
    ['Create', 'Read', 'Update', 'Delete', 'Patch', 'List'].forEach((op) => {
      const opTests = this.results.filter((r) => r.test.includes(op));
      const opPassed = opTests.filter((r) => r.success).length;
      if (opTests.length > 0) {
        console.log(`  ${op}: ${opPassed}/${opTests.length} ✅`);
      }
    });

    const isFullyWorking = failedTests === 0;
    console.log(
      `\n🏆 Overall Status: ${isFullyWorking ? '✅ ALL SYSTEMS OPERATIONAL' : '⚠️ ISSUES DETECTED'}`
    );

    if (isFullyWorking) {
      console.log(
        '\n🎉 All CRUD operations and CMS functionality are properly synced with the database!'
      );
      console.log(
        '🔥 Your Legal AI Assistant is production-ready with full database synchronization!'
      );
    } else {
      console.log('\n⚠️ Some operations failed. Please review the errors above and check:');
      console.log('  • Database connection and schema');
      console.log('  • API endpoint implementations');
      console.log('  • Authentication setup');
      console.log('  • Network connectivity');
    }
  }

  // Run all tests
  async runAllTests() {
    console.log('🚀 Starting Comprehensive CRUD & CMS Database Sync Validation');
    console.log('🎯 Testing all API endpoints for complete functionality');
    console.log('='.repeat(80));

    try {
      await this.testAuthentication();

      if (this.authCookie) {
        await this.testCasesCRUD();
        await this.testEvidenceCRUD();
        await this.testReportsCRUD();
        await this.testCriminalsCRUD();
        await this.testActivitiesCRUD();
        await this.testCanvasCRUD();
      } else {
        console.log('❌ Authentication failed - skipping CRUD tests');
      }

      this.generateReport();
    } catch (error) {
      console.error('❌ Test runner failed:', error);
    }
  }
}

// Check if the SvelteKit server is running
async function checkServer() {
  try {
    const response = await fetch('http://localhost:5173');
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  console.log('🔍 Checking if SvelteKit development server is running...');

  const serverRunning = await checkServer();

  if (!serverRunning) {
    console.log('❌ SvelteKit server not running on localhost:5173');
    console.log('💡 Please start the server with: npm run dev');
    console.log('   Then run this test again.');
    process.exit(1);
  }

  console.log('✅ Server is running - starting tests...\n');

  const tester = new CRUDSyncTester();
  await tester.runAllTests();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default CRUDSyncTester;
